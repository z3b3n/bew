import { SHIFT_DEFINITIONS } from '../constants/shifts';
import type { ShiftEntry, User } from '../types';
import { addDays } from './dateUtils';

function toIcsDateTime(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return `${cleanDate}T${cleanTime}`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

export interface IcsBuildParams {
  monthKey: string;
  primaryUser: User;
  allUsers: User[];
  allShifts: ShiftEntry[];
  holidaySet: Set<string>;
}

/**
 * Genera un archivo RFC 5545 (.ics) con los turnos laborales de ZETO para el mes indicado.
 * Omite días libres (L / F) y calcula correctamente los turnos nocturnos (N / AN) que terminan al día siguiente.
 */
export function buildMonthIcsContent({
  monthKey,
  primaryUser,
  allUsers,
  allShifts,
  holidaySet,
}: IcsBuildParams): { content: string; eventsCount: number } {
  const dtstamp = formatUtcStamp(new Date());
  const userShifts = allShifts
    .filter((s) => s.userId === primaryUser.id && s.monthKey === monthKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BEW App//Cuadrante de Turnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:BEW ${primaryUser.name} ${monthKey}`,
  ];

  let eventsCount = 0;

  for (const entry of userShifts) {
    const def = SHIFT_DEFINITIONS[entry.shift];
    if (!def.isWorking || !def.startTime || !def.endTime) {
      continue;
    }

    const startDt = toIcsDateTime(entry.date, def.startTime);
    const endDate = def.crossesMidnight ? addDays(entry.date, 1) : entry.date;
    const endDt = toIcsDateTime(endDate, def.endTime);

    const isHoliday = holidaySet.has(entry.date);
    const summary = `BEW: ${def.label} (${def.code})${isHoliday ? ' [Festivo]' : ''}`;

    const sameDayTeammates = allShifts
      .filter(
        (s) =>
          s.date === entry.date &&
          s.userId !== primaryUser.id &&
          SHIFT_DEFINITIONS[s.shift].isWorking
      )
      .map((s) => {
        const u = userMap.get(s.userId);
        return u ? `${u.name}: ${s.shift}` : null;
      })
      .filter((v): v is string => Boolean(v));

    const descParts = [`Turno ${def.label} (${def.startTime} - ${def.endTime}, ${def.totalHours}h)`];
    if (isHoliday) descParts.push('Día marcado como Festivo');
    if (entry.note) descParts.push(`Nota: ${entry.note}`);
    if (sameDayTeammates.length > 0) {
      descParts.push(`Equipo: ${sameDayTeammates.join(', ')}`);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:bew-${primaryUser.id}-${entry.date}-${entry.shift}@bew.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${startDt}`);
    lines.push(`DTEND:${endDt}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
    eventsCount++;
  }

  lines.push('END:VCALENDAR');
  return {
    content: lines.join('\r\n') + '\r\n',
    eventsCount,
  };
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
