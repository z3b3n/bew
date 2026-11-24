import React, { useState } from 'react';
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageZoomModalProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ imageUrl, title, onClose }) => {
  const [scale, setScale] = useState(1);

  const zoomIn = () => setScale((s) => Math.min(4, Number((s + 0.4).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.6, Number((s - 0.4).toFixed(2))));
  const reset = () => setScale(1);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col pt-safe pb-safe">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white truncate pr-2">{title}</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={zoomOut}
            className="p-2 rounded-xl bg-slate-800 text-slate-200"
            aria-label="Alejar"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-300 min-w-[46px] text-center">
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

      <div className="flex-1 overflow-auto flex items-center justify-center p-4 touch-pan-x touch-pan-y">
        <img
          src={imageUrl}
          alt={title}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 120ms ease-out',
          }}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
        />
      </div>
    </div>
  );
};
