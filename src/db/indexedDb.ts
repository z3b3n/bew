import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  HolidayEntry,
  RosterImage,
  ShiftEntry,
  ShiftSwap,
  User,
} from '../types';

interface BewDBSchema extends DBSchema {
  users: {
    key: string;
    value: User;
  };
  shifts: {
    key: string;
    value: ShiftEntry;
    indexes: {
      'by-month': string;
      'by-user': string;
      'by-date': string;
    };
  };
  holidays: {
    key: string;
    value: HolidayEntry;
    indexes: {
      'by-month': string;
    };
  };
  rosters: {
    key: string;
    value: RosterImage;
  };
  swaps: {
    key: string;
    value: ShiftSwap;
    indexes: {
      'by-teammate': string;
    };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

const DB_NAME = 'bew-db';
const DB_VERSION = 1;

export const PRIMARY_USER_ID = 'zeto';

export const DEFAULT_PRIMARY_USER: User = {
  id: PRIMARY_USER_ID,
  name: 'ZETO',
  color: '#F59E0B',
  isPrimary: true,
  createdAt: 1,
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  visionProvider: 'gemini',
  apiKey: '',
  model: 'gemini-flash-latest',
  customEndpoint: '',
  nightHoursMode: 'statutory',
};

let dbPromise: Promise<IDBPDatabase<BewDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<BewDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<BewDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('shifts')) {
          const shiftStore = db.createObjectStore('shifts', { keyPath: 'id' });
          shiftStore.createIndex('by-month', 'monthKey');
          shiftStore.createIndex('by-user', 'userId');
          shiftStore.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('holidays')) {
          const holidayStore = db.createObjectStore('holidays', { keyPath: 'date' });
          holidayStore.createIndex('by-month', 'monthKey');
        }
        if (!db.objectStoreNames.contains('rosters')) {
          db.createObjectStore('rosters', { keyPath: 'monthKey' });
        }
        if (!db.objectStoreNames.contains('swaps')) {
          const swapStore = db.createObjectStore('swaps', { keyPath: 'id' });
          swapStore.createIndex('by-teammate', 'teammateId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function ensureSeedData(): Promise<void> {
  const db = await getDb();
  const primary = await db.get('users', PRIMARY_USER_ID);
  if (!primary) {
    await db.put('users', DEFAULT_PRIMARY_USER);
  }
  const settings = await db.get('settings', 'app');
  if (!settings) {
    await db.put('settings', DEFAULT_SETTINGS);
  }
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  const users = await db.getAll('users');
  return users.sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return a.name.localeCompare(b.name, 'es');
  });
}

export async function putUser(user: User): Promise<void> {
  const db = await getDb();
  await db.put('users', user);
}

