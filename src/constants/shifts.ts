import type { NightHoursMode, ShiftCode, WorkingShiftCode } from '../types';

export interface ShiftDefinition {
  code: ShiftCode;
  label: string;
  shortLabel: string;
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  crossesMidnight: boolean;
  totalHours: number;
  dayHoursStatutory: number; // fuera de 22:00-06:00
  nightHoursStatutory: number; // dentro de 22:00-06:00
  isWorking: boolean;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cellBg: string;
  cellBorder: string;
  heroGradient: string;
  dotColor: string;
  hex: string;
}

export const SHIFT_DEFINITIONS: Record<ShiftCode, ShiftDefinition> = {
  M: {
    code: 'M',
    label: 'Mañana',
    shortLabel: 'Mañana',
    startTime: '08:00',
    endTime: '15:00',
    crossesMidnight: false,
    totalHours: 7,
    dayHoursStatutory: 7,
    nightHoursStatutory: 0,
    isWorking: true,
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-400/50',
    cellBg: 'bg-gradient-to-b from-amber-500/30 via-amber-500/18 to-amber-600/10',
    cellBorder: 'border-amber-400/50',
    heroGradient: 'from-amber-500/25 via-amber-600/10 to-slate-900/90 border-amber-400/40',
    dotColor: 'bg-amber-400',
    hex: '#F59E0B',
  },
  T: {
    code: 'T',
    label: 'Tarde',
    shortLabel: 'Tarde',
    startTime: '15:00',
    endTime: '21:00',
    crossesMidnight: false,
    totalHours: 6,
    dayHoursStatutory: 6,
    nightHoursStatutory: 0,
    isWorking: true,
    badgeBg: 'bg-sky-500/20',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-400/50',
    cellBg: 'bg-gradient-to-b from-sky-500/30 via-sky-500/18 to-sky-600/10',
    cellBorder: 'border-sky-400/50',
    heroGradient: 'from-sky-500/25 via-sky-600/10 to-slate-900/90 border-sky-400/40',
    dotColor: 'bg-sky-400',
    hex: '#38BDF8',
  },
  N: {
    code: 'N',
    label: 'Noche',
    shortLabel: 'Noche',
    startTime: '21:00',
    endTime: '08:00',
    crossesMidnight: true,
    totalHours: 11,
    dayHoursStatutory: 3,
    nightHoursStatutory: 8,
    isWorking: true,
    badgeBg: 'bg-indigo-500/25',
    badgeText: 'text-indigo-200',
    badgeBorder: 'border-indigo-400/50',
    cellBg: 'bg-gradient-to-b from-indigo-500/35 via-indigo-600/20 to-indigo-800/15',
    cellBorder: 'border-indigo-400/55',
    heroGradient: 'from-indigo-500/30 via-indigo-700/15 to-slate-900/90 border-indigo-400/45',
    dotColor: 'bg-indigo-400',
    hex: '#818CF8',
  },
  AN: {
    code: 'AN',
    label: 'Arco Nocturno',
    shortLabel: 'Arco Noc.',
    startTime: '20:00',
    endTime: '08:00',
    crossesMidnight: true,
    totalHours: 12,
    dayHoursStatutory: 4,
    nightHoursStatutory: 8,
    isWorking: true,
    badgeBg: 'bg-violet-500/25',
    badgeText: 'text-violet-200',
    badgeBorder: 'border-violet-400/50',
    cellBg: 'bg-gradient-to-b from-violet-500/35 via-violet-600/20 to-violet-800/15',
    cellBorder: 'border-violet-400/55',
    heroGradient: 'from-violet-500/30 via-violet-700/15 to-slate-900/90 border-violet-400/45',
    dotColor: 'bg-violet-400',
    hex: '#A78BFA',
  },
  AD: {
    code: 'AD',
    label: 'Arco Diurno',
    shortLabel: 'Arco Diu.',
    startTime: '08:00',
    endTime: '20:00',
    crossesMidnight: false,
    totalHours: 12,
    dayHoursStatutory: 12,
    nightHoursStatutory: 0,
    isWorking: true,
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-400/50',
    cellBg: 'bg-gradient-to-b from-emerald-500/30 via-emerald-500/18 to-emerald-600/10',
    cellBorder: 'border-emerald-400/50',
    heroGradient: 'from-emerald-500/25 via-emerald-600/10 to-slate-900/90 border-emerald-400/40',
    dotColor: 'bg-emerald-400',
    hex: '#34D399',
  },
  L: {
    code: 'L',
    label: 'Día Libre',
    shortLabel: 'Libre',
    startTime: null,
    endTime: null,
    crossesMidnight: false,
    totalHours: 0,
    dayHoursStatutory: 0,
    nightHoursStatutory: 0,
    isWorking: false,
    badgeBg: 'bg-slate-700/40',
    badgeText: 'text-slate-300',
    badgeBorder: 'border-slate-600/50',
    cellBg: 'bg-slate-800/50',
    cellBorder: 'border-slate-700/60',
    heroGradient: 'from-slate-800/60 to-slate-900/90 border-slate-700/60',
    dotColor: 'bg-slate-500',
    hex: '#64748B',
  },
  F: {
    code: 'F',
    label: 'Festivo (Libre)',
    shortLabel: 'Festivo',
    startTime: null,
    endTime: null,
    crossesMidnight: false,
    totalHours: 0,
    dayHoursStatutory: 0,
    nightHoursStatutory: 0,
    isWorking: false,
    badgeBg: 'bg-rose-500/20',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-400/50',
    cellBg: 'bg-gradient-to-b from-rose-500/25 to-rose-700/10',
    cellBorder: 'border-rose-500/45',
    heroGradient: 'from-rose-500/25 to-slate-900/90 border-rose-400/45',
    dotColor: 'bg-rose-400',
    hex: '#FB7185',
  },
};

export const SHIFT_ORDER: ShiftCode[] = ['M', 'T', 'N', 'AN', 'AD', 'L'];
export const WORKING_SHIFTS: WorkingShiftCode[] = ['M', 'T', 'N', 'AN', 'AD'];

export const USER_COLOR_PALETTE = [
  '#38BDF8', // Sky
  '#34D399', // Emerald
  '#A78BFA', // Violet
  '#FB7185', // Rose
  '#2DD4BF', // Teal
  '#F472B6', // Pink
  '#60A5FA', // Blue
  '#FBBF24', // Amber
];

export function getShiftHours(
  shift: ShiftCode,
  nightHoursMode: NightHoursMode = 'statutory'
): { total: number; day: number; night: number } {
  const def = SHIFT_DEFINITIONS[shift];
  if (!def.isWorking) {
    return { total: 0, day: 0, night: 0 };
  }
  if (nightHoursMode === 'full_shift' && (shift === 'N' || shift === 'AN')) {
    return { total: def.totalHours, day: 0, night: def.totalHours };
  }
  return {
    total: def.totalHours,
    day: def.dayHoursStatutory,
    night: def.nightHoursStatutory,
  };
}

export function isShiftCode(val: string): val is ShiftCode {
  return val === 'M' || val === 'T' || val === 'N' || val === 'AN' || val === 'AD' || val === 'L' || val === 'F';
}
