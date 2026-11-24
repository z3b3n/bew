import React, { useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { SHIFT_ORDER } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { DebtDirection, ShiftCode, SwapType } from '../types';
import { getTodayStr } from '../utils/dateUtils';

interface SwapModalProps {
  initialDate?: string;
  initialShift?: ShiftCode;
  onClose: () => void;
}

export const SwapModal: React.FC<SwapModalProps> = ({
  initialDate,
  initialShift,
  onClose,
}) => {
  const { users, primaryUser, shiftMap, addSwap, upsertShift } = useApp();
  const teammates = users.filter((u) => u.id !== primaryUser.id);

  const [teammateId, setTeammateId] = useState(teammates[0]?.id ?? '');
  const [swapType, setSwapType] = useState<SwapType>('exchange');

  // Intercambio 1x1
  const [dateGiven, setDateGiven] = useState(initialDate ?? getTodayStr());
  const [shiftGiven, setShiftGiven] = useState<ShiftCode>(
    initialShift ?? shiftMap.get(`${primaryUser.id}_${initialDate ?? getTodayStr()}`)?.shift ?? 'M'
  );
  const [dateCovered, setDateCovered] = useState(initialDate ?? getTodayStr());
  const [shiftCovered, setShiftCovered] = useState<ShiftCode>('T');

  // Servicio debido / a favor
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [debtDate, setDebtDate] = useState(initialDate ?? getTodayStr());
  const [debtShift, setDebtShift] = useState<ShiftCode>(initialShift ?? 'M');

  const [autoUpdateCalendar, setAutoUpdateCalendar] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teammateId) return;
    setSaving(true);
    try {
      if (swapType === 'exchange') {
        await addSwap({
          type: 'exchange',
          teammateId,
          settled: true,
          settledAt: Date.now(),
          dateGiven,
          shiftGiven,
          dateCovered,
          shiftCovered,
          note: note.trim() || undefined,
        });

        if (autoUpdateCalendar) {
          // ZETO cede dateGiven -> pasa a Libre (L) y el compañero pasa a shiftGiven
          await upsertShift(primaryUser.id, dateGiven, 'L', `Cambio con compañero`);
          await upsertShift(teammateId, dateGiven, shiftGiven);
          // ZETO cubre dateCovered -> pasa a shiftCovered y el compañero pasa a Libre (L)
          await upsertShift(primaryUser.id, dateCovered, shiftCovered, `Cubre a compañero`);
          await upsertShift(teammateId, dateCovered, 'L');
        }
      } else {
        await addSwap({
          type: 'debt',
          teammateId,
          settled: false,
          direction,
          debtDate,
          debtShift,
          note: note.trim() || undefined,
        });

        if (autoUpdateCalendar) {
          if (direction === 'owed_to_me') {
            // ZETO cubre el turno del compañero -> ZETO trabaja debtShift, compañero Libre
            await upsertShift(primaryUser.id, debtDate, debtShift, 'Servicio a favor');
            await upsertShift(teammateId, debtDate, 'L');
          } else {
            // Compañero cubre a ZETO -> ZETO Libre, compañero trabaja debtShift
            await upsertShift(primaryUser.id, debtDate, 'L', 'Servicio debido');
            await upsertShift(teammateId, debtDate, debtShift);
          }
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#111827] border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-4 pb-safe max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Nuevo cambio / servicio</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-slate-800 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {teammates.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
            No hay compañeros registrados todavía. Añade al menos un compañero en la pestaña{' '}
            <strong className="text-amber-300">Ajustes</strong> para registrar cambios de turno.
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Compañero</label>
              <select
                value={teammateId}
                onChange={(e) => setTeammateId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
              >
                {teammates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setSwapType('exchange')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  swapType === 'exchange' ? 'bg-amber-500 text-[#0B0F17]' : 'text-slate-400'
                }`}
              >
                Intercambio 1x1
              </button>
              <button
                type="button"
                onClick={() => setSwapType('debt')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  swapType === 'debt' ? 'bg-amber-500 text-[#0B0F17]' : 'text-slate-400'
                }`}
              >
                Servicio debido / A favor
              </button>
            </div>

            {swapType === 'exchange' ? (
              <div className="space-y-3 p-3 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Día que ZETO cede
                    </label>
                    <input
                      type="date"
                      value={dateGiven}
                      onChange={(e) => setDateGiven(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Turno</label>
                    <select
                      value={shiftGiven}
                      onChange={(e) => setShiftGiven(e.target.value as ShiftCode)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      {SHIFT_ORDER.filter((c) => c !== 'L' && c !== 'F').map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Día que ZETO cubre
                    </label>
                    <input
                      type="date"
                      value={dateCovered}
                      onChange={(e) => setDateCovered(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Turno</label>
                    <select
                      value={shiftCovered}
                      onChange={(e) => setShiftCovered(e.target.value as ShiftCode)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      {SHIFT_ORDER.filter((c) => c !== 'L' && c !== 'F').map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('owed_to_me')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left ${
                      direction === 'owed_to_me'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    +1 A favor
                    <span className="block text-[10px] font-normal opacity-80">
                      ZETO cubre al compañero
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('i_owe')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left ${
                      direction === 'i_owe'
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    -1 Debo
                    <span className="block text-[10px] font-normal opacity-80">
                      Compañero cubre a ZETO
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={debtDate}
                      onChange={(e) => setDebtDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Turno</label>
                    <select
                      value={debtShift}
                      onChange={(e) => setDebtShift(e.target.value as ShiftCode)}
                      className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      {SHIFT_ORDER.filter((c) => c !== 'L' && c !== 'F').map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
              <span className="text-xs text-slate-300">
                Actualizar turnos en el calendario automáticamente
              </span>
              <input
                type="checkbox"
                checked={autoUpdateCalendar}
                onChange={(e) => setAutoUpdateCalendar(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
            </label>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Nota (opcional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Por guardia del sábado"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl bg-amber-500 text-[#0B0F17] text-xs font-bold shadow-lg shadow-amber-500/20"
            >
              {saving ? 'Guardando...' : 'Guardar cambio'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
