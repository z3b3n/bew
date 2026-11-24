import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3X3,
  LayoutList,
  Sparkles,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { SHIFT_DEFINITIONS, WORKING_SHIFTS, getShiftHours } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { ShiftCode } from '../types';
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
  monthKey: string;
  onMonthChange: (nextMonthKey: string) => void;
  onOpenSwap: (date: string, currentShift?: ShiftCode) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  monthKey,
  onMonthChange,
  onOpenSwap,
}) => {
  const { users, primaryUser, shifts, shiftMap, holidaySet, settings } = useApp();
  const [viewScope, setViewScope] = useState<'zeto' | 'all'>('zeto');
  const [teamDisplay, setTeamDisplay] = useState<'matrix' | 'cards'>('matrix');
  const [selectedCell, setSelectedCell] = useState<{ date: string; userId: string } | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const todayStr = getTodayStr();
  const gridCells = useMemo(() => getCalendarGridCells(monthKey), [monthKey]);
  const monthDates = useMemo(() => getMonthDates(monthKey), [monthKey]);

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
      {/* Filtro rápido Solo ZETO / Todos */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 p-1 rounded-2xl bg-[#131A26] border border-slate-800">
          <button
            type="button"
            onClick={() => setViewScope('zeto')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
              viewScope === 'zeto'
                ? 'bg-amber-500 text-[#0B0F17] shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Solo {primaryUser.name}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewScope('all')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
              viewScope === 'all'
                ? 'bg-sky-500 text-[#0B0F17] shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Todos ({users.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportIcs}
          title="Exportar turnos de ZETO a Calendario iOS (.ics)"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-[#131A26] border border-slate-700/80 text-xs font-semibold text-amber-300 hover:border-amber-500/50 active:scale-95 transition-transform"
        >
          <CalendarPlus className="w-4 h-4" />
          <span>.ics</span>
        </button>
      </div>

      {exportNotice && (
        <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 text-center">
          {exportNotice}
        </div>
      )}

      {/* Navegador de Mes */}
      <div className="tactical-card rounded-2xl p-2.5 flex items-center justify-between">
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

      {/* Resumen rápido del mes de ZETO */}
      <div className="grid grid-cols-3 gap-2">
        <div className="tactical-card rounded-2xl px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Horas {primaryUser.name}</span>
          </div>
          <div className="text-base font-bold text-white mt-0.5">{zetoMonthSummary.hours}h</div>
        </div>
        <div className="tactical-card rounded-2xl px-3 py-2">
          <div className="text-[10px] text-slate-400">Turnos mes</div>
          <div className="text-base font-bold text-sky-300 mt-0.5">
            {zetoMonthSummary.workingDays}
          </div>
        </div>
        <div className="tactical-card rounded-2xl px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Sparkles className="w-3 h-3 text-rose-400" />
            <span>Festivos trab.</span>
          </div>
          <div className="text-base font-bold text-rose-300 mt-0.5">
            {zetoMonthSummary.holidaysWorked}
          </div>
        </div>
      </div>

      {viewScope === 'zeto' ? (
        /* VISTA SOLO ZETO: Cuadrícula mensual limpia */
        <div className="tactical-card rounded-2xl p-2.5">
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {WEEKDAY_SHORT_ES.map((wd, idx) => (
              <div
                key={wd}
                className={`text-center text-[11px] font-semibold py-1 ${
                  idx >= 5 ? 'text-amber-400/80' : 'text-slate-400'
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gridCells.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`empty-${idx}`} className="h-[58px] rounded-xl bg-slate-900/20" />;
              }

              const dayNum = Number(dateStr.slice(8, 10));
              const entry = shiftMap.get(`${primaryUser.id}_${dateStr}`);
              const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
              const isToday = dateStr === todayStr;
              const isHoliday = holidaySet.has(dateStr);

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedCell({ date: dateStr, userId: primaryUser.id })}
                  className={`relative h-[58px] rounded-xl p-1 flex flex-col items-center justify-between border transition-all active:scale-95 ${
                    isToday
                      ? 'border-amber-400 ring-1 ring-amber-400/50 bg-amber-500/5'
                      : isHoliday
                        ? 'border-rose-500/40 bg-rose-500/5'
                        : 'border-slate-800/80 bg-slate-900/55 hover:border-slate-700'
                  }`}
                >
                  <div className="w-full flex items-center justify-between px-0.5">
                    <span
                      className={`text-[11px] font-semibold ${
                        isToday
                          ? 'text-amber-300'
                          : isHoliday
                            ? 'text-rose-300'
                            : 'text-slate-300'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {isHoliday && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                  </div>

                  {def ? (
                    <span
                      className={`w-full text-center py-0.5 rounded-lg text-[11px] font-bold border ${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`}
                    >
                      {def.code}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* VISTA TODOS: Matriz desplazable o Tarjetas por día */
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-400">Cuadrante completo del equipo</span>
            <div className="inline-flex p-0.5 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setTeamDisplay('matrix')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'matrix' ? 'bg-slate-700 text-white' : 'text-slate-400'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Matriz</span>
              </button>
              <button
                type="button"
                onClick={() => setTeamDisplay('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'cards' ? 'bg-slate-700 text-white' : 'text-slate-400'
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
                    <tr className="bg-slate-900/90 border-b border-slate-800">
                      <th className="sticky left-0 z-10 bg-[#111827] px-2.5 py-2.5 text-left text-[11px] font-semibold text-slate-300 border-r border-slate-800 min-w-[74px]">
                        Día
                      </th>
                      {users.map((u) => (
                        <th
                          key={u.id}
                          className={`px-2 py-2.5 text-center font-bold whitespace-nowrap min-w-[68px] ${
                            u.isPrimary ? 'bg-amber-500/10 text-amber-300' : 'text-slate-200'
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

                      return (
                        <tr
                          key={d}
                          className={
                            isToday
                              ? 'bg-amber-500/5'
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
                              {isHoliday && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                            </div>
                          </td>
                          {users.map((u) => {
                            const entry = shiftMap.get(`${u.id}_${d}`);
                            const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
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
                                  className="w-full py-1 rounded-lg flex items-center justify-center active:scale-95"
                                >
                                  {def ? (
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`}
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

                const grouped = WORKING_SHIFTS.map((code) => ({
                  code,
                  def: SHIFT_DEFINITIONS[code],
                  assigned: users.filter((u) => shiftMap.get(`${u.id}_${d}`)?.shift === code),
                })).filter((g) => g.assigned.length > 0);

                return (
                  <div
                    key={d}
                    onClick={() => setSelectedCell({ date: d, userId: primaryUser.id })}
                    className={`tactical-card rounded-2xl p-3 cursor-pointer ${
                      isToday ? 'ring-1 ring-amber-400/60' : ''
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
