import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3X3,
  LayoutList,
  Search,
  Sparkles,
} from 'lucide-react';
import { SHIFT_DEFINITIONS, WORKING_SHIFTS, getShiftHours } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { ShiftCode, ShiftSwap } from '../types';
import {
  WEEKDAY_SHORT_ES,
  formatMonthTitle,
  getCalendarGridCells,
  getMonthDates,
  getTodayStr,
  getWeekdayShort,
  shiftMonthKey,
} from '../utils/dateUtils';
import { buildMonthIcsContent, downloadIcsFile } from '../utils/icsExport';
import { DayDetailSheet } from '../components/DayDetailSheet';

interface CalendarViewProps {
  mode: 'zeto' | 'team';
  monthKey: string;
  onMonthChange: (nextMonthKey: string) => void;
  onOpenSwap: (date: string, currentShift?: ShiftCode) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  mode,
  monthKey,
  onMonthChange,
  onOpenSwap,
}) => {
  const { users, primaryUser, shifts, swaps, shiftMap, holidaySet, settings } = useApp();
  const [teamDisplay, setTeamDisplay] = useState<'matrix' | 'cards'>('matrix');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ date: string; userId: string } | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const todayStr = getTodayStr();
  const gridCells = useMemo(() => getCalendarGridCells(monthKey), [monthKey]);
  const monthDates = useMemo(() => getMonthDates(monthKey), [monthKey]);

  const swapsByDate = useMemo(() => {
    const map = new Map<string, ShiftSwap[]>();
    const push = (date: string | undefined, sw: ShiftSwap) => {
      if (!date) return;
      const list = map.get(date) ?? [];
      list.push(sw);
      map.set(date, list);
    };
    for (const sw of swaps) {
      push(sw.dateGiven, sw);
      push(sw.dateCovered, sw);
      push(sw.debtDate, sw);
    }
    return map;
  }, [swaps]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.alias && u.alias.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  const zetoMonthSummary = useMemo(() => {
    let hours = 0;
    let workingDays = 0;
    let holidaysWorked = 0;
    for (const d of monthDates) {
      const entry = shiftMap.get(`${primaryUser.id}_${d}`);
      if (!entry) continue;
      const def = SHIFT_DEFINITIONS[entry.shift];
      if (def.isWorking) {
        workingDays++;
        hours += getShiftHours(entry.shift, settings.nightHoursMode).total;
        if (holidaySet.has(d)) holidaysWorked++;
      }
    }
    return { hours, workingDays, holidaysWorked };
  }, [monthDates, shiftMap, primaryUser.id, settings.nightHoursMode, holidaySet]);

  const handleExportIcs = () => {
    const { content, eventsCount } = buildMonthIcsContent({
      monthKey,
      primaryUser,
      allUsers: users,
      allShifts: shifts,
      holidaySet,
    });
    if (eventsCount === 0) {
      setExportNotice(`No hay turnos laborales de ${primaryUser.name} en este mes.`);
      setTimeout(() => setExportNotice(null), 3000);
      return;
    }
    downloadIcsFile(`BEW-${primaryUser.name}-${monthKey}.ics`, content);
    setExportNotice(`Exportados ${eventsCount} turnos a .ics`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  return (
    <div className="space-y-3">
      {/* Navegador de Mes + Exportar .ics */}
      <div className="flex items-center gap-2">
        <div className="flex-1 tactical-card rounded-2xl p-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-200 active:scale-95"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white capitalize">
              {formatMonthTitle(monthKey)}
            </h2>
            <button
              type="button"
              onClick={() => onMonthChange(todayStr.slice(0, 7))}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
            >
              Hoy
            </button>
          </div>

          <button
            type="button"
            onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-200 active:scale-95"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {mode === 'zeto' && (
          <button
            type="button"
            onClick={handleExportIcs}
            title="Exportar turnos de ZETO a Calendario iOS (.ics)"
            className="flex items-center gap-1.5 px-3 py-3 rounded-2xl bg-[#131A26] border border-amber-500/40 text-xs font-bold text-amber-300 active:scale-95 transition-transform"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>.ics</span>
          </button>
        )}
      </div>

      {exportNotice && (
        <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 text-center">
          {exportNotice}
        </div>
      )}

      {mode === 'zeto' ? (
        <>
          {/* Resumen rápido del mes de ZETO */}
          <div className="grid grid-cols-3 gap-2">
            <div className="tactical-card rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Horas {primaryUser.name}</span>
              </div>
              <div className="text-lg font-extrabold text-white mt-0.5">{zetoMonthSummary.hours}h</div>
            </div>
            <div className="tactical-card rounded-2xl px-3 py-2.5">
              <div className="text-[10px] text-slate-400">Turnos mes</div>
              <div className="text-lg font-extrabold text-sky-300 mt-0.5">
                {zetoMonthSummary.workingDays}
              </div>
            </div>
            <div className="tactical-card rounded-2xl px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Sparkles className="w-3 h-3 text-rose-400" />
                <span>Festivos trab.</span>
              </div>
              <div className="text-lg font-extrabold text-rose-300 mt-0.5">
                {zetoMonthSummary.holidaysWorked}
              </div>
            </div>
          </div>

          {/* Cuadrícula mensual visual con celdas coloreadas */}
          <div className="tactical-card rounded-3xl p-3">
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {WEEKDAY_SHORT_ES.map((wd, idx) => (
                <div
                  key={wd}
                  className={`text-center text-[11px] font-bold py-1 ${
                    idx >= 5 ? 'text-amber-400/90' : 'text-slate-400'
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {gridCells.map((dateStr, idx) => {
                if (!dateStr) {
                  return <div key={`empty-${idx}`} className="h-[68px] rounded-2xl bg-slate-900/20" />;
                }

                const dayNum = Number(dateStr.slice(8, 10));
                const entry = shiftMap.get(`${primaryUser.id}_${dateStr}`);
                const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
                const isToday = dateStr === todayStr;
                const isHoliday = holidaySet.has(dateStr);
                const hasSwap = swapsByDate.has(dateStr);

                const cellSurface = hasSwap
                  ? 'bg-gradient-to-b from-fuchsia-500/30 to-fuchsia-900/20 border-fuchsia-400 ring-2 ring-fuchsia-400/65 shadow-md shadow-fuchsia-500/15'
                  : def
                    ? `${def.cellBg} ${def.cellBorder}`
                    : 'bg-slate-900/45 border-slate-800/80';

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedCell({ date: dateStr, userId: primaryUser.id })}
                    className={`relative h-[68px] rounded-2xl p-1.5 flex flex-col items-center justify-between border transition-all active:scale-95 ${cellSurface} ${
                      isToday ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/20' : ''
                    }`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold leading-none ${
                          isToday
                            ? 'text-amber-300'
                            : isHoliday
                              ? 'text-rose-300'
                              : 'text-slate-200'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {hasSwap && (
                          <ArrowLeftRight className="w-3 h-3 text-fuchsia-300" />
                        )}
                        {isHoliday && (
                          <span className="text-[10px] leading-none text-rose-400">★</span>
                        )}
                      </div>
                    </div>

                    {def ? (
                      <>
                        <span
                          className={`text-sm font-extrabold tracking-tight leading-none ${
                            hasSwap ? 'text-white' : def.badgeText
                          }`}
                        >
                          {def.code}
                        </span>
                        <span className="text-[9px] font-medium text-slate-300/80 leading-none">
                          {def.isWorking ? `${def.totalHours}h` : def.shortLabel}
                        </span>
                      </>
                    ) : isHoliday ? (
                      <span className="text-[10px] font-semibold text-rose-300/90 mb-1.5">
                        Festivo
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600 mb-2">—</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Leyenda compacta */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] text-slate-300">
              {WORKING_SHIFTS.map((code) => {
                const d = SHIFT_DEFINITIONS[code];
                return (
                  <span key={code} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${d.dotColor}`} />
                    <strong className={d.badgeText}>{code}</strong> {d.totalHours}h
                  </span>
                );
              })}
              <span className="flex items-center gap-1 text-fuchsia-300 font-semibold">
                <ArrowLeftRight className="w-3 h-3" /> Cambio
              </span>
              <span className="flex items-center gap-1 text-rose-300 font-semibold">
                <span>★</span> Festivo (AD/AN)
              </span>
            </div>
          </div>
        </>
      ) : (
        /* PESTAÑA TODOS / EQUIPO: Consulta completa de todos los compañeros */
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar compañero..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#131A26] border border-slate-800 text-xs text-white placeholder:text-slate-500"
              />
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#131A26] border border-slate-800">
              <button
                type="button"
                onClick={() => setTeamDisplay('matrix')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'matrix' ? 'bg-sky-500 text-[#0B0F17]' : 'text-slate-400'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Matriz</span>
              </button>
              <button
                type="button"
                onClick={() => setTeamDisplay('cards')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'cards' ? 'bg-sky-500 text-[#0B0F17]' : 'text-slate-400'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Tarjetas</span>
              </button>
            </div>
          </div>

          {teamDisplay === 'matrix' ? (
            <div className="tactical-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/95 border-b border-slate-800">
                      <th className="sticky left-0 z-10 bg-[#111827] px-2.5 py-2.5 text-left text-[11px] font-semibold text-slate-300 border-r border-slate-800 min-w-[74px]">
                        Día
                      </th>
                      {filteredUsers.map((u) => (
                        <th
                          key={u.id}
                          className={`px-2 py-2.5 text-center font-bold whitespace-nowrap min-w-[66px] ${
                            u.isPrimary ? 'bg-amber-500/15 text-amber-300' : 'text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: u.color }}
                            />
                            <span className="truncate max-w-[76px]">{u.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {monthDates.map((d) => {
                      const dayNum = Number(d.slice(8, 10));
                      const wd = getWeekdayShort(d);
                      const isToday = d === todayStr;
                      const isHoliday = holidaySet.has(d);
                      const hasSwap = swapsByDate.has(d);

                      return (
                        <tr
                          key={d}
                          className={
                            isToday
                              ? 'bg-amber-500/10'
                              : isHoliday
                                ? 'bg-rose-500/5'
                                : 'hover:bg-slate-900/40'
                          }
                        >
                          <td className="sticky left-0 z-10 bg-[#111827] px-2.5 py-2 border-r border-slate-800 font-medium">
                            <div className="flex items-center justify-between gap-1">
                              <span className={isToday ? 'text-amber-300 font-bold' : 'text-slate-200'}>
                                {dayNum} <span className="text-[10px] text-slate-500">{wd}</span>
                              </span>
                              <div className="flex items-center gap-0.5">
                                {hasSwap && <ArrowLeftRight className="w-2.5 h-2.5 text-fuchsia-300" />}
                                {isHoliday && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                              </div>
                            </div>
                          </td>
                          {filteredUsers.map((u) => {
                            const entry = shiftMap.get(`${u.id}_${d}`);
                            const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
                            const zetoSwapCell = u.isPrimary && hasSwap;

                            return (
                              <td
                                key={`${u.id}_${d}`}
                                className={`p-1 text-center ${
                                  u.isPrimary ? 'bg-amber-500/5' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedCell({ date: d, userId: u.id })}
                                  className={`w-full py-1 rounded-lg flex items-center justify-center active:scale-95 border ${
                                    zetoSwapCell
                                      ? 'bg-fuchsia-500/25 border-fuchsia-400 text-white'
                                      : def
                                        ? `${def.cellBg} ${def.cellBorder}`
                                        : 'border-transparent'
                                  }`}
                                >
                                  {def ? (
                                    <span
                                      className={`text-[11px] font-bold ${
                                        zetoSwapCell ? 'text-white' : def.badgeText
                                      }`}
                                    >
                                      {def.code}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 text-[11px]">·</span>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Tarjetas por día agrupadas por turno */
            <div className="space-y-2">
              {monthDates.map((d) => {
                const dayNum = Number(d.slice(8, 10));
                const wd = getWeekdayShort(d);
                const isToday = d === todayStr;
                const isHoliday = holidaySet.has(d);
                const hasSwap = swapsByDate.has(d);

                const grouped = WORKING_SHIFTS.map((code) => ({
                  code,
                  def: SHIFT_DEFINITIONS[code],
                  assigned: filteredUsers.filter(
                    (u) => shiftMap.get(`${u.id}_${d}`)?.shift === code
                  ),
                })).filter((g) => g.assigned.length > 0);

                return (
                  <div
                    key={d}
                    onClick={() => setSelectedCell({ date: d, userId: primaryUser.id })}
                    className={`tactical-card rounded-2xl p-3 cursor-pointer ${
                      hasSwap
                        ? 'border-fuchsia-400/70 ring-1 ring-fuchsia-400/50'
                        : isToday
                          ? 'ring-1 ring-amber-400/60'
                          : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          {wd} {dayNum}
                        </span>
                        {isToday && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                            Hoy
                          </span>
                        )}
                        {isHoliday && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                            Festivo
                          </span>
                        )}
                        {hasSwap && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 font-semibold">
                            ⇄ Cambio
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">Tocar para editar</span>
                    </div>

                    {grouped.length === 0 ? (
                      <p className="text-[11px] text-slate-500">Sin turnos asignados</p>
                    ) : (
                      <div className="space-y-1.5">
                        {grouped.map((g) => (
                          <div key={g.code} className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border min-w-[34px] text-center ${g.def.badgeBg} ${g.def.badgeText} ${g.def.badgeBorder}`}
                            >
                              {g.code}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {g.assigned.map((u) => (
                                <span
                                  key={u.id}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                    u.isPrimary
                                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-bold'
                                      : 'bg-slate-800/80 border-slate-700 text-slate-200'
                                  }`}
                                >
                                  {u.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedCell && (
        <DayDetailSheet
          date={selectedCell.date}
          targetUserId={selectedCell.userId}
          onClose={() => setSelectedCell(null)}
          onOpenSwap={onOpenSwap}
        />
      )}
    </div>
  );
};
