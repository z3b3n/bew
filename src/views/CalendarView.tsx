import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarPlus,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Grid3X3,
  LayoutList,
  Paintbrush,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  SHIFT_ORDER,
  WORKING_SHIFTS,
  getShiftHours,
} from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { ShiftCode, ShiftSwap } from '../types';
import {
  WEEKDAY_SHORT_ES,
  addDays,
  formatMonthTitle,
  formatShortDateEs,
  getCalendarGridCells,
  getMonthDates,
  getTodayStr,
  getWeekdayShort,
  shiftMonthKey,
} from '../utils/dateUtils';
import { buildMonthIcsContent, downloadIcsFile } from '../utils/icsExport';
import { DayDetailSheet } from '../components/DayDetailSheet';
import { UserModal } from '../components/UserModal';

interface CalendarViewProps {
  mode: 'zeto' | 'team';
  monthKey: string;
  onMonthChange: (nextMonthKey: string) => void;
  onOpenSwap: (date: string, currentShift?: ShiftCode) => void;
  onGoToRoster?: () => void;
}

type PaintBrush = ShiftCode | 'ERASE';

function parseHHMM(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  mode,
  monthKey,
  onMonthChange,
  onOpenSwap,
  onGoToRoster,
}) => {
  const {
    users,
    primaryUser,
    shifts,
    swaps,
    shiftMap,
    holidaySet,
    settings,
    addUser,
    upsertShift,
  } = useApp();

  const [teamDisplay, setTeamDisplay] = useState<'matrix' | 'cards'>('matrix');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ date: string; userId: string } | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [paintMode, setPaintMode] = useState(false);
  const [activeBrush, setActiveBrush] = useState<PaintBrush>('M');
  const [addUserOpen, setAddUserOpen] = useState(false);

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // Datos de HOY y Próximo turno para tarjeta Hero
  const todayEntry = shiftMap.get(`${primaryUser.id}_${todayStr}`);
  const todayDef = todayEntry ? SHIFT_DEFINITIONS[todayEntry.shift] : null;
  const todayIsHoliday = holidaySet.has(todayStr);
  const todayHasSwap = swapsByDate.has(todayStr);

  const todayShiftProgress = useMemo(() => {
    if (!todayDef?.isWorking || !todayDef.startTime || !todayDef.endTime) return null;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = parseHHMM(todayDef.startTime);
    const endMins = parseHHMM(todayDef.endTime) + (todayDef.crossesMidnight ? 24 * 60 : 0);
    if (nowMins < startMins || nowMins > endMins) return null;
    return Math.min(100, Math.max(2, Math.round(((nowMins - startMins) / (endMins - startMins)) * 100)));
  }, [todayDef]);

  const nextShiftSummary = useMemo(() => {
    const tomorrowStr = addDays(todayStr, 1);
    const tomorrowEntry = shiftMap.get(`${primaryUser.id}_${tomorrowStr}`);
    const tomorrowDef = tomorrowEntry ? SHIFT_DEFINITIONS[tomorrowEntry.shift] : null;

    let nextWorking: { date: string; code: ShiftCode; startTime: string } | null = null;
    for (let offset = 1; offset <= 14; offset++) {
      const d = addDays(todayStr, offset);
      const entry = shiftMap.get(`${primaryUser.id}_${d}`);
      if (entry && SHIFT_DEFINITIONS[entry.shift].isWorking) {
        const def = SHIFT_DEFINITIONS[entry.shift];
        nextWorking = { date: d, code: entry.shift, startTime: def.startTime ?? '' };
        break;
      }
    }
    return { tomorrowDef, nextWorking };
  }, [shiftMap, primaryUser.id, todayStr]);

  const todayCoincidences = useMemo(() => {
    if (!todayDef?.isWorking) return [];
    return users.filter(
      (u) => u.id !== primaryUser.id && shiftMap.get(`${u.id}_${todayStr}`)?.shift === todayDef.code
    );
  }, [users, primaryUser.id, shiftMap, todayStr, todayDef]);

  const todayOnDutyGroups = useMemo(() => {
    return WORKING_SHIFTS.map((code) => ({
      code,
      def: SHIFT_DEFINITIONS[code],
      assigned: users.filter((u) => shiftMap.get(`${u.id}_${todayStr}`)?.shift === code),
    })).filter((g) => g.assigned.length > 0);
  }, [users, shiftMap, todayStr]);

  const zetoMonthSummary = useMemo(() => {
    let hours = 0;
    let workingDays = 0;
    let holidaysWorked = 0;
    let assignedCount = 0;
    for (const d of monthDates) {
      const entry = shiftMap.get(`${primaryUser.id}_${d}`);
      if (!entry) continue;
      assignedCount++;
      const def = SHIFT_DEFINITIONS[entry.shift];
      if (def.isWorking) {
        workingDays++;
        hours += getShiftHours(entry.shift, settings.nightHoursMode).total;
        if (holidaySet.has(d)) holidaysWorked++;
      }
    }
    return { hours, workingDays, holidaysWorked, assignedCount };
  }, [monthDates, shiftMap, primaryUser.id, settings.nightHoursMode, holidaySet]);

  const handleCellAction = (date: string, userId: string) => {
    if (paintMode) {
      void upsertShift(userId, date, activeBrush === 'ERASE' ? null : activeBrush);
      return;
    }
    setSelectedCell({ date, userId });
  };

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

  const handleGridTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleGridTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.abs(dx) > 65 && Math.abs(dy) < 42) {
      onMonthChange(shiftMonthKey(monthKey, dx < 0 ? 1 : -1));
    }
  };

  return (
    <div className="space-y-3">
      {mode === 'zeto' ? (
        /* TARJETA HERO "HOY" + Próximo turno */
        <button
          type="button"
          onClick={() => setSelectedCell({ date: todayStr, userId: primaryUser.id })}
          className={`w-full text-left rounded-3xl p-4 border bg-gradient-to-br shadow-xl transition-transform active:scale-[0.99] ${
            todayDef
              ? todayDef.heroGradient
              : 'from-slate-800/70 via-slate-900/80 to-slate-950 border-white/12'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/15">
                  HOY · {formatShortDateEs(todayStr)}
                </span>
                {todayIsHoliday && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-400/40">
                    ★ Festivo
                  </span>
                )}
                {todayHasSwap && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/40">
                    ⇄ Cambio
                  </span>
                )}
              </div>

              <div className="mt-2">
                {todayDef ? (
                  <>
                    <div className="text-xl font-extrabold text-white">{todayDef.label}</div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      {todayDef.isWorking
                        ? `${todayDef.startTime} – ${todayDef.endTime} · ${todayDef.totalHours}h`
                        : 'Sin servicio programado'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-white">Sin turno asignado hoy</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Toca para asignar tu turno de hoy
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end">
              <div
                className={`w-14 h-14 rounded-2xl border flex items-center justify-center text-xl font-black shadow-inner ${
                  todayDef
                    ? `${todayDef.badgeBg} ${todayDef.badgeText} ${todayDef.badgeBorder}`
                    : 'bg-slate-900/70 border-slate-700 text-slate-500'
                }`}
              >
                {todayDef ? todayDef.code : '—'}
              </div>
            </div>
          </div>

          {todayShiftProgress !== null && (
            <div className="mt-2.5 space-y-1">
              <div className="h-1.5 rounded-full bg-black/35 overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{ width: `${todayShiftProgress}%` }}
                />
              </div>
              <div className="text-[10px] text-amber-200/80 text-right tabular-nums">
                En servicio · {todayShiftProgress}% completado
              </div>
            </div>
          )}

          {(nextShiftSummary.tomorrowDef || nextShiftSummary.nextWorking) && (
            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px] text-slate-300 flex-wrap">
              <span>
                Mañana:{' '}
                <strong className="text-white">
                  {nextShiftSummary.tomorrowDef
                    ? `${nextShiftSummary.tomorrowDef.code} (${nextShiftSummary.tomorrowDef.shortLabel})`
                    : 'Sin asignar'}
                </strong>
              </span>
              {nextShiftSummary.nextWorking && (
                <span className="text-amber-200/90">
                  Próximo servicio:{' '}
                  <strong>
                    {formatShortDateEs(nextShiftSummary.nextWorking.date)} (
                    {nextShiftSummary.nextWorking.code} · {nextShiftSummary.nextWorking.startTime})
                  </strong>
                </span>
              )}
            </div>
          )}

          {todayCoincidences.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
              <Users className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="text-[11px] text-slate-300">Contigo hoy:</span>
              {todayCoincidences.map((u) => (
                <span
                  key={u.id}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/30 border border-white/10 text-slate-100"
                >
                  {u.name}
                </span>
              ))}
            </div>
          )}
        </button>
      ) : (
        /* TARJETA "DE SERVICIO HOY" EN PESTAÑA TODOS */
        <div className="tactical-card rounded-3xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <span>De servicio hoy ({formatShortDateEs(todayStr)})</span>
            </span>
            {todayIsHoliday && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40">
                ★ Festivo
              </span>
            )}
          </div>

          {todayOnDutyGroups.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              No hay turnos asignados para hoy todavía. Escanea un cuadrante o toca cualquier celda.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {todayOnDutyGroups.map((g) => (
                <div
                  key={g.code}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border ${g.def.badgeBg} ${g.def.badgeBorder}`}
                >
                  <span className={`text-[11px] font-extrabold ${g.def.badgeText}`}>{g.code}</span>
                  <span className="text-[11px] text-slate-200">
                    {g.assigned.map((u) => u.name).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navegador de Mes + Pintar + Exportar .ics */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 tactical-card rounded-2xl p-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-200 active:scale-95"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-white capitalize">
              {formatMonthTitle(monthKey)}
            </h2>
            <button
              type="button"
              onClick={() => onMonthChange(todayStr.slice(0, 7))}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/10"
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

        {(mode === 'zeto' || teamDisplay === 'matrix') && (
          <button
            type="button"
            onClick={() => setPaintMode((p) => !p)}
            title="Modo pintar turnos rápido"
            className={`flex items-center gap-1 px-3 py-3 rounded-2xl border text-xs font-bold active:scale-95 transition-all ${
              paintMode
                ? 'bg-amber-500 text-[#070B12] border-amber-300 shadow-lg shadow-amber-500/25'
                : 'tactical-card border-white/15 text-slate-200'
            }`}
          >
            <Paintbrush className="w-4 h-4" />
            <span className="hidden sm:inline">{paintMode ? 'Listo' : 'Pintar'}</span>
          </button>
        )}

        {mode === 'zeto' && (
          <button
            type="button"
            onClick={handleExportIcs}
            title="Exportar turnos de ZETO a Calendario iOS (.ics)"
            className="flex items-center gap-1 px-3 py-3 rounded-2xl tactical-card border-amber-500/40 text-xs font-bold text-amber-300 active:scale-95 transition-transform"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>.ics</span>
          </button>
        )}
      </div>

      {/* Paleta rápida de Pintado */}
      {paintMode && (mode === 'zeto' || teamDisplay === 'matrix') && (
        <div className="tactical-card rounded-2xl p-2.5 border-amber-500/40 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-300 font-bold">
              Modo Pintar activo: toca cualquier celda para asignar
            </span>
            <button
              type="button"
              onClick={() => setPaintMode(false)}
              className="text-slate-300 font-semibold px-2 py-0.5 rounded bg-slate-800"
            >
              Cerrar
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {([...SHIFT_ORDER, 'F'] as ShiftCode[]).map((code) => {
              const d = SHIFT_DEFINITIONS[code];
              const active = activeBrush === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveBrush(code)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl border text-xs font-extrabold transition-transform ${
                    active
                      ? `${d.badgeBg} ${d.badgeText} ring-2 ring-amber-400 scale-105`
                      : `${d.badgeBg} ${d.badgeText} ${d.badgeBorder} opacity-75`
                  }`}
                >
                  {code}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActiveBrush('ERASE')}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold ${
                activeBrush === 'ERASE'
                  ? 'bg-rose-500/25 border-rose-400 text-rose-200 ring-2 ring-rose-400'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Borrar</span>
            </button>
          </div>
        </div>
      )}

      {exportNotice && (
        <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 text-center">
          {exportNotice}
        </div>
      )}

      {mode === 'zeto' ? (
        <>
          {/* Resumen rápido del mes de ZETO */}
          <div className="grid grid-cols-3 gap-2">
            <div className="tactical-card rounded-2xl px-3 py-2.5 border-amber-500/25">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Horas mes</span>
              </div>
              <div className="text-lg font-extrabold text-amber-300 mt-0.5 tabular-nums">
                {zetoMonthSummary.hours}h
              </div>
            </div>
            <div className="tactical-card rounded-2xl px-3 py-2.5 border-sky-500/25">
              <div className="text-[10px] text-slate-400">Turnos</div>
              <div className="text-lg font-extrabold text-sky-300 mt-0.5 tabular-nums">
                {zetoMonthSummary.workingDays}
              </div>
            </div>
            <div className="tactical-card rounded-2xl px-3 py-2.5 border-rose-500/25">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Sparkles className="w-3 h-3 text-rose-400" />
                <span>Festivos trab.</span>
              </div>
              <div className="text-lg font-extrabold text-rose-300 mt-0.5 tabular-nums">
                {zetoMonthSummary.holidaysWorked}
              </div>
            </div>
          </div>

          {zetoMonthSummary.assignedCount === 0 && onGoToRoster && (
            <div className="tactical-card rounded-2xl p-3 border-amber-500/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-slate-300">
                Este mes aún está vacío. Sube la foto del cuadrante o píntalo a mano.
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onGoToRoster}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-[#070B12] text-xs font-bold"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Escanear foto</span>
                </button>
              </div>
            </div>
          )}

          {/* Cuadrícula mensual visual con swipe horizontal */}
          <div
            className="tactical-card rounded-3xl p-3"
            onTouchStart={handleGridTouchStart}
            onTouchEnd={handleGridTouchEnd}
          >
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
                  ? 'bg-gradient-to-b from-fuchsia-500/35 to-fuchsia-900/25 border-fuchsia-400 ring-2 ring-fuchsia-400/70 shadow-md shadow-fuchsia-500/20'
                  : def
                    ? `${def.cellBg} ${def.cellBorder}`
                    : isHoliday
                      ? 'bg-gradient-to-b from-rose-500/18 to-rose-900/10 border-rose-500/40'
                      : 'bg-slate-900/45 border-white/8';

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => handleCellAction(dateStr, primaryUser.id)}
                    className={`relative h-[68px] rounded-2xl p-1.5 flex flex-col items-center justify-between border transition-all active:scale-95 ${cellSurface} ${
                      isToday ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/25' : ''
                    }`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold leading-none tabular-nums ${
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
                        {hasSwap && <ArrowLeftRight className="w-3 h-3 text-fuchsia-300" />}
                        {isHoliday && (
                          <span className="text-[10px] leading-none text-rose-400">★</span>
                        )}
                      </div>
                    </div>

                    {def ? (
                      <>
                        <span
                          className={`text-sm font-black tracking-tight leading-none ${
                            hasSwap ? 'text-white' : def.badgeText
                          }`}
                        >
                          {def.code}
                        </span>
                        <span className="text-[9px] font-medium text-slate-300/85 leading-none">
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
            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] text-slate-300">
              {WORKING_SHIFTS.map((code) => {
                const d = SHIFT_DEFINITIONS[code];
                return (
                  <span key={code} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${d.dotColor}`} />
                    <strong className={d.badgeText}>{code}</strong> {d.totalHours}h
                  </span>
                );
              })}
              {(['C', 'PO', 'AP'] as ShiftCode[]).map((code) => {
                const d = SHIFT_DEFINITIONS[code];
                return (
                  <span key={code} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${d.dotColor}`} />
                    <strong className={d.badgeText}>{code}</strong>
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
        /* PESTAÑA TODOS / EQUIPO: Consulta completa con columna Día + ZETO fijadas */
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar compañero..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0F1623] border border-white/10 text-xs text-white placeholder:text-slate-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setAddUserOpen(true)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500 text-[#070B12] text-xs font-bold shrink-0 active:scale-95"
              title="Añadir compañero"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+</span>
            </button>

            <div className="inline-flex p-1 rounded-xl bg-[#0F1623] border border-white/10">
              <button
                type="button"
                onClick={() => setTeamDisplay('matrix')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'matrix' ? 'bg-sky-500 text-[#070B12]' : 'text-slate-400'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Matriz</span>
              </button>
              <button
                type="button"
                onClick={() => setTeamDisplay('cards')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                  teamDisplay === 'cards' ? 'bg-sky-500 text-[#070B12]' : 'text-slate-400'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Tarjetas</span>
              </button>
            </div>
          </div>

          {teamDisplay === 'matrix' ? (
            <div className="tactical-card rounded-2xl overflow-hidden">
              <div className="overflow-auto max-h-[65dvh]">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#0B111C] border-b border-white/10">
                      <th className="sticky left-0 z-30 bg-[#0D131F] px-2.5 py-2.5 text-left text-[11px] font-semibold text-slate-300 border-r border-white/10 w-[74px] min-w-[74px]">
                        Día
                      </th>
                      {filteredUsers.map((u, idx) => {
                        const isStickyPrimary = u.isPrimary && idx === 0;
                        return (
                          <th
                            key={u.id}
                            className={`px-2 py-2.5 text-center font-bold whitespace-nowrap min-w-[68px] ${
                              isStickyPrimary
                                ? 'sticky left-[74px] z-30 bg-[#141A26] text-amber-300 border-r border-amber-500/25'
                                : u.isPrimary
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-[#0B111C] text-slate-200'
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
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {monthDates.map((d) => {
                      const dayNum = Number(d.slice(8, 10));
                      const wd = getWeekdayShort(d);
                      const isToday = d === todayStr;
                      const isHoliday = holidaySet.has(d);
                      const hasSwap = swapsByDate.has(d);
                      const zetoEntry = shiftMap.get(`${primaryUser.id}_${d}`);
                      const zetoWorkingShift =
                        zetoEntry && SHIFT_DEFINITIONS[zetoEntry.shift].isWorking
                          ? zetoEntry.shift
                          : null;

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
                          <td className="sticky left-0 z-10 bg-[#0D131F] px-2.5 py-2 border-r border-white/10 font-medium w-[74px] min-w-[74px]">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`tabular-nums ${
                                  isToday ? 'text-amber-300 font-bold' : 'text-slate-200'
                                }`}
                              >
                                {dayNum} <span className="text-[10px] text-slate-500">{wd}</span>
                              </span>
                              <div className="flex items-center gap-0.5">
                                {hasSwap && <ArrowLeftRight className="w-2.5 h-2.5 text-fuchsia-300" />}
                                {isHoliday && (
                                  <span className="text-[9px] text-rose-400">★</span>
                                )}
                              </div>
                            </div>
                          </td>
                          {filteredUsers.map((u, idx) => {
                            const entry = shiftMap.get(`${u.id}_${d}`);
                            const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
                            const zetoSwapCell = u.isPrimary && hasSwap;
                            const isStickyPrimary = u.isPrimary && idx === 0;
                            const coincidesWithZeto =
                              !u.isPrimary && zetoWorkingShift !== null && entry?.shift === zetoWorkingShift;

                            return (
                              <td
                                key={`${u.id}_${d}`}
                                className={`p-1 text-center ${
                                  isStickyPrimary
                                    ? 'sticky left-[74px] z-10 bg-[#101827] border-r border-amber-500/20'
                                    : u.isPrimary
                                      ? 'bg-amber-500/5'
                                      : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCellAction(d, u.id)}
                                  className={`w-full py-1 rounded-lg flex items-center justify-center active:scale-95 border ${
                                    zetoSwapCell
                                      ? 'bg-fuchsia-500/25 border-fuchsia-400 text-white'
                                      : def
                                        ? `${def.cellBg} ${def.cellBorder} ${
                                            coincidesWithZeto ? 'ring-1 ring-amber-400/55' : ''
                                          }`
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
                            ★ Festivo
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

      {addUserOpen && (
        <UserModal
          defaultColorIndex={users.length}
          onClose={() => setAddUserOpen(false)}
          onSave={async (data) => {
            await addUser(data);
          }}
        />
      )}
    </div>
  );
};
