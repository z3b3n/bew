import { isShiftCode } from '../constants/shifts';
import type { AppSettings, ShiftCode, User } from '../types';
import { getDaysInMonth, getWeekdayShort, pad2 } from '../utils/dateUtils';
import { processRosterImage } from '../utils/imageProcessing';
import { isPdfBlob } from '../utils/pdfHelper';
import { matchScannedUser, type ScannedRosterResult, type ScannedUserRow } from '../utils/rosterDiff';

const MAX_DIMENSION = 3072;
const PER_ATTEMPT_TIMEOUT_MS = 24000;
const TOTAL_SCAN_TIMEOUT_MS = 95000;

export interface ScanRosterOutput extends ScannedRosterResult {
  resolvedModel?: string;
}

export interface ScanRosterOptions {
  monthKey: string;
  settings: AppSettings;
  users: User[];
  primaryUser: User;
  scanScope: 'all' | 'primary_only';
  extractedPdfText?: string;
  localFallbackResult?: ScannedRosterResult | null;
  signal?: AbortSignal;
  onProgress?: (stage: string, pct: number) => void;
}

function blobToBase64Raw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function buildCalendarAnchor(monthKey: string): string {
  const days = getDaysInMonth(monthKey);
  const parts: string[] = [];
  for (let d = 1; d <= days; d++) {
    const wd = getWeekdayShort(`${monthKey}-${pad2(d)}`);
    parts.push(`${d}=${wd}`);
  }
  return parts.join(', ');
}

function buildWeekendAnchors(monthKey: string): string {
  const days = getDaysInMonth(monthKey);
  const weekends: string[] = [];
  for (let d = 1; d <= days; d++) {
    const wd = getWeekdayShort(`${monthKey}-${pad2(d)}`);
    if (wd === 'Sáb' || wd === 'Dom') {
      weekends.push(`${d}(${wd})`);
    }
  }
  return weekends.join(', ');
}

