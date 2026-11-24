export const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const WEEKDAY_SHORT_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEKDAY_MEDIUM_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m }; // month 1..12
}

export function formatMonthTitle(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTH_NAMES_ES[month - 1]} ${year}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function getDaysInMonth(monthKey: string): number {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

export function getMonthDates(monthKey: string): string[] {
  const total = getDaysInMonth(monthKey);
  const dates: string[] = [];
  for (let d = 1; d <= total; d++) {
    dates.push(`${monthKey}-${pad2(d)}`);
  }
  return dates;
}

/**
 * Devuelve índice de día de la semana lunes=0 .. domingo=6
 */
export function getWeekdayMondayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0=Dom..6=Sab
  return (day + 6) % 7;
}

export function getWeekdayShort(dateStr: string): string {
  return WEEKDAY_MEDIUM_ES[getWeekdayMondayIndex(dateStr)];
}

/**
 * Construye celdas para una cuadrícula mensual Lunes..Domingo.
 * Incluye `null` al principio para alinear el día 1.
 */
export function getCalendarGridCells(monthKey: string): Array<string | null> {
  const dates = getMonthDates(monthKey);
  const firstOffset = getWeekdayMondayIndex(dates[0]);
  const cells: Array<string | null> = Array(firstOffset).fill(null);
  cells.push(...dates);
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function formatShortDateEs(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  const wd = getWeekdayShort(dateStr);
  return `${wd} ${d} ${MONTH_NAMES_ES[m - 1].slice(0, 3)}`;
}

export function getQuarterMonths(year: number, quarter: 1 | 2 | 3 | 4): string[] {
  const start = (quarter - 1) * 3 + 1;
  return [
    `${year}-${pad2(start)}`,
    `${year}-${pad2(start + 1)}`,
    `${year}-${pad2(start + 2)}`,
  ];
}

export function getYearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${pad2(idx + 1)}`);
}
