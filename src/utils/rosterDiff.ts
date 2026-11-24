import type { ShiftCode, ShiftEntry, User } from '../types';
import { pad2 } from './dateUtils';

export interface ScannedUserRow {
  rawName: string;
  shifts: Record<number, ShiftCode>; // día (1..31) -> código
}

export interface ScannedRosterResult {
  monthKey: string;
  rows: ScannedUserRow[];
  holidays?: number[]; // días del mes marcados como festivos
  notes?: string;
}

export interface DiffChangeItem {
  id: string;
  date: string; // YYYY-MM-DD
  day: number;
  userId: string; // puede ser temporal `new:${rawName}` si aún no existe
  userName: string;
  isNewUser: boolean;
  oldShift: ShiftCode | null;
  newShift: ShiftCode;
  kind: 'added' | 'modified';
  summaryText: string;
}

export interface RosterDiffReport {
  monthKey: string;
  newUsers: string[];
  changes: DiffChangeItem[];
  unchangedCount: number;
  holidayDays: number[];
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function matchScannedUser(rawName: string, users: User[]): User | undefined {
  const norm = normalizeName(rawName);
  if (!norm) return undefined;

  // 1. Coincidencia exacta por nombre o alias
  for (const u of users) {
    if (normalizeName(u.name) === norm) return u;
    if (u.alias && normalizeName(u.alias) === norm) return u;
  }

  // 2. Coincidencia parcial (ej. "ZETO G." vs "ZETO")
  for (const u of users) {
    const uNorm = normalizeName(u.name);
    if (uNorm.length >= 3 && (norm.includes(uNorm) || uNorm.includes(norm))) {
      return u;
    }
    if (u.alias) {
      const aNorm = normalizeName(u.alias);
      if (aNorm.length >= 3 && (norm.includes(aNorm) || aNorm.includes(norm))) {
        return u;
      }
    }
  }

  return undefined;
}

export function buildRosterDiff(
  scanned: ScannedRosterResult,
  existingUsers: User[],
  shiftMap: Map<string, ShiftEntry>
): RosterDiffReport {
  const newUsersSet = new Set<string>();
  const changes: DiffChangeItem[] = [];
  let unchangedCount = 0;

  for (const row of scanned.rows) {
    const matched = matchScannedUser(row.rawName, existingUsers);
    const userId = matched ? matched.id : `new:${row.rawName.trim()}`;
    const userName = matched ? matched.name : row.rawName.trim();
    const isNewUser = !matched;

    if (isNewUser && userName) {
      newUsersSet.add(userName);
    }

    const dayKeys = Object.keys(row.shifts)
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
      .sort((a, b) => a - b);

    for (const day of dayKeys) {
      const newShift = row.shifts[day];
      const date = `${scanned.monthKey}-${pad2(day)}`;
      const existing = matched ? shiftMap.get(`${matched.id}_${date}`) : undefined;
      const oldShift = existing ? existing.shift : null;

      if (oldShift === newShift) {
        unchangedCount++;
        continue;
      }

      const kind = oldShift === null ? 'added' : 'modified';
      const summaryText =
        kind === 'added'
          ? `Día ${day}: ${userName} → ${newShift} (nuevo)`
          : `Día ${day}: ${userName} pasa de ${oldShift} a ${newShift}`;

      changes.push({
        id: `${userId}_${date}`,
        date,
        day,
        userId,
        userName,
        isNewUser,
        oldShift,
        newShift,
        kind,
        summaryText,
      });
    }
  }

  changes.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.userName.localeCompare(b.userName, 'es');
  });

  return {
    monthKey: scanned.monthKey,
    newUsers: Array.from(newUsersSet),
    changes,
    unchangedCount,
    holidayDays: scanned.holidays ?? [],
  };
}