function buildVisionPrompt(options: {
  monthKey: string;
  users: User[];
  primaryUser: User;
  scanScope: 'all' | 'primary_only';
  fileCount: number;
  extractedPdfText?: string;
}): string {
  const { monthKey, users, primaryUser, scanScope, fileCount, extractedPdfText } = options;
  const totalDays = getDaysInMonth(monthKey);
  const calendarAnchor = buildCalendarAnchor(monthKey);
  const weekendAnchors = buildWeekendAnchors(monthKey);

  const teamHints = users
    .map((u) => (u.alias ? `${u.name} (alias: ${u.alias})` : u.name))
    .join(', ');

  const scopeInstruction =
    scanScope === 'primary_only'
      ? `ALCANCE: Extrae ÚNICAMENTE la fila correspondiente al usuario principal "${primaryUser.name}"${
          primaryUser.alias ? ` (o su alias "${primaryUser.alias}")` : ''
        }. Ignora al resto de trabajadores.`
      : `ALCANCE: Extrae TODOS los trabajadores/usuarios que aparezcan en la tabla del cuadrante (filas), manteniendo su nombre o alias legible. Nombres conocidos del equipo para ayudar al reconocimiento (solo úsalos si coinciden): ${teamHints}. Ignora filas de totales, recuentos o resumen al pie.`;

  const multiPageInstruction =
    fileCount > 1
      ? `\nMULTI-IMAGEN: Se adjuntan ${fileCount} imágenes/partes del MISMO cuadrante (por ejemplo días 1–15 y días 16–${totalDays}, o mitad superior e inferior). FUSIONA todas las partes en una única lista "rows" por trabajador sin duplicar filas ni perder días.`
      : '';

  const pdfTextBlock =
    extractedPdfText && extractedPdfText.trim().length > 30
      ? `\n\nTEXTO EXTRAÍDO DEL PDF (ordenado por filas; úsalo junto con la imagen para máxima velocidad y precisión):\n${extractedPdfText.slice(0, 14000)}`
      : '';

  return `Eres un sistema OCR de alta precisión especializado en cuadrantes de turnos laborales y cuadrantes COMINT en español.
Analiza el cuadrante adjunto. El mes esperado es "${monthKey}" (tiene exactamente ${totalDays} días).

GUÍA DE ANCLAJE DEL CALENDARIO PARA "${monthKey}" (úsalos para alinear exactamente cada columna sin desplazar ±1 día):
${calendarAnchor}

Códigos de turno válidos en la salida (usa EXACTAMENTE estos códigos):
- "M": Mañana (08:00-15:00)
- "T": Tarde (15:00-21:00)
- "N": Noche (21:00-08:00)
- "AN": Arco Nocturno (20:00-08:00). Si pone "ADN" o "AN", devuélvelo como "AN".
- "VN": Viernes Noche (20:00-08:00, 12h). Si pone "VN" o "V.N.", devuélvelo como "VN".
- "AD": Arco Diurno (08:00-20:00). Si pone "ADD" o "AD", devuélvelo como "AD".
- "PO": Permiso Oficial (si pone "PO" o "P.O.").
- "AP": Asuntos Propios (si pone "AP", "A.P." o "A/P").
- "C": Curso (si pone "C" o "CURSO").
- "L": Día Libre / Descanso. Si pone "PD", "OTRO", "A/C", "D", "DL", "LIBRE", "V", "VAC", "B", "BAJA", "X", "-" o es una celda blanca/vacía, devuélvelo como "L".
- "F": Festivo libre (si pone "F" o "FEST").

Instrucciones:
1. ${scopeInstruction}${multiPageInstruction}
2. REGLA CRÍTICA ANTI-DESPLAZAMIENTO DE COLUMNAS:
   - En los cuadrantes COMINT, las celdas BLANCAS / VACÍAS son días libres ("L"). ¡CUENTA CADA CELDA VACÍA INDIVIDUALMENTE! Nunca saltes una celda blanca ni desplaces los turnos siguientes hacia la izquierda.
   - Usa las columnas de FIN DE SEMANA (sombreadas en AMARILLO verticalmente en toda la tabla) como puntos de control exactos: en "${monthKey}" los fines de semana son EXACTAMENTE los días ${weekendAnchors}. Comprueba que el turno sobre cada franja amarilla vertical coincide con esos números de día, y que la última columna de la derecha sea el día ${totalDays}.
   - Los códigos 'PD', 'OTRO', 'A/C' o franjas rojas de vacaciones/baja son 'L', pero respeta 'C' (Curso), 'PO' (Permiso Oficial), 'AP' (Asuntos Propios) y 'VN' (Viernes Noche) tal cual. Incluye TODOS los días del 1 al ${totalDays} para cada trabajador.
3. Para cada usuario, devuelve "compactShifts" como una cadena compacta con los pares día:código separados por comas (ejemplo: "1:L,2:AD,3:AN,4:M"). Verifica columna por columna alineando día numérico y día de la semana.
4. Si la cabecera del cuadrante indica otro mes/año distinto a "${monthKey}", indícalo en "detectedMonthKey" con formato "YYYY-MM"; si coincide o no se ve el año, pon "${monthKey}".
5. Si la cabecera marca días festivos destacados en rojo/festivo, incluye sus números de día en "holidays".
6. Devuelve ÚNICAMENTE un objeto JSON válido con este esquema exacto, sin texto adicional:
{
  "detectedMonthKey": "${monthKey}",
  "holidays": [6, 8],
  "rows": [
    {
      "rawName": "ZETO",
      "compactShifts": "1:L,2:AD,3:AN"
    }
  ]
}${pdfTextBlock}`;
}

