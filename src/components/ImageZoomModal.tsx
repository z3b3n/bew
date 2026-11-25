import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface ZoomImageItem {
  url: string;
  label?: string;
}

interface ImageZoomModalProps {
  imageUrl?: string;
  images?: ZoomImageItem[];
  initialIndex?: number;
  title: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  imageUrl,
  images,
  initialIndex = 0,
  title,
  onClose,
}) => {
  const gallery: ZoomImageItem[] =
    images && images.length > 0 ? images : imageUrl ? [{ url: imageUrl }] : [];

  const [pageIdx, setPageIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, gallery.length - 1))
  );
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
  } | null>(null);

  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, [pageIdx]);

  const currentItem = gallery[pageIdx];
  if (!currentItem) return null;

  const clampScale = (s: number) => Math.min(5, Math.max(0.8, Number(s.toFixed(2))));

  const zoomIn = () => setScale((s) => clampScale(s + 0.5));
  const zoomOut = () => {
    setScale((s) => {
      const next = clampScale(s - 0.5);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };
  const reset = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const toggleDoubleTapZoom = () => {
    if (scale > 1.2) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDist: getTouchDist(e.touches),
        startScale: scale,
      };
      panRef.current = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 260) {
        toggleDoubleTapZoom();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1) {
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          originX: offset.x,
          originY: offset.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dist = getTouchDist(e.touches);
      const ratio = dist / Math.max(1, pinchRef.current.startDist);
      const next = clampScale(pinchRef.current.startScale * ratio);
      setScale(next);
      if (next <= 1) setOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panRef.current && scale > 1) {
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setOffset({
        x: panRef.current.originX + dx,
        y: panRef.current.originY + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      panRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col pt-safe pb-safe select-none">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          {gallery.length > 1 && (
            <p className="text-[11px] text-amber-300 font-medium">
              Página {pageIdx + 1} de {gallery.length}
              {currentItem.label ? ` · ${currentItem.label}` : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={zoomOut}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
            aria-label="Alejar"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-slate-300 min-w-[42px] text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
            aria-label="Acercar"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
            aria-label="Rotar 90 grados"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
            aria-label="Restablecer zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-500/20 text-rose-300 ml-1"
            aria-label="Cerrar visor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden flex items-center justify-center p-3 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={toggleDoubleTapZoom}
        onWheel={handleWheel}
      >
        <img
          src={currentItem.url}
          alt={currentItem.label || title}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: pinchRef.current || panRef.current ? 'none' : 'transform 140ms ease-out',
          }}
          className="max-w-full max-h-full object-contain rounded-lg"
        />

        {gallery.length > 1 && (
          <>
            <button
              type="button"
              disabled={pageIdx === 0}
              onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/70 border border-white/15 text-white disabled:opacity-25"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={pageIdx === gallery.length - 1}
              onClick={() => setPageIdx((i) => Math.min(gallery.length - 1, i + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/70 border border-white/15 text-white disabled:opacity-25"
              aria-label="Página siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      <div className="px-4 py-2 text-center text-[11px] text-slate-500 border-t border-slate-900">
        Pellizca con dos dedos o haz doble toque para ampliar · Arrastra para mover
      </div>
    </div>
  );
};
