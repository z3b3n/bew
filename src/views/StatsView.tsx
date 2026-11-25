import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Sparkles, Sun } from 'lucide-react';
import { SHIFT_DEFINITIONS, WORKING_SHIFTS } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import { MONTH_NAMES_ES } from '../utils/dateUtils';
import { computeUserStats, type StatsPeriodType } from '../utils/statsCalc';

export const StatsView: React.FC = () => {
  const { users, primaryUser, shifts, holidaySet, settings } = useApp();
  const now = new Date();

  const [selectedUserId, setSelectedUserId] = useState(primaryUser.id);
  const [periodType, setPeriodType] = useState<StatsPeriodType>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1..12
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  );

  const stats = useMemo(
    () =>
      computeUserStats({
        userId: selectedUserId,
        periodType,
        year,
        month,
        quarter,
        shifts,
        holidaySet,
        nightHoursMode: settings.nightHoursMode,
      }),
    [selectedUserId, periodType, year, month, quarter, shifts, holidaySet, settings.nightHoursMode]
  );

  const stepPeriod = (delta: number) => {
    if (periodType === 'month') {
      const d = new Date(year, month - 1 + delta, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth() + 1);
    } else if (periodType === 'quarter') {
      const totalQ = year * 4 + (quarter - 1) + delta;
      setYear(Math.floor(totalQ / 4));
      setQuarter(((totalQ % 4 + 4) % 4 + 1) as 1 | 2 | 3 | 4);
    } else {
      setYear((y) => y + delta);
    }
  };

  const periodLabel =
    periodType === 'month'
      ? `${MONTH_NAMES_ES[month - 1]} ${year}`
      : periodType === 'quarter'
        ? `T${quarter} ${year}`
        : `Año ${year}`;

  const dayPct = stats.totalHours > 0 ? Math.round((stats.dayHours / stats.totalHours) * 100) : 0;
  const nightPct = stats.totalHours > 0 ? 100 - dayPct : 0;

  // Donut SVG para distribución de turnos
  const totalShiftCount = WORKING_SHIFTS.reduce((acc, code) => acc + stats.shiftCounts[code], 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;
  const donutSegments = WORKING_SHIFTS.map((code) => {
    const count = stats.shiftCounts[code];
    const ratio = totalShiftCount > 0 ? count / totalShiftCount : 0;
    const dash = ratio * circumference;
    const seg = {
      code,
      count,
      hours: stats.shiftHours[code],
      color: SHIFT_DEFINITIONS[code].hex,
      dash,
      offset: -accumulatedOffset,
    };
    accumulatedOffset += dash;
    return seg;
  });

  const maxBarHours = Math.max(10, ...stats.series.map((p) => p.totalHours));

  return (
    <div className="space-y-3.5">
      {/* Selector de usuario + periodo */}
      <div className="tactical-card rounded-2xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Usuario</span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} {u.isPrimary ? '(Principal)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {(['month', 'quarter', 'year'] as const).map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setPeriodType(pt)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                periodType === pt ? 'bg-amber-500 text-[#0B0F17]' : 'text-slate-400'
              }`}
            >
              {pt === 'month' ? 'Mes' : pt === 'quarter' ? 'Trimestre' : 'Año'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => stepPeriod(-1)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white">{periodLabel}</span>
          <button
            type="button"
            onClick={() => stepPeriod(1)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Principal: Total Horas + Diurnas/Nocturnas */}
      <div className="rounded-3xl p-4 border border-amber-400/30 bg-gradient-to-br from-amber-500/15 via-slate-900/90 to-indigo-500/15 shadow-xl space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs text-slate-300">Total horas trabajadas</div>
            <div className="text-3xl font-black text-white mt-0.5 tabular-nums">
              {stats.totalHours}h
            </div>
          </div>
          <div className="text-right text-xs text-slate-300 tabular-nums">
            <div>{stats.workingDays} turnos</div>
            <div className="text-slate-400">{stats.freeDays} libres</div>
          </div>
        </div>

        {/* Barra apilada Diurnas / Nocturnas */}
        <div className="space-y-1.5">
          <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
            <div
              className="bg-amber-400 h-full transition-all"
              style={{ width: `${dayPct}%` }}
            />
            <div
              className="bg-indigo-400 h-full transition-all"
              style={{ width: `${nightPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-amber-300 font-semibold">
              <Sun className="w-3.5 h-3.5" /> Diurnas: {stats.dayHours}h ({dayPct}%)
            </span>
            <span className="flex items-center gap-1 text-indigo-300 font-semibold">
              <Moon className="w-3.5 h-3.5" /> Nocturnas: {stats.nightHours}h ({nightPct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Festivos trabajados vs Días libres */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="tactical-card rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-rose-300 font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>Festivos trabajados</span>
          </div>
          <div className="text-2xl font-bold text-white mt-1">{stats.holidaysWorked}</div>
          <div className="text-[11px] text-slate-400">
            {stats.holidaysFree} festivos librados
          </div>
        </div>
        <div className="tactical-card rounded-2xl p-3.5">
          <div className="text-xs text-emerald-300 font-semibold">Días libres (L/F)</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.freeDays}</div>
          <div className="text-[11px] text-slate-400">En cuadrante del periodo</div>
        </div>
      </div>

      {/* Permisos y Cursos (C / PO / AP) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="tactical-card rounded-2xl px-3 py-2.5 border-orange-500/25">
          <div className="text-[10px] text-orange-300 font-semibold">Curso (C)</div>
          <div className="text-lg font-extrabold text-white mt-0.5 tabular-nums">
            {stats.absenceCounts.C}
          </div>
        </div>
        <div className="tactical-card rounded-2xl px-3 py-2.5 border-teal-500/25">
          <div className="text-[10px] text-teal-300 font-semibold">P. Oficial (PO)</div>
          <div className="text-lg font-extrabold text-white mt-0.5 tabular-nums">
            {stats.absenceCounts.PO}
          </div>
        </div>
        <div className="tactical-card rounded-2xl px-3 py-2.5 border-cyan-500/25">
          <div className="text-[10px] text-cyan-300 font-semibold">As. Propios (AP)</div>
          <div className="text-lg font-extrabold text-white mt-0.5 tabular-nums">
            {stats.absenceCounts.AP}
          </div>
        </div>
      </div>

      {/* Conteo exacto + Donut */}
      <div className="tactical-card rounded-2xl p-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Distribución por tipo de turno
        </h3>

        <div className="flex items-center gap-4">
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 112 112" className="w-28 h-28 -rotate-90">
              <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke="#1E293B"
                strokeWidth="14"
              />
              {donutSegments.map((seg) =>
                seg.count > 0 ? (
                  <circle
                    key={seg.code}
                    cx="56"
                    cy="56"
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={`${seg.dash} ${circumference}`}
                    strokeDashoffset={seg.offset}
                  />
                ) : null
              )}
            </svg>
            <div className="absolute text-center">
              <div className="text-base font-bold text-white">{totalShiftCount}</div>
              <div className="text-[10px] text-slate-400">turnos</div>
            </div>
          </div>

          <div className="flex-1 space-y-1.5">
            {WORKING_SHIFTS.map((code) => {
              const def = SHIFT_DEFINITIONS[code];
              return (
                <div key={code} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: def.hex }}
                    />
                    <span className="font-semibold text-slate-200">
                      {code} · {def.shortLabel}
                    </span>
                  </div>
                  <div className="text-slate-300 font-mono">
                    <strong className="text-white">{stats.shiftCounts[code]}</strong>{' '}
                    <span className="text-slate-500">({stats.shiftHours[code]}h)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gráfico de barras temporal */}
      <div className="tactical-card rounded-2xl p-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          {periodType === 'month' ? 'Horas por semana' : 'Horas por mes'}
        </h3>

        <div className="h-36 flex items-end justify-between gap-1.5 pt-4">
          {stats.series.map((pt) => {
            const totalPct = Math.round((pt.totalHours / maxBarHours) * 100);
            const nightPartPct =
              pt.totalHours > 0 ? Math.round((pt.nightHours / pt.totalHours) * 100) : 0;
            return (
              <div key={pt.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] text-slate-400 font-mono">
                  {pt.totalHours > 0 ? `${pt.totalHours}` : ''}
                </span>
                <div className="w-full max-w-[28px] h-24 bg-slate-900/90 rounded-t-lg overflow-hidden flex flex-col justify-end">
                  <div
                    className="w-full bg-amber-400 rounded-t-md flex flex-col justify-end overflow-hidden transition-all"
                    style={{ height: `${totalPct}%` }}
                  >
                    {nightPartPct > 0 && (
                      <div
                        className="w-full bg-indigo-400"
                        style={{ height: `${nightPartPct}%` }}
                      />
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{pt.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
