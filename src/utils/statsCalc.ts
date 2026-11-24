import { SHIFT_DEFINITIONS, WORKING_SHIFTS, getShiftHours } from '../constants/shifts';
import type { NightHoursMode, ShiftEntry, WorkingShiftCode } from '../types';
import { MONTH_NAMES_ES, getQuarterMonths, getYearMonths } from './dateUtils';

export type StatsPeriodType = 'month' | 'quarter' | 'year';

export interface TimeSeriesPoint {
  label: string;
  totalHours: number;
  dayHours: number;
  nightHours: number;
}

export interface UserStatsResult {
  totalHours: number;
  dayHours: number;
  nightHours: number;
  workingDays: number;
  freeDays: number; // días marcados como L o F
  holidaysWorked: number;
  holidaysFree: number;
  shiftCounts: Record<WorkingShiftCode, number>;
  shiftHours: Record<WorkingShiftCode, number>;
  series: TimeSeriesPoint[];
}

export function computeUserStats(params: {
  userId: string;
  periodType: StatsPeriodType;
  year: number;
  month: number; // 1..12
  quarter: 1 | 2 | 3 | 4;
  shifts: ShiftEntry[];
  holidaySet: Set<string>;
  nightHoursMode: NightHoursMode;
}): UserStatsResult {
  const { userId, periodType, year, month, quarter, shifts, holidaySet, nightHoursMode } = params;

  const targetMonths =
    periodType === 'month'
      ? [`${year}-${String(month).padStart(2, '0')}`]
      : periodType === 'quarter'
        ? getQuarterMonths(year, quarter)
        : getYearMonths(year);

  const monthSet = new Set(targetMonths);
  const filtered = shifts.filter((s) => s.userId === userId && monthSet.has(s.monthKey));

  const shiftCounts: Record<WorkingShiftCode, number> = {
    M: 0,
    T: 0,
    N: 0,
    AN: 0,
    AD: 0,
  };
  const shiftHours: Record<WorkingShiftCode, number> = {
    M: 0,
    T: 0,
    N: 0,
    AN: 0,
    AD: 0,
  };

  let totalHours = 0;
  let dayHours = 0;
  let nightHours = 0;
  let workingDays = 0;
  let freeDays = 0;
  let holidaysWorked = 0;
  let holidaysFree = 0;

  for (const entry of filtered) {
    const def = SHIFT_DEFINITIONS[entry.shift];
    const isHoliday = holidaySet.has(entry.date);

    if (def.isWorking) {
      const hrs = getShiftHours(entry.shift, nightHoursMode);
      totalHours += hrs.total;
      dayHours += hrs.day;
      nightHours += hrs.night;
      workingDays++;
      const wCode = entry.shift as WorkingShiftCode;
      if (WORKING_SHIFTS.includes(wCode)) {
        shiftCounts[wCode]++;
        shiftHours[wCode] += hrs.total;
      }
      if (isHoliday) {
        holidaysWorked++;
      }
    } else {
      freeDays++;
      if (isHoliday || entry.shift === 'F') {
        holidaysFree++;
      }
    }
  }

  // Serie temporal para gráfico de barras
  let series: TimeSeriesPoint[] = [];

  if (periodType === 'month') {
    const weeks: TimeSeriesPoint[] = [
      { label: 'S1', totalHours: 0, dayHours: 0, nightHours: 0 },
      { label: 'S2', totalHours: 0, dayHours: 0, nightHours: 0 },
      { label: 'S3', totalHours: 0, dayHours: 0, nightHours: 0 },
      { label: 'S4', totalHours: 0, dayHours: 0, nightHours: 0 },
      { label: 'S5', totalHours: 0, dayHours: 0, nightHours: 0 },
    ];
    for (const entry of filtered) {
      const dayNum = Number(entry.date.slice(8, 10));
      const weekIdx = Math.min(4, Math.floor((dayNum - 1) / 7));
      const hrs = getShiftHours(entry.shift, nightHoursMode);
      weeks[weekIdx].totalHours += hrs.total;
      weeks[weekIdx].dayHours += hrs.day;
      weeks[weekIdx].nightHours += hrs.night;
    }
    series = weeks;
  } else {
    series = targetMonths.map((mk) => {
      const mIdx = Number(mk.slice(5, 7)) - 1;
      const point: TimeSeriesPoint = {
        label: MONTH_NAMES_ES[mIdx].slice(0, 3),
        totalHours: 0,
        dayHours: 0,
        nightHours: 0,
      };
      for (const entry of filtered) {
        if (entry.monthKey !== mk) continue;
        const hrs = getShiftHours(entry.shift, nightHoursMode);
        point.totalHours += hrs.total;
        point.dayHours += hrs.day;
        point.nightHours += hrs.night;
      }
      return point;
    });
  }

  return {
    totalHours,
    dayHours,
    nightHours,
    workingDays,
    freeDays,
    holidaysWorked,
    holidaysFree,
    shiftCounts,
    shiftHours,
    series,
  };
}
