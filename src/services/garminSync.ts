import type { HolidayEntry, ShiftEntry } from '../types';

export const GARMIN_GIST_FILENAME = 'bew-shifts.txt';

function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function buildGarminSyncPayload(
  shifts: ShiftEntry[],
  primaryUserId: string,
  holidays?: HolidayEntry[]
): string {
  const primaryShifts = shifts.filter((s) => s.userId === primaryUserId);
  const byDate = new Map<string, string>();
  const months = new Set<string>();

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  months.add(formatMonthKey(currentMonth));
  months.add(formatMonthKey(nextMonth));

  for (const entry of primaryShifts) {
    byDate.set(entry.date, entry.shift);
    if (entry.monthKey) {
      months.add(entry.monthKey);
    } else if (entry.date.length >= 7) {
      months.add(entry.date.slice(0, 7));
    }
  }

  const sortedMonths = Array.from(months).sort();
  const lines: string[] = [`#BEW-SYNC:${new Date().toISOString()}`];

  for (const monthKey of sortedMonths) {
    const [yStr, mStr] = monthKey.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      continue;
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    const tokens: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
      tokens.push(byDate.get(dateKey) ?? '');
    }
    lines.push(`${monthKey}:${tokens.join(',')}`);
  }

  if (holidays !== undefined) {
    const holidayDates = Array.from(new Set(holidays.map((h) => h.date))).sort();
    lines.push(`H:${holidayDates.join(',')}`);
  }

  return lines.join('\n');
}

interface GitHubGistResponse {
  id: string;
  owner?: {
    login?: string;
  };
  files?: Record<
    string,
    {
      raw_url?: string;
    }
  >;
  message?: string;
}

export async function pushShiftsToGarminGist(params: {
  token: string;
  gistId?: string;
  shifts: ShiftEntry[];
  primaryUserId: string;
  holidays?: HolidayEntry[];
}): Promise<{ gistId: string; rawUrl: string; syncedAt: number }> {
  const token = params.token.trim();
  const gistId = params.gistId?.trim() ?? '';

  if (!token) {
    throw new Error('Falta el token de GitHub para sincronizar con Garmin.');
  }

  const content = buildGarminSyncPayload(params.shifts, params.primaryUserId, params.holidays);
  const url = gistId
    ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
    : 'https://api.github.com/gists';

  const response = await fetch(url, {
    method: gistId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'BEW Turnos - Garmin Sync',
      ...(gistId ? {} : { public: false }),
      files: {
        [GARMIN_GIST_FILENAME]: {
          content,
        },
      },
    }),
  });

  let data: GitHubGistResponse | null = null;
  try {
    data = (await response.json()) as GitHubGistResponse;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.id) {
    if (response.status === 401) {
      throw new Error('Token de GitHub inválido o caducado (401).');
    }
    if (response.status === 403) {
      throw new Error('El token de GitHub no tiene permiso "gist" o superó el límite (403).');
    }
    if (response.status === 404) {
      throw new Error('Gist no encontrado (404). Borra el Gist ID para crear uno nuevo.');
    }
    const detail = data?.message ? `: ${data.message}` : '';
    throw new Error(`Error al subir turnos a GitHub (${response.status})${detail}`);
  }

  const ownerLogin = data.owner?.login;
  let rawUrl = '';
  if (ownerLogin) {
    rawUrl = `https://gist.githubusercontent.com/${ownerLogin}/${data.id}/raw/${GARMIN_GIST_FILENAME}`;
  } else {
    const fileRaw = data.files?.[GARMIN_GIST_FILENAME]?.raw_url ?? '';
    rawUrl = fileRaw.replace(/\/raw\/[^/]+\//, '/raw/');
  }

  return {
    gistId: data.id,
    rawUrl,
    syncedAt: Date.now(),
  };
}