export function normalizeScannedCode(raw: string): ShiftCode | null {
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

function parseJsonResponse(rawText: string, fallbackMonthKey: string): ScannedRosterResult {
  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned) as {
    monthKey?: string;
    detectedMonthKey?: string;
    holidays?: unknown[];
    rows?: Array<{
      rawName?: string;
      compactShifts?: string;
      shifts?: Record<string, string>;
      entries?: Array<{ day?: unknown; shift?: unknown }>;
    }>;
  };

  if (!Array.isArray(parsed.rows)) {
    throw new Error('La respuesta del modelo no contiene la lista "rows" esperada.');
  }

  const rawDetected = String(parsed.detectedMonthKey ?? parsed.monthKey ?? '').trim();
  const validDetectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawDetected)
    ? rawDetected
    : fallbackMonthKey;
  const maxDays = getDaysInMonth(validDetectedMonth);

  const mergedRows = new Map<string, ScannedUserRow>();

  for (const row of parsed.rows) {
    const rawName = String(row.rawName ?? '').trim();
    if (!rawName) continue;
    const key = rawName.toUpperCase();
    const targetRow = mergedRows.get(key) ?? { rawName, shifts: {} };

    if (typeof row.compactShifts === 'string' && row.compactShifts.trim()) {
      const tokens = row.compactShifts.split(/[,;]+/);
      for (const tok of tokens) {
        const parts = tok.split(/[:=]/);
        if (parts.length < 2) continue;
        const day = Number(parts[0].trim());
        const normalized = normalizeScannedCode(parts[1]);
        if (Number.isInteger(day) && day >= 1 && day <= maxDays && normalized) {
          targetRow.shifts[day] = normalized;
        }
      }
    }

    if (Array.isArray(row.entries)) {
      for (const item of row.entries) {
        const day = Number(item?.day);
        const normalized = normalizeScannedCode(String(item?.shift ?? ''));
        if (Number.isInteger(day) && day >= 1 && day <= maxDays && normalized) {
          targetRow.shifts[day] = normalized;
        }
      }
    }

    if (row.shifts && typeof row.shifts === 'object') {
      for (const [k, v] of Object.entries(row.shifts)) {
        const day = Number(k);
        const normalized = normalizeScannedCode(String(v ?? ''));
        if (Number.isInteger(day) && day >= 1 && day <= maxDays && normalized) {
          targetRow.shifts[day] = normalized;
        }
      }
    }

    mergedRows.set(key, targetRow);
  }

  const holidays = Array.isArray(parsed.holidays)
    ? Array.from(
        new Set(
          parsed.holidays
            .map(Number)
            .filter((d) => Number.isInteger(d) && d >= 1 && d <= maxDays)
        )
      ).sort((a, b) => a - b)
    : [];

  return {
    monthKey: fallbackMonthKey,
    detectedMonthKey: validDetectedMonth,
    rows: Array.from(mergedRows.values()),
    holidays,
  };
}

const DEFAULT_GEMINI_FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
];

const EXCLUDED_MODEL_SUBSTRINGS = [
  'tts',
  'image',
  'imagen',
  'embedding',
  'veo',
  'aqa',
  'audio',
  'robotics',
  'computer-use',
  'learnlm',
  'gemma',
];

async function discoverExtraGeminiModels(apiKey: string, signal: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const valid = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(
        (name) =>
          Boolean(name) &&
          !EXCLUDED_MODEL_SUBSTRINGS.some((bad) => name.toLowerCase().includes(bad))
      );

    return valid.sort((a, b) => {
      const aFlash = a.includes('flash') && !a.includes('thinking') ? 0 : 1;
      const bFlash = b.includes('flash') && !b.includes('thinking') ? 0 : 1;
      if (aFlash !== bFlash) return aFlash - bFlash;
      return b.localeCompare(a);
    });
  } catch {
    return [];
  }
}

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function buildLocalFallback(
  localFallbackResult: ScannedRosterResult,
  scanScope: 'all' | 'primary_only',
  primaryUser: User
): ScannedRosterResult {
  if (scanScope !== 'primary_only') return localFallbackResult;
  const filtered = localFallbackResult.rows.filter((r) => {
    const matched = matchScannedUser(r.rawName, [primaryUser]);
    return Boolean(matched);
  });
  return {
    ...localFallbackResult,
    rows: filtered.length > 0 ? filtered : localFallbackResult.rows.slice(0, 1),
  };
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    detectedMonthKey: { type: 'STRING' },
    holidays: {
      type: 'ARRAY',
      items: { type: 'INTEGER' },
    },
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rawName: { type: 'STRING' },
          compactShifts: { type: 'STRING' },
        },
        required: ['rawName', 'compactShifts'],
      },
    },
  },
  required: ['detectedMonthKey', 'holidays', 'rows'],
};

async function callGeminiParts(
  model: string,
  apiKey: string,
  parts: GeminiPart[],
  signal: AbortSignal,
  opts: { useSchema: boolean; useThinkingCap: boolean }
): Promise<Response> {
  const cleanModel = model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const supportsThinkingCap =
    opts.useThinkingCap && (cleanModel.includes('2.5') || cleanModel.includes('flash-latest'));

  return fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        ...(opts.useSchema ? { responseSchema: GEMINI_RESPONSE_SCHEMA } : {}),
        ...(supportsThinkingCap ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
      },
    }),
  });
}

