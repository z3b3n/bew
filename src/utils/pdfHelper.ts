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
  if (code === 'V.N' || code === 'V.N.') return 'VN';
  if (code === 'P.O' || code === 'P.O.' || code === 'PERMISO OFICIAL') return 'PO';
  if (code === 'A.P' || code === 'A.P.' || code === 'A/P') return 'AP';
  if (code === 'CURSO') return 'C';
  if (code === 'FEST' || code === 'FESTIVO') return 'F';
  if (
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

interface DayColumn {
  day: number;
  xCenter: number;
  leftBound: number;
  rightBound: number;
}

function buildInterpolatedColumns(
  headerCandidates: Array<{ day: number; xCenter: number }>,
  maxDays: number
): { cols: DayColumn[]; medianStep: number; firstDayX: number } {
  const sorted = [...headerCandidates].sort((a, b) => a.xCenter - b.xCenter);
  const perDaySteps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dayDiff = sorted[i].day - sorted[i - 1].day;
    const xDiff = sorted[i].xCenter - sorted[i - 1].xCenter;
    if (dayDiff > 0 && xDiff > 4) {
      perDaySteps.push(xDiff / dayDiff);
    }
  }
  perDaySteps.sort((a, b) => a - b);
  const medianStep =
    perDaySteps.length > 0 ? perDaySteps[Math.floor(perDaySteps.length / 2)] : 18;

  const byDay = new Map<number, number>();
  for (const c of sorted) {
    byDay.set(c.day, c.xCenter);
  }

  const minDetected = sorted[0].day;
  const maxDetected = sorted[sorted.length - 1].day;
  const startDay = minDetected <= 2 ? 1 : minDetected;
  const endDay = maxDetected >= maxDays - 1 ? maxDays : maxDetected;

  const complete: Array<{ day: number; xCenter: number }> = [];
  for (let d = startDay; d <= endDay; d++) {
    const exact = byDay.get(d);
    if (exact !== undefined) {
      complete.push({ day: d, xCenter: exact });
      continue;
    }
    // Interpolar desde el día conocido más cercano
    let nearestDay = sorted[0].day;
    let nearestX = sorted[0].xCenter;
    let minDiff = Infinity;
    for (const c of sorted) {
      const diff = Math.abs(c.day - d);
      if (diff < minDiff) {
        minDiff = diff;
        nearestDay = c.day;
        nearestX = c.xCenter;
      }
    }
    complete.push({
      day: d,
      xCenter: nearestX + (d - nearestDay) * medianStep,
    });
  }

  const cols: DayColumn[] = complete.map((c, idx) => {
    const leftBound =
      idx === 0 ? c.xCenter - medianStep * 0.55 : (complete[idx - 1].xCenter + c.xCenter) / 2;
    const rightBound =
      idx === complete.length - 1
        ? c.xCenter + medianStep * 0.55
        : (c.xCenter + complete[idx + 1].xCenter) / 2;
    return {
      day: c.day,
      xCenter: c.xCenter,
      leftBound,
      rightBound,
    };
  });

  return {
    cols,
    medianStep,
    firstDayX: cols[0]?.xCenter ?? sorted[0].xCenter,
  };
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

    let currentCols: DayColumn[] = [];
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
        const built = buildInterpolatedColumns(headerCandidates, maxDays);
        currentCols = built.cols;
        colStep = built.medianStep;
        firstDayX = built.firstDayX;
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

          // Asignar al rango exacto [leftBound, rightBound] de su columna
          const targetCol = currentCols.find(
            (col) => tok.xCenter >= col.leftBound && tok.xCenter <= col.rightBound
          );
          if (targetCol) {
            shiftMapForRow[targetCol.day] = normalized;
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

function buildExplicitPdfText(localParsed: ScannedRosterResult): string {
  return localParsed.rows
    .map((row) => {
      const pairs = Object.keys(row.shifts)
        .map(Number)
        .sort((a, b) => a - b)
        .map((d) => `${d}=${row.shifts[d]}`)
        .join(', ');
      return `${row.rawName}: ${pairs}`;
    })
    .join('\n');
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
    const pagesTokens: PositionedToken[][] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // 1. Extraer texto con coordenadas X/Y sin combinar celdas separadas por huecos
      try {
        const textContent = await page.getTextContent({
          disableCombineTextItems: true,
        } as Parameters<typeof page.getTextContent>[0]);
        const pageTokens: PositionedToken[] = [];

        for (const rawItem of textContent.items as TextItemLike[]) {
          const str = (rawItem.str ?? '').trim();
          if (!str || !Array.isArray(rawItem.transform) || rawItem.transform.length < 6) {
            continue;
          }
          const x = rawItem.transform[4];
          const y = rawItem.transform[5];
          const width = rawItem.width ?? str.length * 6;
          pageTokens.push({ str, x, y, width });
        }

        pagesTokens.push(pageTokens);
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
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
        );
        if (imgBlob) {
          pageFiles.push(new File([imgBlob], `pagina-${pageNum}.jpg`, { type: 'image/jpeg' }));
        }
      }
    }

    const localParsed = monthKey ? parseStructuredPdfTable(pagesTokens, monthKey) : null;
    // Solo enviamos texto estructurado explícito si se alinearon las columnas; nunca texto con huecos colapsados
    const extractedText = localParsed ? buildExplicitPdfText(localParsed) : '';

    return {
      pageFiles,
      extractedText,
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
