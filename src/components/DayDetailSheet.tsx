import React from 'react';
import { ArrowLeftRight, Sparkles, Trash2, Users, X } from 'lucide-react';
import { SHIFT_DEFINITIONS, SHIFT_ORDER } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { ShiftCode } from '../types';
import { formatShortDateEs } from '../utils/dateUtils';

interface DayDetailSheetProps {
  date: string;
  targetUserId: string;
  onClose: () => void;
  onOpenSwap: (date: string, currentShift?: ShiftCode) => void;
}

const HOLIDAY_SHIFT_ORDER: ShiftCode[] = ['AD', 'AN', 'L'];

export const DayDetailSheet: React.FC<DayDetailSheetProps> = ({
  date,
  targetUserId,
  onClose,
  onOpenSwap,
}) => {
  const {
    users,
    primaryUser,
    shiftMap,
    holidays,
    holidaySet,
    swaps,
    upsertShift,
    toggleHoliday,
  } = useApp();

  const targetUser = users.find((u) => u.id === targetUserId) ?? primaryUser;
  const currentEntry = shiftMap.get(`${targetUser.id}_${date}`);
  const currentShift = currentEntry?.shift;
  const isHoliday = holidaySet.has(date);
  const holidayObj = holidays.find((h) => h.date === date);

  const daySwaps = swaps.filter(
    (s) => s.dateGiven === date || s.dateCovered === date || s.debtDate === date
  );
  const userMap = new Map(users.map((u) => [u.id, u]));

  const availableShifts = isHoliday ? HOLIDAY_SHIFT_ORDER : SHIFT_ORDER;

  const handleSelectShift = async (code: ShiftCode | null) => {
    await upsertShift(targetUser.id, date, code);
    onClose();
  };

  const teammatesWorking = users
    .filter((u) => u.id !== targetUser.id)
    .map((u) => ({
      user: u,
      entry: shiftMap.get(`${u.id}_${date}`),
    }))
    .sort((a, b) => {
      const aMatch = a.entry?.shift && a.entry.shift === currentShift ? 0 : 1;
      const bMatch = b.entry?.shift && b.entry.shift === currentShift ? 0 : 1;
      return aMatch - bMatch;
    });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#111827] border-t border-slate-700/80 rounded-t-3xl p-4 pb-safe max-h-[88dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-3" />

        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-white capitalize">
                {formatShortDateEs(date)}
              </h3>
              {isHoliday && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  ★ {holidayObj?.name ? holidayObj.name : 'Festivo'}
                </span>
              )}
              {daySwaps.length > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                  Con cambio ⇄
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Editando turno de{' '}
              <span className="font-semibold" style={{ color: targetUser.color }}>
                {targetUser.name}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interruptor Día Festivo arriba para activar reglas AD / AN */}
        <div className="mb-3 space-y-2">
          <button
            type="button"
            onClick={() => void toggleHoliday(date)}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
              isHoliday
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                : 'bg-slate-900/70 border-slate-800 text-slate-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span>{isHoliday ? 'Día Festivo activado' : 'Marcar como Día Festivo'}</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isHoliday ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isHoliday ? 'SÍ' : 'NO'}
            </span>
          </button>

          {isHoliday && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200">
              Día festivo (fiesta): los turnos de servicio son siempre{' '}
              <strong>Arco Diurno (AD)</strong> o <strong>Arco Nocturno (AN)</strong>.
            </div>
          )}
        </div>

        {/* Cambios registrados en este día */}
        {daySwaps.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {daySwaps.map((sw) => {
              const tm = userMap.get(sw.teammateId);
              return (
                <div
                  key={sw.id}
                  className="px-3 py-2 rounded-xl bg-fuchsia-500/15 border border-fuchsia-400/45 text-xs text-fuchsia-200 flex items-center gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4 text-fuchsia-300 shrink-0" />
                  <span>
                    {sw.type === 'exchange'
                      ? `Intercambio 1x1 con ${tm?.name ?? 'compañero'}: cede ${
                          sw.dateGiven ? formatShortDateEs(sw.dateGiven) : ''
                        } (${sw.shiftGiven}) ↔ cubre ${
                          sw.dateCovered ? formatShortDateEs(sw.dateCovered) : ''
                        } (${sw.shiftCovered})`
                      : `${sw.direction === 'owed_to_me' ? 'A favor' : 'Debes'} con ${
                          tm?.name ?? 'compañero'
                        } (${sw.debtShift})`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Selector rápido de turnos (vuelve automáticamente al cuadrante) */}
        <div className={`grid ${isHoliday ? 'grid-cols-3' : 'grid-cols-4'} gap-2 mb-4`}>
          {availableShifts.map((code) => {
            const def = SHIFT_DEFINITIONS[code];
            const selected = currentShift === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => void handleSelectShift(code)}
                className={`p-2.5 rounded-2xl border text-left transition-all active:scale-95 ${
                  selected
                    ? `${def.cellBg} ${def.badgeBorder} ring-2 ring-amber-400/80`
                    : `${def.cellBg} border-slate-800 hover:border-slate-600`
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${def.badgeText}`}>{code}</span>
                  <span className="text-[10px] text-slate-300">{def.totalHours}h</span>
                </div>
                <div className="text-[11px] text-slate-200 truncate mt-0.5">{def.shortLabel}</div>
                {def.startTime && (
                  <div className="text-[10px] text-slate-400">
                    {def.startTime}–{def.endTime}
                  </div>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => void handleSelectShift(null)}
            className="p-2.5 rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-rose-500/40 text-left flex flex-col justify-between active:scale-95"
          >
            <div className="flex items-center justify-between text-slate-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Limpiar</div>
          </button>
        </div>

        {/* Botón Cambio */}
        {targetUser.id === primaryUser.id && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSwap(date, currentShift);
            }}
            className="w-full mb-5 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500 text-[#0B0F17] text-xs font-bold shadow-lg shadow-amber-500/20"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Gestionar cambio de turno
          </button>
        )}

        {/* Compañeros ese día */}
        <div className="border-t border-slate-800 pt-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2.5">
            <Users className="w-4 h-4 text-sky-400" />
            <span>Compañeros este día</span>
          </div>

          {teammatesWorking.length === 0 ? (
            <p className="text-xs text-slate-500">
              Añade compañeros en Ajustes o escanea un cuadrante para ver coincidencias.
            </p>
          ) : (
            <div className="space-y-1.5">
              {teammatesWorking.map(({ user, entry }) => {
                const def = entry ? SHIFT_DEFINITIONS[entry.shift] : null;
                const coincides =
                  Boolean(currentShift) &&
                  Boolean(entry?.shift) &&
                  entry?.shift === currentShift &&
                  SHIFT_DEFINITIONS[currentShift!].isWorking;

                return (
                  <div
                    key={user.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                      coincides
                        ? 'bg-amber-500/10 border-amber-500/35'
                        : 'bg-slate-900/60 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="text-xs font-medium text-slate-200">{user.name}</span>
                      {coincides && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                          Coincide
                        </span>
                      )}
                    </div>
                    {def ? (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`}
                      >
                        {def.code} · {def.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Sin asignar</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
