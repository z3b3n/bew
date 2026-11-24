import { isShiftCode } from '../constants/shifts';
import type { AppSettings, ShiftCode } from '../types';
import type { ScannedRosterResult, ScannedUserRow } from '../utils/rosterDiff';

const MAX_DIMENSION = 2048;

export interface ScanRosterOutput extends ScannedRosterResult {
  resolvedModel?: string;
}

async function compressImageToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const imageBitmap = await createImageBitmap(blob);
  const { width, height } = imageBitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el lienzo para procesar la imagen.');
  }
  ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);
  imageBitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const commaIdx = dataUrl.indexOf(',');
  return {
    base64: dataUrl.slice(commaIdx + 1),
    mimeType: 'image/jpeg',
  };
}

function buildVisionPrompt(monthKey: string): string {
  return `Eres un sistema OCR de alta precisión especializado en cuadrantes de turnos laborales y cuadrantes COMINT en español.
Analiza la imagen del cuadrante correspondiente al mes "${monthKey}" (formato YYYY-MM).

Códigos de turno válidos en la salida (usa EXACTAMENTE estos códigos):
- "M": Mañana (08:00-15:00)
- "T": Tarde (15:00-21:00)
- "N": Noche (21:00-08:00)
- "AN": Arco Nocturno (20:00-08:00). Si en la imagen pone "ADN" o "AN", devuélvelo como "AN".
- "AD": Arco Diurno (08:00-20:00). Si en la imagen pone "ADD" o "AD", devuélvelo como "AD".
- "L": Día Libre / Descanso. Si en la imagen pone "C", "AP", "PD", "OTRO", "D", "X" o está vacío como descanso, devuélvelo como "L".
- "F": Festivo libre.

Instrucciones:
1. Extrae TODOS los trabajadores/usuarios que aparezcan en la tabla del cuadrante (filas), manteniendo su nombre o alias legible (por ejemplo ZETO, MARIO, JAVI, RAFA, etc.). Ignora filas de totales o resumen al pie.
2. Para cada usuario, extrae los turnos de cada día del mes (claves numéricas de "1" a "31" según las columnas de días visibles).
3. Si la cabecera del cuadrante marca días festivos o fines de semana destacados en rojo/festivo, incluye los festivos en "holidays".
4. Devuelve ÚNICAMENTE un objeto JSON válido con este esquema exacto, sin texto adicional:
{
  "monthKey": "${monthKey}",
  "holidays": [6, 8],
  "rows": [
    {
      "rawName": "ZETO",
      "shifts": { "1": "L", "2": "AD", "3": "AN" }
    }
  ]
}`;
}

function normalizeScannedCode(raw: string): ShiftCode | null {
  const code = raw.trim().toUpperCase();
  if (isShiftCode(code)) return code;
  if (code === 'ADD') return 'AD';
  if (code === 'ADN') return 'AN';
  if (code === 'C' || code === 'AP' || code === 'PD' || code === 'OTRO' || code === 'D' || code === 'X') {
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
    holidays?: unknown[];
    rows?: Array<{ rawName?: string; shifts?: Record<string, string> }>;
  };

  if (!Array.isArray(parsed.rows)) {
    throw new Error('La respuesta del modelo no contiene la lista "rows" esperada.');
  }

  const rows: ScannedUserRow[] = [];
  for (const row of parsed.rows) {
    const rawName = String(row.rawName ?? '').trim();
    if (!rawName) continue;
    const shifts: Record<number, ShiftCode> = {};
    if (row.shifts && typeof row.shifts === 'object') {
      for (const [k, v] of Object.entries(row.shifts)) {
        const day = Number(k);
        const normalized = normalizeScannedCode(String(v ?? ''));
        if (Number.isInteger(day) && day >= 1 && day <= 31 && normalized) {
          shifts[day] = normalized;
        }
      }
    }
    rows.push({ rawName, shifts });
  }

  const holidays = Array.isArray(parsed.holidays)
    ? parsed.holidays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
    : [];

  return {
    monthKey: parsed.monthKey || fallbackMonthKey,
    rows,
    holidays,
  };
}

async function resolveAvailableGeminiModel(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const valid = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);

    const flashModels = valid.filter((name) => name.includes('flash') && !name.includes('thinking'));
    if (flashModels.length > 0) {
      // Priorizar flash más reciente (ej. gemini-3.*-flash, gemini-flash-latest, gemini-2.5-flash-lite, etc.)
      const sorted = [...flashModels].sort((a, b) => b.localeCompare(a));
      return sorted[0];
    }
    return valid[0] ?? null;
  } catch {
    return null;
  }
}

async function callGeminiVision(
  model: string,
  apiKey: string,
  prompt: string,
  mimeType: string,
  base64: string
): Promise<Response> {
  const cleanModel = model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });
}

export async function scanRosterImage(
  blob: Blob,
  monthKey: string,
  settings: AppSettings
): Promise<ScanRosterOutput> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error('Configura tu API Key de Visión en Ajustes antes de escanear.');
  }

  const { base64, mimeType } = await compressImageToBase64(blob);
  const prompt = buildVisionPrompt(monthKey);

  if (settings.visionProvider === 'gemini') {
    let modelUsed = settings.model.trim() || 'gemini-flash-latest';
    let res = await callGeminiVision(modelUsed, apiKey, prompt, mimeType, base64);

    if (res.status === 404) {
      const discovered = await resolveAvailableGeminiModel(apiKey);
      if (discovered && discovered !== modelUsed) {
        modelUsed = discovered;
        res = await callGeminiVision(modelUsed, apiKey, prompt, mimeType, base64);
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error Gemini (${res.status}): ${errText.slice(0, 220)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini no devolvió texto interpretable.');
    }
    const parsed = parseJsonResponse(text, monthKey);
    return {
      ...parsed,
      resolvedModel: modelUsed,
    };
  }

  // OpenAI o endpoint compatible
  const baseEndpoint =
    settings.visionProvider === 'custom' && settings.customEndpoint?.trim()
      ? settings.customEndpoint.trim().replace(/\/+$/, '')
      : 'https://api.openai.com/v1';

  const endpoint = baseEndpoint.endsWith('/chat/completions')
    ? baseEndpoint
    : `${baseEndpoint}/chat/completions`;

  const model = settings.model.trim() || 'gpt-4o-mini';

  const res = await fetch(endpoint, {
    method: 'POST',
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
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error API Visión (${res.status}): ${errText.slice(0, 220)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('El modelo de visión no devolvió contenido.');
  }

  return parseJsonResponse(content, monthKey);
}
