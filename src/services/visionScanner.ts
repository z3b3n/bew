import { isShiftCode } from '../constants/shifts';
import type { AppSettings, ShiftCode } from '../types';
import type { ScannedRosterResult, ScannedUserRow } from '../utils/rosterDiff';

const MAX_DIMENSION = 2048;

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
  return `Eres un sistema OCR de alta precisión especializado en cuadrantes de turnos laborales en español.
Analiza la imagen del cuadrante correspondiente al mes "${monthKey}" (formato YYYY-MM).

Códigos de turno válidos (usa EXACTAMENTE estos códigos):
- "M": Mañana (08:00-15:00)
- "T": Tarde (15:00-21:00)
- "N": Noche (21:00-08:00)
- "AN": Arco Nocturno (20:00-08:00)
- "AD": Arco Diurno (08:00-20:00)
- "L": Día Libre / Descanso / Vacío marcado como libre
- "F": Festivo libre

Instrucciones:
1. Extrae TODOS los trabajadores/usuarios que aparezcan en la tabla del cuadrante, manteniendo su nombre o alias legible (incluyendo ZETO si aparece).
2. Para cada usuario, extrae los turnos de cada día del mes (claves numéricas de "1" a "31" según los días visibles). Si una celda está claramente vacía o indica descanso/libre/X/D, usa "L".
3. Si el cuadrante marca días festivos en la cabecera (rojo, F, sombreado especial), incluye sus números de día en "holidays".
4. Devuelve ÚNICAMENTE un objeto JSON válido con este esquema exacto, sin texto adicional:
{
  "monthKey": "${monthKey}",
  "holidays": [1, 6],
  "rows": [
    {
      "rawName": "ZETO",
      "shifts": { "1": "M", "2": "T", "3": "L" }
    }
  ]
}`;
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
        const code = String(v ?? '').trim().toUpperCase();
        if (Number.isInteger(day) && day >= 1 && day <= 31 && isShiftCode(code)) {
          shifts[day] = code;
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

export async function scanRosterImage(
  blob: Blob,
  monthKey: string,
  settings: AppSettings
): Promise<ScannedRosterResult> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new Error('Configura tu API Key de Visión en Ajustes antes de escanear.');
  }

  const { base64, mimeType } = await compressImageToBase64(blob);
  const prompt = buildVisionPrompt(monthKey);

  if (settings.visionProvider === 'gemini') {
    const model = settings.model.trim() || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
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
    return parseJsonResponse(text, monthKey);
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
