import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, Sparkles, UserPlus, X } from 'lucide-react';
import { SHIFT_DEFINITIONS } from '../constants/shifts';
import type { RosterDiffReport } from '../utils/rosterDiff';

interface DiffReviewModalProps {
  report: RosterDiffReport;
  onCancel: () => void;
  onApply: (selectedChangeIds: Set<string>, applyHolidays: boolean) => Promise<void>;
}

export const DiffReviewModal: React.FC<DiffReviewModalProps> = ({
  report,
  onCancel,
  onApply,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(report.changes.map((c) => c.id))
  );
  const [applyHolidays, setApplyHolidays] = useState(report.holidayDays.length > 0);
  const [saving, setSaving] = useState(false);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const modifiedCount = useMemo(
    () => report.changes.filter((c) => c.kind === 'modified').length,
    [report.changes]
  );
  const addedCount = report.changes.length - modifiedCount;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onApply(selectedIds, applyHolidays);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center">
      <div className="w-full max-w-2xl bg-[#111827] border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-4 pb-safe max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white">Revisión de cambios ({report.monthKey})</h3>
            <p className="text-xs text-slate-400">
              {modifiedCount} modificaciones · {addedCount} nuevos · {report.unchangedCount} sin cambios
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-full bg-slate-800 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {report.newUsers.length > 0 && (
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 mb-1">
                <UserPlus className="w-4 h-4" />
                <span>Compañeros nuevos detectados ({report.newUsers.length})</span>
              </div>
              <p className="text-xs text-slate-300">
                Se crearán automáticamente si aplicas sus turnos:{' '}
                <span className="font-semibold text-white">{report.newUsers.join(', ')}</span>
              </p>
            </div>
          )}

          {report.holidayDays.length > 0 && (
            <label className="flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 cursor-pointer">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-300" />
                <div>
                  <div className="text-xs font-semibold text-rose-200">
                    Festivos detectados: días {report.holidayDays.join(', ')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Marcar estos días como festivos en el calendario
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={applyHolidays}
                onChange={(e) => setApplyHolidays(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
            </label>
          )}

          {report.changes.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-slate-900/60 border border-slate-800">
              <CheckCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">Sin diferencias detectadas</p>
              <p className="text-xs text-slate-400 mt-1">
                El cuadrante escaneado coincide al 100% con los turnos guardados para este mes.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-slate-400">
                  Seleccionados: {selectedIds.size} de {report.changes.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(
                      selectedIds.size === report.changes.length
                        ? new Set()
                        : new Set(report.changes.map((c) => c.id))
                    )
                  }
                  className="text-xs font-semibold text-amber-400"
                >
                  {selectedIds.size === report.changes.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>

              {report.changes.map((c) => {
                const checked = selectedIds.has(c.id);
                const newDef = SHIFT_DEFINITIONS[c.newShift];
                const oldDef = c.oldShift ? SHIFT_DEFINITIONS[c.oldShift] : null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleId(c.id)}
                    className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-colors ${
                      checked
                        ? c.kind === 'modified'
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-slate-800/80 border-slate-700'
                        : 'bg-slate-900/40 border-slate-800/60 opacity-55'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          checked
                            ? 'bg-amber-500 border-amber-400 text-[#0B0F17]'
                            : 'border-slate-600'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          Día {c.day} · {c.userName}
                        </div>
                        <div className="text-[11px] text-slate-400">{c.summaryText}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 text-xs font-bold">
                      {oldDef ? (
                        <span
                          className={`px-1.5 py-0.5 rounded border ${oldDef.badgeBg} ${oldDef.badgeText} ${oldDef.badgeBorder}`}
                        >
                          {oldDef.code}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">∅</span>
                      )}
                      <span className="text-slate-500">→</span>
                      <span
                        className={`px-1.5 py-0.5 rounded border ${newDef.badgeBg} ${newDef.badgeText} ${newDef.badgeBorder}`}
                      >
                        {newDef.code}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || (selectedIds.size === 0 && !applyHolidays)}
            onClick={() => void handleConfirm()}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 disabled:opacity-40 text-[#0B0F17] text-xs font-bold"
          >
            {saving ? 'Aplicando...' : 'Aplicar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
};
