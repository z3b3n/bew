import { isShiftCode } from '../constants/shifts';
import type { ShiftCode } from '../types';
import { getDaysInMonth } from './dateUtils';
import type { ScannedRosterResult, ScannedUserRow } from './rosterDiff';

export async function isPdfBlob(blob: Blob, fileName?: string): Promise<boolean> {
  if (blob.type === 'application/pdf') return true;
  if (fileName && fileName.toLowerCase().endsWith('.pdf')) return true;
  if (blob.size >= 5) {
    try {
      const header = await blob.slice(0, 5).text();
      if (header === '%PDF-') return true;
    } catch {
      return false;
    }
  }
  return false;
}

interface TextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
}

interface PositionedToken {
  str: string;
  x: number;
  y: number;
  width: number;
}

function normalizePdfShiftCode(raw: string): ShiftCode | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  if (isShiftCode(code)) return code;
  if (code === 'ADD') return 'AD';
  if (code === 'ADN') return 'AN';
  if (code === 'FEST' || code === 'FESTIVO') return 'F';
  if (
    code === 'C' ||
    code === 'AP' ||
    code === 'PD' ||
    code === 'OTRO' ||
    code === 'A/C' ||
    code === 'AC' ||
    code === 'D' ||
    code === 'DL' ||
    code === 'LIBRE' ||
    code === 'V' ||
    code === 'VAC' ||
    code === 'B' ||
    code === 'BAJA' ||
    code === 'PERMISO' ||
    code === 'P' ||
    code === 'X' ||
    code === '-'
  ) {
    return 'L';
  }
  return null;
}

const DAY_HEADER_RE =
  /^(?:[LMXJVSD]|LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)?[-./\s]*0?([1-9]|[12]\d|3[01])$/i;

const IGNORED_ROW_NAMES_RE =
  /^(?:CUADRANTE|COMINT|TOTAL|TOTALES|LEYENDA|HORAS|OBSERVACIONES|FIRMA|DIAS|DÍAS|TURNO|TURNOS|MAÑANA|TARDE|NOCHE|MES|AÑO|FECHA|PERSONAL|EQUIPO|BATALLON|BATALLÓN)/i;

function splitMultiTokens(item: PositionedToken): Array<{ text: string; xCenter: number }> {
  const trimmed = item.str.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return [{ text: trimmed, xCenter: item.x + item.width / 2 }];
  }
  const totalChars = Math.max(1, trimmed.length);
  const res: Array<{ text: string; xCenter: number }> = [];
  let cursor = 0;
  for (const part of parts) {
    const idx = trimmed.indexOf(part, cursor);
    const centerChar = idx + part.length / 2;
    const xCenter = item.x + (centerChar / totalChars) * Math.max(item.width, parts.length * 8);
    res.push({ text: part, xCenter });
    cursor = idx + part.length;
  }
  return res;
}