export async function removeUserAndData(userId: string): Promise<void> {
  if (userId === PRIMARY_USER_ID) return;
  const db = await getDb();
  const tx = db.transaction(['users', 'shifts'], 'readwrite');
  await tx.objectStore('users').delete(userId);
  const shiftIndex = tx.objectStore('shifts').index('by-user');
  let cursor = await shiftIndex.openCursor(userId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getAllShifts(): Promise<ShiftEntry[]> {
  const db = await getDb();
  return db.getAll('shifts');
}

export async function putShift(entry: ShiftEntry): Promise<void> {
  const db = await getDb();
  await db.put('shifts', entry);
}

export async function putShiftsBatch(entries: ShiftEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('shifts', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function removeShift(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('shifts', id);
}

export async function getAllHolidays(): Promise<HolidayEntry[]> {
  const db = await getDb();
  return db.getAll('holidays');
}

export async function putHoliday(entry: HolidayEntry): Promise<void> {
  const db = await getDb();
  await db.put('holidays', entry);
}

export async function removeHoliday(date: string): Promise<void> {
  const db = await getDb();
  await db.delete('holidays', date);
}

export async function getRosterImage(monthKey: string): Promise<RosterImage | undefined> {
  const db = await getDb();
  return db.get('rosters', monthKey);
}

export async function getAllRosterImages(): Promise<RosterImage[]> {
  const db = await getDb();
  return db.getAll('rosters');
}

export async function putRosterImage(roster: RosterImage): Promise<void> {
  const db = await getDb();
  await db.put('rosters', roster);
}

export async function removeRosterImage(monthKey: string): Promise<void> {
  const db = await getDb();
  await db.delete('rosters', monthKey);
}

export async function getAllSwaps(): Promise<ShiftSwap[]> {
  const db = await getDb();
  const swaps = await db.getAll('swaps');
  return swaps.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putSwap(swap: ShiftSwap): Promise<void> {
  const db = await getDb();
  await db.put('swaps', swap);
}

export async function removeSwap(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('swaps', id);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const s = await db.get('settings', 'app');
  if (!s) return DEFAULT_SETTINGS;
  if (s.visionProvider === 'gemini' && s.model === 'gemini-2.5-flash') {
    const migrated = { ...s, model: 'gemini-flash-latest' };
    await db.put('settings', migrated);
    return migrated;
  }
  return s;
}

export async function putSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', { ...settings, id: 'app' });
}

interface SerializedRoster {
  monthKey: string;
  mimeType: string;
  fileName: string;
  uploadedAt: number;
  base64: string;
}

interface BackupPayload {
  app: 'BEW';
  version: 1;
  exportedAt: string;
  users: User[];
  shifts: ShiftEntry[];
  holidays: HolidayEntry[];
  swaps: ShiftSwap[];
  settings: AppSettings;
  rosters?: SerializedRoster[];
}

function blobToBase64(blob: Blob): Promise<string> {
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

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'image/jpeg' });
}

export async function exportBackupJson(includeImages: boolean): Promise<string> {
  const [users, shifts, holidays, swaps, settings, rosters] = await Promise.all([
    getAllUsers(),
    getAllShifts(),
    getAllHolidays(),
    getAllSwaps(),
    getSettings(),
    includeImages ? getAllRosterImages() : Promise.resolve([]),
  ]);

  const serializedRosters: SerializedRoster[] | undefined = includeImages
    ? await Promise.all(
        rosters.map(async (r) => ({
          monthKey: r.monthKey,
          mimeType: r.mimeType,
          fileName: r.fileName,
          uploadedAt: r.uploadedAt,
          base64: await blobToBase64(r.blob),
        }))
      )
    : undefined;

  const payload: BackupPayload = {
    app: 'BEW',
    version: 1,
    exportedAt: new Date().toISOString(),
    users,
    shifts,
    holidays,
    swaps,
    settings,
    ...(serializedRosters ? { rosters: serializedRosters } : {}),
  };

  return JSON.stringify(payload, null, 2);
}

export async function importBackupJson(jsonText: string): Promise<{
  usersCount: number;
  shiftsCount: number;
  holidaysCount: number;
  swapsCount: number;
  rostersCount: number;
}> {
  const parsed = JSON.parse(jsonText) as Partial<BackupPayload>;
  if (parsed.app !== 'BEW' || !Array.isArray(parsed.users) || !Array.isArray(parsed.shifts)) {
    throw new Error('El archivo no es una copia de seguridad válida de BEW.');
  }

  const db = await getDb();
  const tx = db.transaction(
    ['users', 'shifts', 'holidays', 'swaps', 'settings', 'rosters'],
    'readwrite'
  );

  await Promise.all([
    tx.objectStore('users').clear(),
    tx.objectStore('shifts').clear(),
    tx.objectStore('holidays').clear(),
    tx.objectStore('swaps').clear(),
    ...(Array.isArray(parsed.rosters) ? [tx.objectStore('rosters').clear()] : []),
  ]);

  const hasPrimary = parsed.users.some((u) => u.id === PRIMARY_USER_ID || u.isPrimary);
  if (!hasPrimary) {
    await tx.objectStore('users').put(DEFAULT_PRIMARY_USER);
  }
  for (const u of parsed.users) {
    await tx.objectStore('users').put(u);
  }
  for (const s of parsed.shifts) {
    await tx.objectStore('shifts').put(s);
  }
  const holidays = Array.isArray(parsed.holidays) ? parsed.holidays : [];
  for (const h of holidays) {
    await tx.objectStore('holidays').put(h);
  }
  const swaps = Array.isArray(parsed.swaps) ? parsed.swaps : [];
  for (const sw of swaps) {
    await tx.objectStore('swaps').put(sw);
  }
  if (parsed.settings) {
    await tx.objectStore('settings').put({ ...parsed.settings, id: 'app' });
  } else {
    await tx.objectStore('settings').put(DEFAULT_SETTINGS);
  }

  const rosters = Array.isArray(parsed.rosters) ? parsed.rosters : [];
  for (const r of rosters) {
    await tx.objectStore('rosters').put({
      monthKey: r.monthKey,
      mimeType: r.mimeType,
      fileName: r.fileName,
      uploadedAt: r.uploadedAt,
      blob: base64ToBlob(r.base64, r.mimeType),
    });
  }

  await tx.done;

  return {
    usersCount: parsed.users.length,
    shiftsCount: parsed.shifts.length,
    holidaysCount: holidays.length,
    swapsCount: swaps.length,
    rostersCount: rosters.length,
  };
}
