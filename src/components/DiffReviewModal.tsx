import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCheck,
  Eye,
  Grid3X3,
  ListChecks,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { SHIFT_DEFINITIONS, SHIFT_ORDER } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import type { ShiftCode } from '../types';
import { formatMonthTitle, getDaysInMonth, getWeekdayShort, pad2 } from '../utils/dateUtils';
import { buildRosterDiff, matchScannedUser, type ScannedRosterResult } from '../utils/rosterDiff';
import { ImageZoomModal, type ZoomImageItem } from './ImageZoomModal';

export interface DiffApplyPayload {
  targetMonthKey: string;
  changes: Array<{
    date: string;
    userId: string;
    userName: string;
    isNewUser: boolean;
    newShift: ShiftCode;
    rawName: string;
  }>;
  applyHolidays: boolean;
  holidayDays: number[];
  aliasMappings: Array<{ userId: string; alias: string }>;
}

interface DiffReviewModalProps {
  scanned: ScannedRosterResult;
  monthKey: string;
  previewImages?: ZoomImageItem[];
  onCancel: () => void;
  onApply: (payload: DiffApplyPayload) => Promise<void>;
}

export const DiffReviewModal: React.FC<DiffReviewModalProps> = ({
  scanned,
  monthKey,
  previewImages = [],
  onCancel,
  onApply,
}) => {
  const { users, primaryUser, shiftMap } = useApp();

  const [targetMonthKey, setTargetMonthKey] = useState(monthKey);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [userOverrides, setUserOverrides] = useState<Record<string, string | 'new' | 'ignore'>>({});
  const [cellEdits, setCellEdits] = useState<Record<string, ShiftCode>>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [applyHolidays, setApplyHolidays] = useState((scanned.holidays?.length ?? 0) > 0);
  const [saveAliases, setSaveAliases] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    rawName: string;
    userId: string;
    userName: string;
    day: number;
    currentShift: ShiftCode | null;
    oldShift: ShiftCode | null;
  } | null>(null);

  // Construimos una copia de scanned con las ediciones manuales aplicadas
  const editedScanned = useMemo<ScannedRosterResult>(() => {
    return {
      ...scanned,
      rows: scanned.rows.map((row) => {
        const nextShifts = { ...row.shifts };
        for (const [key, val] of Object.entries(cellEdits)) {
          const [rName, dayStr] = key.split('::');
          if (rName === row.rawName) {
            nextShifts[Number(dayStr)] = val;
          }
        }
        return { ...row, shifts: nextShifts };
      }),
    };
  }, [scanned, cellEdits]);

  const report = useMemo(
    () => buildRosterDiff(editedScanned, users, shiftMap, userOverrides, targetMonthKey),
    [editedScanned, users, shiftMap, userOverrides, targetMonthKey]
  );

  const selectedChanges = useMemo(
    () => report.changes.filter((c) => !excludedIds.has(c.id)),
    [report.changes, excludedIds]
  );

  const filteredListChanges = useMemo(() => {
    if (personFilter === 'all') return report.changes;
    if (personFilter === 'primary') return report.changes.filter((c) => c.isPrimaryUser);
    return report.changes.filter((c) => c.userId === personFilter || c.rawName === personFilter);
  }, [report.changes, personFilter]);

  const modifiedCount = useMemo(
    () => report.changes.filter((c) => c.kind === 'modified').length,
    [report.changes]
  );
  const addedCount = report.changes.length - modifiedCount;

  const totalDays = getDaysInMonth(targetMonthKey);
  const daysArray = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays]);

  const gridRows = useMemo(() => {
    return editedScanned.rows
      .map((row) => {
        const rawName = row.rawName.trim();
        const override = userOverrides[rawName];
        if (override === 'ignore') return null;

        let matched =
          override && override !== 'new'
            ? users.find((u) => u.id === override)
            : override !== 'new'
              ? matchScannedUser(rawName, users)
              : undefined;

        return {
          rawName,
          userId: matched ? matched.id : `new:${rawName}`,
          displayName: matched ? matched.name : rawName,
          isPrimary: Boolean(matched?.isPrimary),
          isNew: !matched,
          shifts: row.shifts,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'es');
      });
  }, [editedScanned.rows, userOverrides, users]);

  const toggleChangeId = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const aliasMappings: Array<{ userId: string; alias: string }> = [];
      if (saveAliases) {
        for (const [rawName, target] of Object.entries(userOverrides)) {
          if (target !== 'new' && target !== 'ignore') {
            const u = users.find((item) => item.id === target);
            if (u && !u.alias) {
              aliasMappings.push({ userId: u.id, alias: rawName });
            }
          }
        }
      }

      await onApply({
        targetMonthKey,
        changes: selectedChanges.map((c) => ({
          date: c.date,
          userId: c.userId,
          userName: c.userName,
          isNewUser: c.isNewUser,
          newShift: c.newShift,
          rawName: c.rawName,
        })),
        applyHolidays,
        holidayDays: report.holidayDays,
        aliasMappings,
      });
    } finally {
      setSaving(false);
    }
  };

  const showMonthMismatch =
    Boolean(scanned.detectedMonthKey) && scanned.detectedMonthKey !== monthKey;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center">
      <div className="w-full max-w-3xl bg-[#0E1523] border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-4 pb-safe max-h-[92dvh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white capitalize">
              Revisión · {formatMonthTitle(targetMonthKey)}
            </h3>
            <p className="text-xs text-slate-400">
              {modifiedCount} modificaciones · {addedCount} nuevos · {report.unchangedCount} sin cambios
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {previewImages.length > 0 && (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-300"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Ver foto</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="p-2 rounded-full bg-slate-800 text-slate-300"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {/* Aviso de mes detectado distinto */}
          {showMonthMismatch && scanned.detectedMonthKey && (
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-400/45 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-amber-200">
                <Calendar className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  La imagen parece de <strong className="capitalize">{formatMonthTitle(scanned.detectedMonthKey)}</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setTargetMonthKey((prev) =>
                    prev === monthKey ? scanned.detectedMonthKey! : monthKey
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-amber-500 text-[#070B12] text-[11px] font-bold"
              >
                {targetMonthKey === monthKey
                  ? `Cambiar a ${scanned.detectedMonthKey}`
                  : `Mantener ${monthKey}`}
              </button>
            </div>
          )}

          {/* Mapeo de nombres no reconocidos */}
          {report.unmatchedRawNames.length > 0 && (
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                  <UserPlus className="w-4 h-4" />
                  <span>Nombres nuevos o sin vincular ({report.unmatchedRawNames.length})</span>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAliases}
                    onChange={(e) => setSaveAliases(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-500"
                  />
                  <span>Guardar alias OCR</span>
                </label>
              </div>

              <div className="space-y-1.5">
                {report.unmatchedRawNames.map((raw) => {
                  const val = userOverrides[raw] ?? 'new';
                  return (
                    <div
                      key={raw}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800"
                    >
                      <span className="text-xs font-bold text-white truncate">{raw}</span>
                      <select
                        value={val}
                        onChange={(e) =>
                          setUserOverrides((prev) => ({
                            ...prev,
                            [raw]: e.target.value,
                          }))
                        }
                        className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-200 max-w-[180px]"
                      >
                        <option value="new">+ Crear compañero nuevo</option>
                        <option value="ignore">Ignorar esta fila</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            Vincular a {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Festivos detectados */}
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

          {/* Selector de vista: Cuadrante visual editable vs Lista Diff */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  viewMode === 'grid' ? 'bg-amber-500 text-[#070B12]' : 'text-slate-400'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Cuadrante (tocar para corregir)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  viewMode === 'list' ? 'bg-amber-500 text-[#070B12]' : 'text-slate-400'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Lista ({report.changes.length})</span>
              </button>
            </div>

            {viewMode === 'list' && report.changes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setExcludedIds(
                    excludedIds.size === 0 ? new Set(report.changes.map((c) => c.id)) : new Set()
                  )
                }
                className="text-xs font-semibold text-amber-400"
              >
                {excludedIds.size === 0 ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            )}
          </div>

          {viewMode === 'grid' ? (
            <div className="space-y-2">
              {gridRows.length === 0 ? (
                <div className="p-5 text-center rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                  No hay filas activas para mostrar.
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800">
                          <th className="sticky left-0 z-10 bg-slate-900 px-2.5 py-2 text-left font-bold text-slate-200 border-r border-slate-800 min-w-[90px]">
                            Equipo
                          </th>
                          {daysArray.map((d) => {
                            const wd = getWeekdayShort(`${targetMonthKey}-${pad2(d)}`);
                            const isHol = report.holidayDays.includes(d);
                            return (
                              <th
                                key={d}
                                className={`px-1 py-1.5 text-center min-w-[34px] ${
                                  isHol ? 'bg-rose-500/15 text-rose-300' : 'text-slate-400'
                                }`}
                              >
                                <div className="font-bold tabular-nums">{d}</div>
                                <div className="text-[9px] opacity-75">{wd.slice(0, 1)}</div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {gridRows.map((row) => (
                          <tr key={row.rawName}>
                            <td
                              className={`sticky left-0 z-10 px-2.5 py-1.5 border-r border-slate-800 font-bold truncate max-w-[110px] ${
                                row.isPrimary
                                  ? 'bg-[#17181E] text-amber-300'
                                  : 'bg-[#0E1523] text-slate-200'
                              }`}
                            >
                              {row.displayName}
                              {row.isNew && (
                                <span className="ml-1 text-[9px] text-sky-400 font-normal">★</span>
                              )}
                            </td>
                            {daysArray.map((d) => {
                              const scannedShift = row.shifts[d] ?? null;
                              const date = `${targetMonthKey}-${pad2(d)}`;
                              const oldEntry = !row.isNew
                                ? shiftMap.get(`${row.userId}_${date}`)
                                : undefined;
                              const oldShift = oldEntry ? oldEntry.shift : null;
                              const isDiff = scannedShift !== null && scannedShift !== oldShift;
                              const def = scannedShift ? SHIFT_DEFINITIONS[scannedShift] : null;

                              return (
                                <td key={d} className="p-0.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingCell({
                                        rawName: row.rawName,
                                        userId: row.userId,
                                        userName: row.displayName,
                                        day: d,
                                        currentShift: scannedShift,
                                        oldShift,
                                      })
                                    }
                                    className={`w-full h-7 rounded-md flex items-center justify-center font-bold border transition-transform active:scale-90 ${
                                      def
                                        ? `${def.badgeBg} ${def.badgeText} ${
                                            isDiff
                                              ? 'border-amber-400 ring-1 ring-amber-400/70'
                                              : def.badgeBorder
                                          }`
                                        : 'border-transparent text-slate-600'
                                    }`}
                                  >
                                    {def ? def.code : '·'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Editor rápido de celda tocada */}
              {editingCell && (
                <div className="p-3 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Corregir Día {editingCell.day} · {editingCell.userName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingCell(null)}
                      className="text-xs text-slate-400"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {([...SHIFT_ORDER, 'F'] as ShiftCode[]).map((code) => {
                      const d = SHIFT_DEFINITIONS[code];
                      const active = editingCell.currentShift === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            setCellEdits((prev) => ({
                              ...prev,
                              [`${editingCell.rawName}::${editingCell.day}`]: code,
                            }));
                            setEditingCell(null);
                          }}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
                            active
                              ? `${d.badgeBg} ${d.badgeText} ring-2 ring-amber-400`
                              : `${d.badgeBg} ${d.badgeText} ${d.badgeBorder}`
                          }`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 text-center">
                Las celdas con borde ámbar son cambios o turnos nuevos que se guardarán ({selectedChanges.length}).
              </p>
            </div>
          ) : report.changes.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-slate-900/60 border border-slate-800">
              <CheckCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">Sin diferencias detectadas</p>
              <p className="text-xs text-slate-400 mt-1">
                El cuadrante escaneado coincide al 100% con los turnos guardados para este mes.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setPersonFilter('all')}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                    personFilter === 'all'
                      ? 'bg-amber-500 text-[#070B12] border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}
                >
                  Todos ({report.changes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPersonFilter('primary')}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                    personFilter === 'primary'
                      ? 'bg-amber-500 text-[#070B12] border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}
                >
                  Solo {primaryUser.name}
                </button>
              </div>

              <div className="space-y-1.5">
                {filteredListChanges.map((c) => {
                  const checked = !excludedIds.has(c.id);
                  const newDef = SHIFT_DEFINITIONS[c.newShift];
                  const oldDef = c.oldShift ? SHIFT_DEFINITIONS[c.oldShift] : null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleChangeId(c.id)}
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
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
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
            </div>
          )}

          {scanned.rows.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>La IA no detectó filas legibles. Prueba recortando más cerca de la tabla o activando "Nitidez Doc".</span>
            </div>
          )}
        </div>

        {/* Pie */}
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
            disabled={saving || (selectedChanges.length === 0 && !applyHolidays)}
            onClick={() => void handleConfirm()}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 disabled:opacity-40 text-[#0B0F17] text-xs font-bold"
          >
            {saving
              ? 'Aplicando...'
              : `Aplicar ${selectedChanges.length} ${selectedChanges.length === 1 ? 'cambio' : 'cambios'}`}
          </button>
        </div>
      </div>

      {zoomOpen && previewImages.length > 0 && (
        <ImageZoomModal
          images={previewImages}
          title={`Cuadrante ${formatMonthTitle(targetMonthKey)}`}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
};
