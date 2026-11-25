import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export type RotationAngle = 0 | 90 | 180 | 270;

export interface NormalizedCrop {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Captura una foto o selecciona de galería usando la cámara nativa en iOS/Android (Capacitor).
 * En web/PWA devuelve null para usar el selector de archivos estándar.
 */
export async function captureWithNativeCamera(source: 'camera' | 'photos'): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 95,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,
    });

    if (!photo.webPath) return null;
    const response = await fetch(photo.webPath);
    if (!response.ok) return null;
    const blob = await response.blob();
    const ext = photo.format || 'jpeg';
    const mimeType = blob.type || `image/${ext}`;
    return new File([blob], `cuadrante-${Date.now()}.${ext}`, { type: mimeType });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    // Si el usuario cancela el diálogo nativo, no propagamos error
    if (msg.includes('cancel') || msg.includes('user cancelled')) {
      return null;
    }
    throw err;
  }
}

export function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen seleccionada.'));
    };
    img.src = url;
  });
}

function enhanceDocumentContrast(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Muestreo rápido de luminancia para estirar niveles sin quemar colores (mantiene rojos de festivos)
  const hist = new Uint32Array(256);
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 40000));

  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  const sampled = Math.ceil(totalPixels / step);
  const lowTarget = Math.floor(sampled * 0.02);
  const highTarget = Math.floor(sampled * 0.985);

  let acc = 0;
  let minLum = 0;
  for (let l = 0; l < 256; l++) {
    acc += hist[l];
    if (acc >= lowTarget) {
      minLum = l;
      break;
    }
  }

  acc = 0;
  let maxLum = 255;
  for (let l = 255; l >= 0; l--) {
    acc += hist[l];
    if (acc >= sampled - highTarget) {
      maxLum = l;
      break;
    }
  }

  const range = Math.max(40, maxLum - minLum);
  const contrastFactor = 1.18;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let val = ((data[i + c] - minLum) * 255) / range;
      val = (val - 128) * contrastFactor + 128;
      data[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export async function processRosterImage(
  blob: Blob,
  opts: {
    rotation: RotationAngle;
    crop?: NormalizedCrop;
    enhanceDoc: boolean;
    maxDimension?: number;
  }
): Promise<{
  blob: Blob;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}> {
  const img = await loadImageElement(blob);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const isQuarterTurn = opts.rotation === 90 || opts.rotation === 270;
  const rotW = isQuarterTurn ? srcH : srcW;
  const rotH = isQuarterTurn ? srcW : srcH;

  // 1. Lienzo rotado
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) {
    throw new Error('No se pudo inicializar el lienzo para rotar la imagen.');
  }

  rotCtx.save();
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate((opts.rotation * Math.PI) / 180);
  rotCtx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
  rotCtx.restore();

  // 2. Recorte normalizado sobre el lienzo rotado
  const crop = opts.crop ?? FULL_CROP;
  const sx = Math.max(0, Math.min(rotW - 1, Math.round(crop.x * rotW)));
  const sy = Math.max(0, Math.min(rotH - 1, Math.round(crop.y * rotH)));
  const sw = Math.max(1, Math.min(rotW - sx, Math.round(crop.w * rotW)));
  const sh = Math.max(1, Math.min(rotH - sy, Math.round(crop.h * rotH)));

  // 3. Reescalado a resolución óptima para tablas de 31 días
  const maxDim = opts.maxDimension ?? 3072;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const targetW = Math.max(1, Math.round(sw * scale));
  const targetH = Math.max(1, Math.round(sh * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('No se pudo inicializar el lienzo de salida.');
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

  if (opts.enhanceDoc) {
    enhanceDocumentContrast(outCtx, targetW, targetH);
  }

  const mimeType = 'image/jpeg';
  const dataUrl = outCanvas.toDataURL(mimeType, 0.9);
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('No se pudo exportar la imagen procesada.'));
      },
      mimeType,
      0.9
    );
  });

  return {
    blob: outBlob,
    base64,
    mimeType,
    width: targetW,
    height: targetH,
  };
}

export async function readImageFromClipboard(): Promise<File[]> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    throw new Error('Tu navegador no permite leer el portapapeles con botón; usa Ctrl+V / Pegar.');
  }

  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const imgType = item.types.find((t) => t.startsWith('image/'));
    if (imgType) {
      const blob = await item.getType(imgType);
      const ext = imgType.split('/')[1] || 'png';
      files.push(new File([blob], `pegado-${Date.now()}.${ext}`, { type: imgType }));
    }
  }

  if (files.length === 0) {
    throw new Error('No hay ninguna imagen copiada en el portapapeles.');
  }
  return files;
}
