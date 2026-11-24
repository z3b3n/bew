import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { USER_COLOR_PALETTE } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import { getRosterImage, putRosterImage, removeRosterImage } from '../db/indexedDb';
import { scanRosterImage } from '../services/visionScanner';
import type { RosterImage, ShiftEntry } from '../types';
import { formatMonthTitle, shiftMonthKey } from '../utils/dateUtils';
import { buildRosterDiff, type RosterDiffReport } from '../utils/rosterDiff';
import { DiffReviewModal } from '../components/DiffReviewModal';
import { ImageZoomModal } from '../components/ImageZoomModal';

interface OriginalRosterViewProps {
  monthKey: string;
  onMonthChange: (next: string) => void;
  onGoToSettings: () => void;
}

export const OriginalRosterView: React.FC<OriginalRosterViewProps> = ({
  monthKey,
  onMonthChange,
  onGoToSettings,
}) => {
  const {
    users,
    shiftMap,
    settings,
    addUser,
    batchApplyShifts,
    setHolidaysBatch,
    updateSettings,
  } = useApp();

  const [roster, setRoster] = useState<RosterImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [diffReport, setDiffReport] = useState<RosterDiffReport | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const archiveOnlyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    void getRosterImage(monthKey).then((found) => {
      if (!active) return;
      if (found) {
        setRoster(found);
        objectUrl = URL.createObjectURL(found.blob);
        setPreviewUrl(objectUrl);
      } else {
        setRoster(null);
        setPreviewUrl(null);
      }
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [monthKey]);

  const saveRosterFile = async (file: File): Promise<RosterImage> => {
    const record: RosterImage = {
      monthKey,
      blob: file,
      mimeType: file.type || 'image/jpeg',
      fileName: file.name || `cuadrante-${monthKey}.jpg`,
      uploadedAt: Date.now(),
    };
    await putRosterImage(record);
    setRoster(record);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    return record;
  };

  const handleArchiveOnly = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    await saveRosterFile(file);
    setStatusMsg('Imagen del cuadrante guardada offline en IndexedDB.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const runScanOnBlob = async (blob: Blob) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setScanning(true);
    try {
      const scanned = await scanRosterImage(blob, monthKey, settings);
      if (scanned.resolvedModel && scanned.resolvedModel !== settings.model) {
        await updateSettings({ ...settings, model: scanned.resolvedModel });
      }
      const report = buildRosterDiff(scanned, users, shiftMap);
      setDiffReport(report);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al escanear el cuadrante.');
    } finally {
      setScanning(false);
    }
  };

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await saveRosterFile(file);
    await runScanOnBlob(file);
  };

  const handleDeleteImage = async () => {
    await removeRosterImage(monthKey);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRoster(null);
    setPreviewUrl(null);
  };

  const handleApplyDiff = async (selectedIds: Set<string>, applyHolidays: boolean) => {
    if (!diffReport) return;

    const selectedChanges = diffReport.changes.filter((c) => selectedIds.has(c.id));
    const createdUserIds = new Map<string, string>();
    let colorIdx = users.length;

    const entriesToSave: ShiftEntry[] = [];

    for (const ch of selectedChanges) {
      let realUserId = ch.userId;
      if (ch.isNewUser) {
        const existingCreated = createdUserIds.get(ch.userName);
        if (existingCreated) {
          realUserId = existingCreated;
        } else {
          const created = await addUser({
            name: ch.userName,
            color: USER_COLOR_PALETTE[colorIdx % USER_COLOR_PALETTE.length],
          });
          colorIdx++;
          createdUserIds.set(ch.userName, created.id);
          realUserId = created.id;
        }
      }

      entriesToSave.push({
        id: `${realUserId}_${ch.date}`,
        userId: realUserId,
        date: ch.date,
        monthKey: diffReport.monthKey,
        shift: ch.newShift,
        updatedAt: Date.now(),
      });
    }

    if (entriesToSave.length > 0) {
      await batchApplyShifts(entriesToSave);
    }

    if (applyHolidays && diffReport.holidayDays.length > 0) {
      const holidayDates = diffReport.holidayDays.map(
        (d) => `${diffReport.monthKey}-${String(d).padStart(2, '0')}`
      );
      await setHolidaysBatch(holidayDates);
    }

    setDiffReport(null);
    setStatusMsg(`Aplicados ${entriesToSave.length} cambios al cuadrante de ${formatMonthTitle(monthKey)}.`);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const hasApiKey = settings.apiKey.trim().length > 0;

  return (
    <div className="space-y-3.5">
      {/* Selector de mes */}
      <div className="tactical-card rounded-2xl p-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
          className="p-2 rounded-xl bg-slate-800/80 text-slate-200"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white capitalize">{formatMonthTitle(monthKey)}</h2>
          <p className="text-[11px] text-slate-400">Archivo visual y escaneo IA</p>
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
          className="p-2 rounded-xl bg-slate-800/80 text-slate-200"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Bloque 1: Archivo visual */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Archivo visual del cuadrante</h3>
            <p className="text-[11px] text-slate-400">
              Guardado localmente en el iPhone para consultar offline
            </p>
          </div>
          <button
            type="button"
            onClick={() => archiveOnlyInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{roster ? 'Reemplazar' : 'Subir'}</span>
          </button>
        </div>

        <input
          ref={archiveOnlyInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => void handleArchiveOnly(e)}
          className="hidden"
        />

        {previewUrl && roster ? (
          <div className="space-y-2">
            <div
              onClick={() => setZoomOpen(true)}
              className="relative rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 max-h-64 cursor-pointer group"
            >
              <img
                src={previewUrl}
                alt={`Cuadrante ${monthKey}`}
                className="w-full h-56 object-contain"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 text-xs font-semibold text-white border border-slate-700">
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Ampliar con zoom</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate">{roster.fileName}</span>
              <button
                type="button"
                onClick={() => void handleDeleteImage()}
                className="flex items-center gap-1 text-rose-400 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center bg-slate-900/40">
            <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              Aún no has guardado la foto del cuadrante de {formatMonthTitle(monthKey)}.
            </p>
          </div>
        )}
      </section>

      {/* Bloque 2: Escaneo automático con Visión IA + Diff */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">Escaneo automático (IA + Diff)</h3>
          <p className="text-[11px] text-slate-400">
            Extrae todos los usuarios y compara con los turnos guardados para mostrar solo cambios.
          </p>
        </div>

        {!hasApiKey && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                Falta configurar la <strong>API Key de Visión</strong> para usar el escaneo
                automático.
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToSettings}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-[#0B0F17] text-[11px] font-bold shrink-0"
            >
              Ajustes
            </button>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleScanFile(e)}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => void handleScanFile(e)}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-amber-500 text-[#0B0F17] text-xs font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            <span>Hacer Foto</span>
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold disabled:opacity-50"
          >
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <span>Galería / Archivo</span>
          </button>
        </div>

        {roster && (
          <button
            type="button"
            disabled={scanning}
            onClick={() => void runScanOnBlob(roster.blob)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-bold disabled:opacity-50"
          >
            <ScanLine className="w-4 h-4" />
            <span>Escanear cuadrante guardado de este mes</span>
          </button>
        )}

        {scanning && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-amber-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analizando cuadrante y calculando diferencias...</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-200">
            {statusMsg}
          </div>
        )}
      </section>

      {zoomOpen && previewUrl && (
        <ImageZoomModal
          imageUrl={previewUrl}
          title={`Cuadrante ${formatMonthTitle(monthKey)}`}
          onClose={() => setZoomOpen(false)}
        />
      )}

      {diffReport && (
        <DiffReviewModal
          report={diffReport}
          onCancel={() => setDiffReport(null)}
          onApply={handleApplyDiff}
        />
      )}
    </div>
  );
};
