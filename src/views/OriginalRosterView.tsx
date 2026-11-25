import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  ScanLine,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { USER_COLOR_PALETTE } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import { getRosterImage, putRosterImage, removeRosterImage } from '../db/indexedDb';
import { scanRosterFiles } from '../services/visionScanner';
import type { RosterImage, ShiftEntry } from '../types';
import { formatMonthTitle, pad2, shiftMonthKey } from '../utils/dateUtils';
import { captureWithNativeCamera, readImageFromClipboard } from '../utils/imageProcessing';
import { convertPdfToImagesAndText, isPdfBlob } from '../utils/pdfHelper';
import { matchScannedUser, type ScannedRosterResult } from '../utils/rosterDiff';
import { DiffReviewModal, type DiffApplyPayload } from '../components/DiffReviewModal';
import { ImagePrepModal } from '../components/ImagePrepModal';
import { ImageZoomModal, type ZoomImageItem } from '../components/ImageZoomModal';

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
    primaryUser,
    settings,
    addUser,
    updateUser,
    batchApplyShifts,
    setHolidaysBatch,
    updateSettings,
  } = useApp();

  const [roster, setRoster] = useState<RosterImage | null>(null);
  const [pageUrls, setPageUrls] = useState<ZoomImageItem[]>([]);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  const [prepFiles, setPrepFiles] = useState<File[] | null>(null);
  const [pendingPdfText, setPendingPdfText] = useState<string | undefined>(undefined);
  const [pendingLocalParsed, setPendingLocalParsed] = useState<ScannedRosterResult | null>(null);
  const [preparingPdf, setPreparingPdf] = useState(false);
  const [rescanScope, setRescanScope] = useState<'all' | 'primary_only'>('primary_only');
  const [scanProgress, setScanProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<ScannedRosterResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  const buildUrlsForRoster = (found: RosterImage | null): ZoomImageItem[] => {
    if (!found) return [];
    const urls: ZoomImageItem[] = [];
    if (found.mimeType.startsWith('image/')) {
      urls.push({ url: URL.createObjectURL(found.blob), label: found.fileName });
    }
    if (found.extraPages) {
      for (const page of found.extraPages) {
        if (page.mimeType.startsWith('image/')) {
          urls.push({ url: URL.createObjectURL(page.blob), label: page.fileName });
        }
      }
    }
    return urls;
  };

  useEffect(() => {
    let active = true;
    let createdUrls: ZoomImageItem[] = [];

    setConfirmDelete(false);
    setActivePageIdx(0);

    void getRosterImage(monthKey).then((found) => {
      if (!active) return;
      if (found) {
        setRoster(found);
        createdUrls = buildUrlsForRoster(found);
        setPageUrls(createdUrls);
      } else {
        setRoster(null);
        setPageUrls([]);
      }
    });

    return () => {
      active = false;
      for (const item of createdUrls) {
        URL.revokeObjectURL(item.url);
      }
    };
  }, [monthKey]);

  // Escucha Ctrl+V / Pegar imagen en la vista de Cuadrante
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        setErrorMsg(null);
        setPrepFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const saveRosterFiles = async (files: File[]): Promise<RosterImage> => {
    const [mainFile, ...restFiles] = files;
    const record: RosterImage = {
      monthKey,
      blob: mainFile,
      mimeType: mainFile.type || 'image/jpeg',
      fileName: mainFile.name || `cuadrante-${monthKey}.jpg`,
      uploadedAt: Date.now(),
      ...(restFiles.length > 0
        ? {
            extraPages: restFiles.map((f, idx) => ({
              blob: f,
              mimeType: f.type || 'image/jpeg',
              fileName: f.name || `cuadrante-${monthKey}-p${idx + 2}.jpg`,
            })),
          }
        : {}),
    };
    await putRosterImage(record);
    setRoster(record);
    setPageUrls((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return buildUrlsForRoster(record);
    });
    setActivePageIdx(0);
    return record;
  };

  const handleOpenCamera = async () => {
    setErrorMsg(null);
    try {
      const nativeFile = await captureWithNativeCamera('camera');
      if (nativeFile) {
        setPrepFiles([nativeFile]);
        return;
      }
      cameraInputRef.current?.click();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo abrir la cámara.');
    }
  };

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setErrorMsg(null);
    setPendingPdfText(undefined);
    setPendingLocalParsed(null);

    const processedArr: File[] = [];
    const collectedTexts: string[] = [];
    let mergedLocalParsed: ScannedRosterResult | null = null;
    let hasPdf = false;

    for (const f of arr) {
      if (await isPdfBlob(f, f.name)) {
        hasPdf = true;
      }
    }

    if (hasPdf) {
      setPreparingPdf(true);
      try {
        for (const f of arr) {
          if (await isPdfBlob(f, f.name)) {
            const { pageFiles, extractedText, localParsed } = await convertPdfToImagesAndText(
              f,
              monthKey
            );
            if (extractedText.trim()) {
              collectedTexts.push(extractedText);
            }
            if (localParsed && localParsed.rows.length > 0 && !mergedLocalParsed) {
              mergedLocalParsed = localParsed;
            }
            if (pageFiles.length > 0) {
              processedArr.push(...pageFiles);
            } else {
              // Fallback directo si pdfjs-dist no pudo renderizar este PDF
              const normalizedPdf =
                f.type === 'application/pdf'
                  ? f
                  : new File([f], f.name || 'cuadrante.pdf', { type: 'application/pdf' });
              processedArr.push(normalizedPdf);
            }
          } else {
            processedArr.push(f);
          }
        }
      } finally {
        setPreparingPdf(false);
      }
    } else {
      processedArr.push(...arr);
    }

    if (collectedTexts.length > 0) {
      setPendingPdfText(collectedTexts.join('\n\n'));
    }
    if (mergedLocalParsed) {
      setPendingLocalParsed(mergedLocalParsed);
    }
    setPrepFiles(processedArr);
  };

  const handlePasteButton = async () => {
    setErrorMsg(null);
    try {
      const files = await readImageFromClipboard();
      setPrepFiles(files);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo pegar la imagen.');
    }
  };

  const applyLocalScope = (
    localRes: ScannedRosterResult,
    scope: 'all' | 'primary_only'
  ): ScannedRosterResult => {
    if (scope !== 'primary_only') return localRes;
    const filtered = localRes.rows.filter((r) => Boolean(matchScannedUser(r.rawName, [primaryUser])));
    return {
      ...localRes,
      rows: filtered.length > 0 ? filtered : localRes.rows.slice(0, 1),
    };
  };

  const runDirectPdfParseOnSaved = async (scope: 'all' | 'primary_only') => {
    if (!roster) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setPreparingPdf(true);
    try {
      const { localParsed } = await convertPdfToImagesAndText(roster.blob, monthKey);
      if (!localParsed || localParsed.rows.length === 0) {
        setErrorMsg(
          'No se pudo detectar la tabla automáticamente en este PDF. Prueba con "Escanear archivo guardado" (IA).'
        );
        return;
      }
      setScannedResult(applyLocalScope(localParsed, scope));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error leyendo el PDF.');
    } finally {
      setPreparingPdf(false);
    }
  };

  const runScanOnBlobs = async (
    blobs: Blob[],
    scanScope: 'all' | 'primary_only',
    extractedPdfText?: string,
    localFallback?: ScannedRosterResult | null
  ) => {
    setErrorMsg(null);
    setStatusMsg(null);
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanProgress({ stage: 'Iniciando escaneo...', pct: 10 });
    try {
      let effectiveBlobs = blobs;
      let effectivePdfText = extractedPdfText;
      let effectiveLocalFallback = localFallback ?? null;

      // Si algún blob guardado es PDF, convertirlo primero a imágenes + texto + tabla local
      const preparedBlobs: Blob[] = [];
      const pdfTexts: string[] = [];
      let convertedAnyPdf = false;
      for (const b of blobs) {
        if (await isPdfBlob(b, (b as File).name)) {
          convertedAnyPdf = true;
          const { pageFiles, extractedText, localParsed } = await convertPdfToImagesAndText(
            b,
            monthKey
          );
          if (extractedText.trim()) pdfTexts.push(extractedText);
          if (localParsed && localParsed.rows.length > 0 && !effectiveLocalFallback) {
            effectiveLocalFallback = localParsed;
          }
          if (pageFiles.length > 0) preparedBlobs.push(...pageFiles);
          else preparedBlobs.push(b);
        } else {
          preparedBlobs.push(b);
        }
      }
      if (convertedAnyPdf) {
        effectiveBlobs = preparedBlobs;
        if (!effectivePdfText && pdfTexts.length > 0) {
          effectivePdfText = pdfTexts.join('\n\n');
        }
      }

      const scanned = await scanRosterFiles(effectiveBlobs, {
        monthKey,
        settings,
        users,
        primaryUser,
        scanScope,
        extractedPdfText: effectivePdfText,
        localFallbackResult: effectiveLocalFallback,
        signal: controller.signal,
        onProgress: (stage, pct) => setScanProgress({ stage, pct }),
      });
      if (scanned.resolvedModel && scanned.resolvedModel !== settings.model) {
        await updateSettings({ ...settings, model: scanned.resolvedModel });
      }
      setScannedResult(scanned);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al escanear el cuadrante.');
    } finally {
      scanAbortRef.current = null;
      setScanProgress(null);
    }
  };

  const handleDeleteRoster = async () => {
    await removeRosterImage(monthKey);
    for (const p of pageUrls) URL.revokeObjectURL(p.url);
    setRoster(null);
    setPageUrls([]);
    setConfirmDelete(false);
  };

  const handleApplyDiff = async (payload: DiffApplyPayload) => {
    const { targetMonthKey, changes, applyHolidays, holidayDays, aliasMappings } = payload;

    for (const map of aliasMappings) {
      const targetUser = users.find((u) => u.id === map.userId);
      if (targetUser && !targetUser.alias) {
        await updateUser({ ...targetUser, alias: map.alias });
      }
    }

    const createdUserIds = new Map<string, string>();
    let colorIdx = users.length;
    const entriesToSave: ShiftEntry[] = [];

    for (const ch of changes) {
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
        monthKey: targetMonthKey,
        shift: ch.newShift,
        updatedAt: Date.now(),
      });
    }

    if (entriesToSave.length > 0) {
      await batchApplyShifts(entriesToSave);
    }

    if (applyHolidays && holidayDays.length > 0) {
      const holidayDates = holidayDays.map((d) => `${targetMonthKey}-${pad2(d)}`);
      await setHolidaysBatch(holidayDates);
    }

    setScannedResult(null);
    if (targetMonthKey !== monthKey) {
      onMonthChange(targetMonthKey);
    }
    setStatusMsg(
      `Aplicados ${entriesToSave.length} cambios al cuadrante de ${formatMonthTitle(targetMonthKey)}.`
    );
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const allRosterBlobs = useMemo(() => {
    if (!roster) return [];
    return [roster.blob, ...(roster.extraPages?.map((p) => p.blob) ?? [])];
  }, [roster]);

  const hasApiKey = settings.apiKey.trim().length > 0;
  const activePage = pageUrls[activePageIdx] ?? pageUrls[0];

  return (
    <div className="space-y-3.5">
      {/* Selector de mes */}
      <div className="tactical-card rounded-2xl p-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
          className="p-2 rounded-xl bg-slate-800/80 text-slate-200 active:scale-95"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-white capitalize">{formatMonthTitle(monthKey)}</h2>
          <p className="text-[11px] text-slate-400">Centro de escaneo y archivo offline</p>
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

      {/* Centro de captura / subida con Drag & Drop y Pegar */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFilesSelected(e.dataTransfer.files);
        }}
        className={`tactical-card rounded-3xl p-3.5 space-y-3 transition-colors ${
          dragOver ? 'border-amber-400 ring-2 ring-amber-400/40' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">Añadir o escanear cuadrante</h3>
            <p className="text-[11px] text-slate-400">
              Recorta, gira y ajusta contraste antes de archivar o leer con IA
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handlePasteButton()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 shrink-0 active:scale-95"
            title="Pegar imagen del portapapeles"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-amber-400" />
            <span>Pegar</span>
          </button>
        </div>

        {!hasApiKey && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                Configura tu <strong>API Key de Visión</strong> para activar el escaneo automático.
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
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.csv,.txt"
          multiple
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={Boolean(scanProgress)}
            onClick={() => void handleOpenCamera()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-amber-500 text-[#0B0F17] text-xs font-extrabold shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-98"
          >
            <Camera className="w-4 h-4" />
            <span>Hacer Foto</span>
          </button>

          <button
            type="button"
            disabled={Boolean(scanProgress)}
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs font-bold disabled:opacity-50 active:scale-98"
          >
            <Upload className="w-4 h-4 text-sky-400" />
            <span>Subir Fotos / PDF</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          Soporta varias fotos por mes (cuadrante partido), PDF, CSV o arrastrar y soltar
        </p>

        {preparingPdf && (
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-sky-500/30 flex items-center gap-2 text-xs text-sky-300 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Convirtiendo páginas del PDF y extrayendo texto...</span>
          </div>
        )}

        {scanProgress && (
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs text-amber-300 font-semibold gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="truncate">{scanProgress.stage}</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums">{scanProgress.pct}%</span>
                <button
                  type="button"
                  onClick={() => scanAbortRef.current?.abort()}
                  className="px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold"
                >
                  Cancelar
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${scanProgress.pct}%` }}
              />
            </div>
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

      {/* Archivo visual guardado del mes */}
      <section className="tactical-card rounded-3xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Archivo guardado ({formatMonthTitle(monthKey)})</h3>
            <p className="text-[11px] text-slate-400">
              Disponible sin conexión en tu dispositivo
            </p>
          </div>
          {roster && pageUrls.length > 1 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
              {pageUrls.length} partes
            </span>
          )}
        </div>

        {roster ? (
          <div className="space-y-2.5">
            {activePage ? (
              <div
                onClick={() => setZoomOpen(true)}
                className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 max-h-72 cursor-pointer group"
              >
                <img
                  src={activePage.url}
                  alt={`Cuadrante ${monthKey}`}
                  className="w-full h-60 object-contain"
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 text-xs font-semibold text-white border border-slate-700">
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ampliar (pellizco)</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{roster.fileName}</div>
                    <div className="text-[11px] text-slate-400">
                      Documento guardado offline ({roster.mimeType || 'archivo'})
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pageUrls.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {pageUrls.map((p, idx) => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => setActivePageIdx(idx)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${
                      idx === activePageIdx
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Parte {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Re-escanear archivo guardado */}
            <div className="p-2.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Re-escanear con IA:</span>
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setRescanScope('all')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                      rescanScope === 'all' ? 'bg-sky-500 text-[#070B12]' : 'text-slate-400'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRescanScope('primary_only')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                      rescanScope === 'primary_only' ? 'bg-sky-500 text-[#070B12]' : 'text-slate-400'
                    }`}
                  >
                    <User className="w-3 h-3" />
                    <span>Solo {primaryUser.name}</span>
                  </button>
                </div>
              </div>

              {(roster.mimeType === 'application/pdf' ||
                roster.fileName.toLowerCase().endsWith('.pdf')) && (
                <button
                  type="button"
                  disabled={Boolean(scanProgress) || preparingPdf}
                  onClick={() => void runDirectPdfParseOnSaved(rescanScope)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-[#070B12] text-xs font-extrabold disabled:opacity-45"
                >
                  <span>⚡ Leer PDF directo (Sin IA)</span>
                </button>
              )}

              <button
                type="button"
                disabled={Boolean(scanProgress) || !hasApiKey}
                onClick={() => void runScanOnBlobs(allRosterBlobs, rescanScope)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-bold disabled:opacity-45"
              >
                <ScanLine className="w-4 h-4" />
                <span>Escanear archivo guardado</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span className="truncate">{roster.fileName}</span>
              {confirmDelete ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDeleteRoster()}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-slate-400"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 text-rose-400 font-medium shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center bg-slate-900/40">
            <ImageIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              Aún no hay imagen o PDF guardado para {formatMonthTitle(monthKey)}.
            </p>
          </div>
        )}
      </section>

      {prepFiles && (
        <ImagePrepModal
          initialFiles={prepFiles}
          monthTitle={formatMonthTitle(monthKey)}
          hasApiKey={hasApiKey}
          hasPdfText={Boolean(pendingPdfText)}
          hasLocalParsed={Boolean(pendingLocalParsed)}
          onCancel={() => {
            setPrepFiles(null);
            setPendingPdfText(undefined);
            setPendingLocalParsed(null);
          }}
          onArchiveOnly={async (processed) => {
            await saveRosterFiles(processed);
            setPrepFiles(null);
            setPendingPdfText(undefined);
            setPendingLocalParsed(null);
            setStatusMsg('Cuadrante guardado offline en tu dispositivo.');
            setTimeout(() => setStatusMsg(null), 3500);
          }}
          onUseLocalParsed={async (processed, scope) => {
            const localRes = pendingLocalParsed;
            await saveRosterFiles(processed);
            setPrepFiles(null);
            setPendingPdfText(undefined);
            setPendingLocalParsed(null);
            if (localRes) {
              setScannedResult(applyLocalScope(localRes, scope));
            }
          }}
          onScanWithAi={async (processed, scope) => {
            const pdfText = pendingPdfText;
            const localRes = pendingLocalParsed;
            await saveRosterFiles(processed);
            setPrepFiles(null);
            setPendingPdfText(undefined);
            setPendingLocalParsed(null);
            await runScanOnBlobs(processed, scope, pdfText, localRes);
          }}
        />
      )}

      {zoomOpen && pageUrls.length > 0 && (
        <ImageZoomModal
          images={pageUrls}
          initialIndex={activePageIdx}
          title={`Cuadrante ${formatMonthTitle(monthKey)}`}
          onClose={() => setZoomOpen(false)}
        />
      )}

      {scannedResult && (
        <DiffReviewModal
          scanned={scannedResult}
          monthKey={monthKey}
          previewImages={pageUrls}
          onCancel={() => setScannedResult(null)}
          onApply={handleApplyDiff}
        />
      )}
    </div>
  );
};