export async function scanRosterFiles(
  files: Blob[],
  options: ScanRosterOptions
): Promise<ScanRosterOutput> {
  const {
    monthKey,
    settings,
    users,
    primaryUser,
    scanScope,
    extractedPdfText,
    signal,
    onProgress,
  } = options;
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error('Configura tu API Key de Visión en Ajustes antes de escanear.');
  }
  if (files.length === 0) {
    throw new Error('No hay archivos seleccionados para escanear.');
  }

  // Wake Lock para evitar que iOS/Android apague la pantalla durante el fetch
  let wakeLock: { release: () => Promise<void> } | null = null;
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock) {
      wakeLock = await nav.wakeLock.request('screen');
    }
  } catch {
    // Ignorar si el navegador no soporta WakeLock
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TOTAL_SCAN_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    onProgress?.('Preparando archivos e imagen...', 20);
    const prompt = buildVisionPrompt({
      monthKey,
      users,
      primaryUser,
      scanScope,
      fileCount: files.length,
      extractedPdfText,
    });

    if (settings.visionProvider === 'gemini') {
      const parts: GeminiPart[] = [{ text: prompt }];

      for (let i = 0; i < files.length; i++) {
        const blob = files[i];
        const fileName = (blob as File).name;
        const isPdf = await isPdfBlob(blob, fileName);
        const isText =
          blob.type.startsWith('text/') ||
          blob.type === 'application/csv' ||
          blob.type === 'application/vnd.ms-excel';

        if (isPdf) {
          const base64 = await blobToBase64Raw(blob);
          parts.push({ inlineData: { mimeType: 'application/pdf', data: base64 } });
        } else if (isText) {
          const textContent = await blob.text();
          parts.push({ text: `\nContenido del archivo CSV/texto (${i + 1}):\n${textContent}` });
        } else {
          const { base64, mimeType } = await processRosterImage(blob, {
            rotation: 0,
            enhanceDoc: false,
            maxDimension: MAX_DIMENSION,
          });
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
      }

      onProgress?.('Leyendo turnos con Gemini IA...', 55);
      const configuredModel = (settings.model.trim() || 'gemini-flash-latest').replace(
        /^models\//,
        ''
      );
      const candidates = Array.from(
        new Set([configuredModel, ...DEFAULT_GEMINI_FALLBACK_MODELS])
      );

      let discoveredAdded = false;
      let firstStatusWas404 = false;
      let lastErrMsg = '';

      for (let idx = 0; idx < candidates.length; idx++) {
        const candidate = candidates[idx];
        const attemptController = new AbortController();
        let attemptTimedOut = false;
        const attemptTimer = setTimeout(() => {
          attemptTimedOut = true;
          attemptController.abort();
        }, PER_ATTEMPT_TIMEOUT_MS);
        const forwardGlobalAbort = () => attemptController.abort();
        controller.signal.addEventListener('abort', forwardGlobalAbort, { once: true });

        let res: Response;
        try {
          res = await callGeminiParts(candidate, apiKey, parts, attemptController.signal, {
            useSchema: true,
            useThinkingCap: true,
          });

          if (res.status === 400) {
            res = await callGeminiParts(candidate, apiKey, parts, attemptController.signal, {
              useSchema: false,
              useThinkingCap: false,
            });
          }
        } catch (attemptErr) {
          clearTimeout(attemptTimer);
          controller.signal.removeEventListener('abort', forwardGlobalAbort);

          // Si se colgó este modelo concreto (24s) pero el escaneo global sigue activo, saltamos al siguiente
          if (
            attemptTimedOut &&
            !controller.signal.aborted &&
            idx < candidates.length - 1
          ) {
            const nextCandidate = candidates[idx + 1];
            lastErrMsg = `Modelo ${candidate} tardó demasiado en responder.`;
            onProgress?.(
              `${candidate} no responde (24s), saltando a ${nextCandidate}...`,
              60
            );
            continue;
          }
          throw attemptErr;
        }

        clearTimeout(attemptTimer);
        controller.signal.removeEventListener('abort', forwardGlobalAbort);

        if (res.ok) {
          onProgress?.('Calculando diferencias y validando días...', 85);
          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            throw new Error('Gemini no devolvió texto interpretable.');
          }
          const parsed = parseJsonResponse(text, monthKey);
          onProgress?.('Completado', 100);
          return {
            ...parsed,
            // Solo guardamos el nuevo modelo si el configurado dio 404 (no por 503 puntual)
            resolvedModel: firstStatusWas404 ? candidate : undefined,
          };
        }

        const errText = await res.text();
        lastErrMsg = `Error Gemini (${res.status}): ${errText.slice(0, 200)}`;
        if (idx === 0 && res.status === 404) {
          firstStatusWas404 = true;
        }

        const isRetryableStatus =
          res.status === 503 ||
          res.status === 429 ||
          res.status === 500 ||
          res.status === 502 ||
          res.status === 504 ||
          res.status === 404;

        if (!isRetryableStatus) {
          throw new Error(lastErrMsg);
        }

        if (!discoveredAdded) {
          discoveredAdded = true;
          const extra = await discoverExtraGeminiModels(apiKey, controller.signal);
          for (const m of extra) {
            if (!candidates.includes(m)) candidates.push(m);
          }
        }

        const nextCandidate = candidates[idx + 1];
        if (nextCandidate) {
          onProgress?.(
            `Servidor de ${candidate} saturado (${res.status}), cambiando a ${nextCandidate}...`,
            60
          );
          await sleepAbortable(650, controller.signal);
        }
      }

      if (options.localFallbackResult && options.localFallbackResult.rows.length > 0) {
        onProgress?.('Usando lector local del PDF...', 90);
        return buildLocalFallback(options.localFallbackResult, scanScope, primaryUser);
      }

      throw new Error(lastErrMsg || 'No se pudo conectar con ningún modelo de Gemini.');
    }

    // OpenAI o endpoint compatible
    for (const b of files) {
      if (await isPdfBlob(b, (b as File).name)) {
        throw new Error(
          'El escaneo directo de PDF sin renderizar requiere Gemini. Prueba de nuevo o usa Gemini en Ajustes.'
        );
      }
    }

    const baseEndpoint =
      settings.visionProvider === 'custom' && settings.customEndpoint?.trim()
        ? settings.customEndpoint.trim().replace(/\/+$/, '')
        : 'https://api.openai.com/v1';

    const endpoint = baseEndpoint.endsWith('/chat/completions')
      ? baseEndpoint
      : `${baseEndpoint}/chat/completions`;

    const model = settings.model.trim() || 'gpt-4o-mini';

    const messageContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    > = [{ type: 'text', text: prompt }];

    for (let i = 0; i < files.length; i++) {
      const blob = files[i];
      const isText =
        blob.type.startsWith('text/') ||
        blob.type === 'application/csv' ||
        blob.type === 'application/vnd.ms-excel';

      if (isText) {
        messageContent.push({
          type: 'text',
          text: `\nContenido del archivo (${i + 1}):\n${await blob.text()}`,
        });
      } else {
        const { base64, mimeType } = await processRosterImage(blob, {
          rotation: 0,
          enhanceDoc: false,
          maxDimension: MAX_DIMENSION,
        });
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
            detail: 'high',
          },
        });
      }
    }

    onProgress?.('Leyendo turnos con Visión IA...', 55);
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: messageContent,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error API Visión (${res.status}): ${errText.slice(0, 220)}`);
    }

    onProgress?.('Calculando diferencias y validando días...', 85);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('El modelo de visión no devolvió contenido.');
    }

    const parsed = parseJsonResponse(content, monthKey);
    onProgress?.('Completado', 100);
    return parsed;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        throw new Error(
          'Tiempo de espera agotado (95s). Prueba con "⚡ Leer PDF directo" o revisa tu conexión.'
        );
      }
      throw new Error('Escaneo cancelado por el usuario.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    if (wakeLock) {
      void wakeLock.release().catch(() => undefined);
    }
  }
}

export async function scanRosterImage(
  blob: Blob,
  monthKey: string,
  settings: AppSettings,
  users: User[] = [],
  primaryUser: User = { id: 'zeto', name: 'ZETO', color: '#F59E0B', isPrimary: true, createdAt: 1 }
): Promise<ScanRosterOutput> {
  return scanRosterFiles([blob], {
    monthKey,
    settings,
    users,
    primaryUser,
    scanScope: 'all',
  });
}