function parseStructuredPdfTable(
  pagesTokens: PositionedToken[][],
  monthKey: string
): ScannedRosterResult | null {
  const maxDays = getDaysInMonth(monthKey);
  const mergedRows = new Map<string, ScannedUserRow>();

  for (const pageItems of pagesTokens) {
    if (pageItems.length === 0) continue;

    // Agrupar por filas (tolerancia +-4.5 pt en Y)
    const rows: Array<{ y: number; items: PositionedToken[] }> = [];
    for (const it of pageItems) {
      const existing = rows.find((r) => Math.abs(r.y - it.y) <= 4.5);
      if (existing) {
        existing.items.push(it);
      } else {
        rows.push({ y: it.y, items: [it] });
      }
    }

    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
    }

    let currentCols: Array<{ day: number; xCenter: number }> = [];
    let colStep = 18;
    let firstDayX = 0;

    for (const row of rows) {
      const tokens = row.items.flatMap(splitMultiTokens);
      if (tokens.length === 0) continue;

      // Detectar cabecera de días (al menos 7 días distintos entre 1..maxDays)
      const headerCandidates: Array<{ day: number; xCenter: number }> = [];
      const seenDays = new Set<number>();
      for (const tok of tokens) {
        const m = tok.text.match(DAY_HEADER_RE);
        if (m) {
          const day = Number(m[1]);
          if (Number.isInteger(day) && day >= 1 && day <= maxDays && !seenDays.has(day)) {
            seenDays.add(day);
            headerCandidates.push({ day, xCenter: tok.xCenter });
          }
        }
      }

      if (headerCandidates.length >= 7) {
        headerCandidates.sort((a, b) => a.xCenter - b.xCenter);
        currentCols = headerCandidates;
        firstDayX = currentCols[0].xCenter;
        let stepSum = 0;
        let stepCount = 0;
        for (let i = 1; i < currentCols.length; i++) {
          const diff = currentCols[i].xCenter - currentCols[i - 1].xCenter;
          if (diff > 4) {
            stepSum += diff;
            stepCount++;
          }
        }
        colStep = stepCount > 0 ? stepSum / stepCount : 18;
        continue;
      }

      if (currentCols.length === 0) continue;

      // Separar nombre a la izquierda y celdas de días a la derecha
      const nameThreshold = firstDayX - colStep * 0.6;
      const nameParts: string[] = [];
      const shiftMapForRow: Record<number, ShiftCode> = {};
      let recognizedCount = 0;

      for (const tok of tokens) {
        if (tok.xCenter < nameThreshold) {
          nameParts.push(tok.text);
        } else {
          const normalized = normalizePdfShiftCode(tok.text);
          if (!normalized) continue;

          // Buscar la columna más cercana
          let bestCol: { day: number; xCenter: number } | null = null;
          let bestDist = Infinity;
          for (const col of currentCols) {
            const dist = Math.abs(tok.xCenter - col.xCenter);
            if (dist < bestDist) {
              bestDist = dist;
              bestCol = col;
            }
          }
          if (bestCol && bestDist <= colStep * 0.85) {
            shiftMapForRow[bestCol.day] = normalized;
            recognizedCount++;
          }
        }
      }

      const rawName = nameParts
        .join(' ')
        .replace(/^\d+[.)-]*\s*/, '')
        .trim();

      if (
        !rawName ||
        rawName.length < 2 ||
        /^\d+$/.test(rawName) ||
        IGNORED_ROW_NAMES_RE.test(rawName)
      ) {
        continue;
      }

      if (recognizedCount === 0) continue;

      const key = rawName.toUpperCase();
      const targetRow = mergedRows.get(key) ?? { rawName, shifts: {} };

      // En cuadrantes COMINT, las celdas vacías dentro de la tabla son días libres ('L')
      for (const col of currentCols) {
        targetRow.shifts[col.day] = shiftMapForRow[col.day] ?? targetRow.shifts[col.day] ?? 'L';
      }

      mergedRows.set(key, targetRow);
    }
  }

  const finalRows = Array.from(mergedRows.values());
  if (finalRows.length === 0) return null;

  return {
    monthKey,
    detectedMonthKey: monthKey,
    rows: finalRows,
    holidays: [],
  };
}

export async function convertPdfToImagesAndText(
  blob: Blob,
  monthKey = '',
  maxPages = 8
): Promise<{
  pageFiles: File[];
  extractedText: string;
  localParsed: ScannedRosterResult | null;
}> {
  try {
    const pdfWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as Record<string, unknown>).pdfjsWorker = pdfWorker;
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const buffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    const totalPages = Math.min(pdf.numPages, maxPages);
    const pageFiles: File[] = [];
    const textPages: string[] = [];
    const pagesTokens: PositionedToken[][] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // 1. Extraer texto con coordenadas X/Y
      try {
        const textContent = await page.getTextContent();
        const pageTokens: PositionedToken[] = [];
        const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];

        for (const rawItem of textContent.items as TextItemLike[]) {
          const str = (rawItem.str ?? '').trim();
          if (!str || !Array.isArray(rawItem.transform) || rawItem.transform.length < 6) {
            continue;
          }
          const x = rawItem.transform[4];
          const y = rawItem.transform[5];
          const width = rawItem.width ?? str.length * 6;
          pageTokens.push({ str, x, y, width });

          const existingRow = rows.find((r) => Math.abs(r.y - y) <= 4.5);
          if (existingRow) {
            existingRow.items.push({ x, str });
          } else {
            rows.push({ y, items: [{ x, str }] });
          }
        }

        pagesTokens.push(pageTokens);
        rows.sort((a, b) => b.y - a.y);
        const lines = rows.map((r) => {
          r.items.sort((a, b) => a.x - b.x);
          return r.items.map((it) => it.str).join(' ');
        });

        const pageText = lines.join('\n').trim();
        if (pageText) {
          textPages.push(`--- Página ${pageNum} ---\n${pageText}`);
        }
      } catch {
        // Si falla la extracción de texto en una página, seguimos con la imagen
      }

      // 2. Renderizar la página como imagen JPEG nítida
      const baseViewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(2.0, 2600 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        const imgBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
        );
        if (imgBlob) {
          pageFiles.push(new File([imgBlob], `pagina-${pageNum}.jpg`, { type: 'image/jpeg' }));
        }
      }
    }

    const localParsed = monthKey ? parseStructuredPdfTable(pagesTokens, monthKey) : null;

    return {
      pageFiles,
      extractedText: textPages.join('\n\n'),
      localParsed,
    };
  } catch {
    return {
      pageFiles: [],
      extractedText: '',
      localParsed: null,
    };
  }
}
