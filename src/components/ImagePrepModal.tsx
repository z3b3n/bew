import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Maximize,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  FULL_CROP,
  captureWithNativeCamera,
  isLikelyImageFile,
  isNativeApp,
  materializeFiles,
  processRosterImage,
  type NormalizedCrop,
  type RotationAngle,
} from '../utils/imageProcessing';

interface PrepItem {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl: string | null;
  rotation: RotationAngle;
  crop: NormalizedCrop;
  enhanceDoc: boolean;
}

interface ImagePrepModalProps {
  initialFiles: File[];
  monthTitle: string;
  hasApiKey: boolean;
  hasPdfText?: boolean;
  hasLocalParsed?: boolean;
  onCancel: () => void;
  onArchiveOnly: (processedFiles: File[]) => Promise<void>;
  onScanWithAi: (processedFiles: File[], scanScope: 'all' | 'primary_only') => Promise<void>;
  onUseLocalParsed?: (processedFiles: File[], scope: 'all' | 'primary_only') => Promise<void>;
}

type DragHandle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

function buildPrepItem(file: File): PrepItem {
  const isImage = isLikelyImageFile(file, file.name);
  return {
    id: `prep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    file,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    rotation: 0,
    crop: { ...FULL_CROP },
    enhanceDoc: true,
  };
}

export const ImagePrepModal: React.FC<ImagePrepModalProps> = ({
  initialFiles,
  monthTitle,
  hasApiKey,
  hasPdfText = false,
  hasLocalParsed = false,
  onCancel,
  onArchiveOnly,
  onScanWithAi,
  onUseLocalParsed,
}) => {
  const [items, setItems] = useState<PrepItem[]>(() => initialFiles.map(buildPrepItem));
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const nativeApp = isNativeApp();

  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: NormalizedCrop;
  } | null>(null);

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = items[activeIdx] ?? items[0];

  const updateCurrent = (updater: (prev: PrepItem) => PrepItem) => {
    setItems((prev) => prev.map((it, idx) => (idx === activeIdx ? updater(it) : it)));
  };

  const rotateCurrent = (delta: 90 | -90) => {
    updateCurrent((it) => ({
      ...it,
      rotation: (((it.rotation + delta) % 360 + 360) % 360) as RotationAngle,
      crop: { ...FULL_CROP },
    }));
  };

  const appendFiles = (files: File[]) => {
    if (files.length === 0) return;
    const next = files.map(buildPrepItem);
    setItems((prev) => {
      const merged = [...prev, ...next];
      setActiveIdx(prev.length);
      return merged;
    });
  };

  const handleAddNative = async (source: 'camera' | 'photos') => {
    const nativeFile = await captureWithNativeCamera(source);
    if (nativeFile) {
      appendFiles([nativeFile]);
    }
  };

  const handlePrepInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const rawList = input.files ? Array.from(input.files) : [];
    if (rawList.length === 0) return;
    void materializeFiles(rawList)
      .then((safeFiles) => appendFiles(safeFiles))
      .finally(() => {
        input.value = '';
      });
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) return;
    const target = items[idx];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((prev) => Math.max(0, Math.min(prev, items.length - 2)));
  };

  const startDrag = (handle: DragHandle, e: React.PointerEvent) => {
    if (!current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...current.crop },
    };
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !stageRef.current || !current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - dragRef.current.startX) / rect.width;
    const dy = (e.clientY - dragRef.current.startY) / rect.height;
    const s = dragRef.current.startCrop;
    const minSize = 0.18;

    let { x, y, w, h } = s;

    if (dragRef.current.handle === 'move') {
      x = Math.max(0, Math.min(1 - w, s.x + dx));
      y = Math.max(0, Math.min(1 - h, s.y + dy));
    } else if (dragRef.current.handle === 'nw') {
      const maxX = s.x + s.w - minSize;
      const maxY = s.y + s.h - minSize;
      x = Math.max(0, Math.min(maxX, s.x + dx));
      y = Math.max(0, Math.min(maxY, s.y + dy));
      w = s.x + s.w - x;
      h = s.y + s.h - y;
    } else if (dragRef.current.handle === 'ne') {
      const maxY = s.y + s.h - minSize;
      y = Math.max(0, Math.min(maxY, s.y + dy));
      w = Math.max(minSize, Math.min(1 - s.x, s.w + dx));
      h = s.y + s.h - y;
    } else if (dragRef.current.handle === 'sw') {
      const maxX = s.x + s.w - minSize;
      x = Math.max(0, Math.min(maxX, s.x + dx));
      w = s.x + s.w - x;
      h = Math.max(minSize, Math.min(1 - s.y, s.h + dy));
    } else if (dragRef.current.handle === 'se') {
      w = Math.max(minSize, Math.min(1 - s.x, s.w + dx));
      h = Math.max(minSize, Math.min(1 - s.y, s.h + dy));
    }

    updateCurrent((it) => ({
      ...it,
      crop: { x, y, w, h },
    }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const buildProcessedFiles = async (): Promise<File[]> => {
    const result: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.isImage) {
        result.push(item.file);
        continue;
      }
      const isModified =
        item.rotation !== 0 ||
        item.enhanceDoc ||
        item.crop.x > 0.01 ||
        item.crop.y > 0.01 ||
        item.crop.w < 0.99 ||
        item.crop.h < 0.99;

      if (!isModified) {
        result.push(item.file);
        continue;
      }

      const processed = await processRosterImage(item.file, {
        rotation: item.rotation,
        crop: item.crop,
        enhanceDoc: item.enhanceDoc,
        maxDimension: 3072,
      });
      const baseName = item.file.name.replace(/\.[^.]+$/, '') || `cuadrante-${i + 1}`;
      result.push(new File([processed.blob], `${baseName}.jpg`, { type: processed.mimeType }));
    }
    return result;
  };

  const handleConfirm = async (
    mode: 'archive' | 'scan' | 'local',
    scope: 'all' | 'primary_only' = 'primary_only'
  ) => {
    setBusy(true);
    try {
      const files = await buildProcessedFiles();
      if (mode === 'archive') {
        await onArchiveOnly(files);
      } else if (mode === 'local' && onUseLocalParsed) {
        await onUseLocalParsed(files, scope);
      } else {
        await onScanWithAi(files, scope);
      }
    } finally {
      setBusy(false);
    }
  };

  const isCropped =
    current &&
    (current.crop.x > 0.01 ||
      current.crop.y > 0.01 ||
      current.crop.w < 0.99 ||
      current.crop.h < 0.99);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col pt-safe pb-safe">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white">Preparar cuadrante · {monthTitle}</h3>
          <p className="text-[11px] text-slate-400">
            Recorta, gira o añade una 2ª foto si el cuadrante está partido
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-full bg-slate-800 text-slate-300"
          aria-label="Cancelar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tira multipágina */}
      <div className="px-3 py-2 border-b border-slate-900 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {items.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => setActiveIdx(idx)}
            className={`relative shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-all ${
              idx === activeIdx
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            {item.previewUrl ? (
              <img
                src={item.previewUrl}
                alt={`Parte ${idx + 1}`}
                className="w-7 h-7 rounded-md object-cover bg-slate-950"
              />
            ) : (
              <FileText className="w-5 h-5 text-sky-400" />
            )}
            <span className="text-[11px] font-bold">Parte {idx + 1}</span>
            {items.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(idx);
                }}
                className="p-0.5 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                aria-label="Quitar página"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        <input
          id="bew-prep-cam-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePrepInputChange}
          className="sr-only"
        />
        <input
          id="bew-prep-gal-input"
          type="file"
          accept="image/*,application/pdf,.pdf,.csv,.txt"
          multiple
          onChange={handlePrepInputChange}
          className="sr-only"
        />

        {nativeApp ? (
          <button
            type="button"
            onClick={() => void handleAddNative('camera')}
            className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-900 border border-dashed border-slate-700 text-[11px] font-semibold text-amber-300"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>+ Foto</span>
          </button>
        ) : (
          <label
            htmlFor="bew-prep-cam-input"
            className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-900 border border-dashed border-slate-700 text-[11px] font-semibold text-amber-300 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>+ Foto</span>
          </label>
        )}

        {nativeApp ? (
          <button
            type="button"
            onClick={() => void handleAddNative('photos')}
            className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-900 border border-dashed border-slate-700 text-[11px] font-semibold text-sky-300"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>+ Galería</span>
          </button>
        ) : (
          <label
            htmlFor="bew-prep-gal-input"
            className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-900 border border-dashed border-slate-700 text-[11px] font-semibold text-sky-300 cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>+ Archivo</span>
          </label>
        )}
      </div>

      {/* Área de edición visual */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-hidden bg-[#06090F]">
        {current?.isImage && current.previewUrl ? (
          <div
            ref={stageRef}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative max-w-full max-h-full inline-flex items-center justify-center select-none touch-none"
          >
            <img
              src={current.previewUrl}
              alt="Vista previa"
              draggable={false}
              style={{
                transform: `rotate(${current.rotation}deg)`,
                filter: current.enhanceDoc
                  ? 'contrast(1.28) brightness(1.04) saturate(1.08)'
                  : undefined,
              }}
              className="max-w-full max-h-[50dvh] object-contain rounded-lg transition-transform duration-150"
            />

            {/* Marco de recorte interactivo */}
            <div
              onPointerDown={(e) => startDrag('move', e)}
              style={{
                left: `${current.crop.x * 100}%`,
                top: `${current.crop.y * 100}%`,
                width: `${current.crop.w * 100}%`,
                height: `${current.crop.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
              }}
              className="absolute border-2 border-amber-400 rounded-sm cursor-move"
            >
              {/* Esquinas táctiles */}
              <div
                onPointerDown={(e) => startDrag('nw', e)}
                className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-[#070B12] shadow cursor-nwse-resize"
              />
              <div
                onPointerDown={(e) => startDrag('ne', e)}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-[#070B12] shadow cursor-nesw-resize"
              />
              <div
                onPointerDown={(e) => startDrag('sw', e)}
                className="absolute -bottom-2.5 -left-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-[#070B12] shadow cursor-nesw-resize"
              />
              <div
                onPointerDown={(e) => startDrag('se', e)}
                className="absolute -bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-[#070B12] shadow cursor-nwse-resize"
              />
            </div>
          </div>
        ) : current ? (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2 max-w-xs">
            <FileText className="w-10 h-10 text-amber-400 mx-auto" />
            <div className="text-sm font-bold text-white truncate">{current.file.name}</div>
            <p className="text-xs text-slate-400">
              Documento listo para archivar o enviar al motor de IA.
            </p>
          </div>
        ) : null}
      </div>

      {/* Barra de herramientas */}
      <div className="px-3.5 py-3 border-t border-slate-800 bg-[#0B101B] space-y-2.5">
        {current?.isImage && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => rotateCurrent(-90)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>-90°</span>
              </button>
              <button
                type="button"
                onClick={() => rotateCurrent(90)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>+90°</span>
              </button>
              {isCropped && (
                <button
                  type="button"
                  onClick={() => updateCurrent((it) => ({ ...it, crop: { ...FULL_CROP } }))}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  <span>Todo</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => updateCurrent((it) => ({ ...it, enhanceDoc: !it.enhanceDoc }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                current.enhanceDoc
                  ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nitidez Doc</span>
              {current.enhanceDoc && <Check className="w-3 h-3" />}
            </button>
          </div>
        )}

        {hasLocalParsed && onUseLocalParsed && (
          <div className="p-2 rounded-2xl bg-emerald-500/12 border border-emerald-500/35 space-y-1.5">
            <div className="text-[11px] font-bold text-emerald-300">
              ⚡ Tabla COMINT detectada en el PDF (instantáneo, sin IA):
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm('local', 'primary_only')}
                className="py-2 px-2 rounded-xl bg-emerald-500 text-[#070B12] text-[11px] font-extrabold disabled:opacity-50"
              >
                Leer directo: Solo ZETO
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm('local', 'all')}
                className="py-2 px-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-[11px] font-bold disabled:opacity-50"
              >
                Leer directo: Todos
              </button>
            </div>
          </div>
        )}

        {hasPdfText && !hasLocalParsed && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-200">
            <FileText className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>PDF convertido a imagen + texto digital para escaneo rápido</span>
          </div>
        )}

        {/* Botones finales */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || !hasApiKey}
            onClick={() => void handleConfirm('scan', 'primary_only')}
            className="flex items-center justify-center gap-1.5 py-3 px-2.5 rounded-xl bg-amber-500 text-[#070B12] text-xs font-extrabold shadow-lg shadow-amber-500/20 disabled:opacity-45"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <User className="w-4 h-4" />
            )}
            <span>{hasApiKey ? 'Solo ZETO (Rápido)' : 'Falta API Key'}</span>
          </button>

          <button
            type="button"
            disabled={busy || !hasApiKey}
            onClick={() => void handleConfirm('scan', 'all')}
            className="flex items-center justify-center gap-1.5 py-3 px-2.5 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-extrabold disabled:opacity-45"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            <span>Todo el equipo</span>
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleConfirm('archive')}
          className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-semibold text-slate-300 disabled:opacity-50"
        >
          Solo archivar sin escanear
        </button>
      </div>
    </div>
  );
};
