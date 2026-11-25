export type ShiftCode = 'M' | 'T' | 'N' | 'AN' | 'AD' | 'L' | 'F';

export type WorkingShiftCode = 'M' | 'T' | 'N' | 'AN' | 'AD';

export interface User {
  id: string;
  name: string;
  alias?: string;
  color: string;
  isPrimary: boolean;
  createdAt: number;
}

export interface ShiftEntry {
  id: string; // `${userId}_${date}`
  userId: string;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  shift: ShiftCode;
  note?: string;
  updatedAt: number;
}

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  name?: string;
}

export interface RosterPageItem {
  blob: Blob;
  mimeType: string;
  fileName: string;
}

export interface RosterImage {
  monthKey: string; // YYYY-MM
  blob: Blob;
  mimeType: string;
  fileName: string;
  uploadedAt: number;
  extraPages?: RosterPageItem[];
  originalPdfBlob?: Blob;
  originalPdfName?: string;
}

export type SwapType = 'exchange' | 'debt';
export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface ShiftSwap {
  id: string;
  type: SwapType;
  teammateId: string;
  createdAt: number;
  note?: string;
  settled: boolean;
  settledAt?: number;
  settledNote?: string;
  // Intercambio 1x1
  dateGiven?: string; // Día que ZETO cede
  shiftGiven?: ShiftCode;
  dateCovered?: string; // Día que ZETO cubre
  shiftCovered?: ShiftCode;
  // Servicio debido / a favor
  direction?: DebtDirection;
  debtDate?: string;
  debtShift?: ShiftCode;
}

export type VisionProvider = 'gemini' | 'openai' | 'custom';
export type NightHoursMode = 'statutory' | 'full_shift';

export interface AppSettings {
  id: 'app';
  visionProvider: VisionProvider;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  nightHoursMode: NightHoursMode;
}

export type TabId = 'calendar' | 'team' | 'roster' | 'swaps' | 'stats' | 'settings';
