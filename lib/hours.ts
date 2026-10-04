const MINUTES_PER_DAY = 24 * 60;
const DAY_PREFIXES = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TIME = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon|midnight)`;
const SEGMENT_PATTERN = new RegExp(String.raw`^(.*?)\s*(${TIME})\s*(?:-|–|—|to)\s*(${TIME})$`);

interface OpenRange {
  day: number;
  open: number;
  close: number;
}

export interface OpenStatus {
  isOpen: boolean;
  detail?: string;
}

function parseTime(value: string): number | null {
  const text = value.trim();
  if (text === 'noon') return 12 * 60;
  if (text === 'midnight') return 0;

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.[0];
  if (minutes > 59 || hours > 24 || (meridiem && (hours < 1 || hours > 12))) return null;
  if (meridiem === 'a' && hours === 12) hours = 0;
  if (meridiem === 'p' && hours !== 12) hours += 12;
  return hours * 60 + minutes;
}

function parseDayToken(token: string): number | null {
  const index = DAY_PREFIXES.indexOf(token.trim().slice(0, 2));
  return index >= 0 ? index : null;
}

function parseDays(value: string): number[] | null {
  const text = value.replace(/:$/, '').replace(/\s*[-–—]\s*/g, '-').trim();
  if (!text || /^(daily|every ?day|everyday|all week|open)$/.test(text)) return ALL_DAYS;
  if (text === 'weekdays') return [1, 2, 3, 4, 5];
  if (text === 'weekends') return [0, 6];

  const days = new Set<number>();
  for (const part of text.split(/\s*(?:&|\/|\band\b|\s)\s*/).filter(Boolean)) {
    const [startToken, endToken] = part.split(/\s*[-–—]\s*/);
    const start = parseDayToken(startToken);
    if (start === null) return null;
    if (endToken === undefined) {
      days.add(start);
      continue;
    }
    const end = parseDayToken(endToken);
    if (end === null) return null;
    for (let day = start; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === end) break;
    }
  }
  return Array.from(days);
}

/** Returns null when the text can't be read reliably, e.g. "Dawn to dusk". */
export function parseHours(hours: string): OpenRange[] | 'always' | null {
  const text = hours.toLowerCase().trim();
  if (/24\s*\/\s*7|24 hours|always open/.test(text)) return 'always';

  const ranges: OpenRange[] = [];
  for (const segment of text.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)) {
    if (/\bclosed\b/.test(segment)) continue;
    const match = segment.match(SEGMENT_PATTERN);
    if (!match) return null;

    const days = parseDays(match[1]);
    const open = parseTime(match[2]);
    const close = parseTime(match[3]);
    if (!days || open === null || close === null) return null;

    days.forEach((day) => ranges.push({
      day,
      open,
      close: close <= open ? close + MINUTES_PER_DAY : close,
    }));
  }
  return ranges.length > 0 ? ranges : null;
}

export function formatClockTime(minutes: number) {
  const dayMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(dayMinutes / 60);
  const mins = dayMinutes % 60;
  const hours12 = hours24 % 12 || 12;
  return `${hours12}${mins ? `:${String(mins).padStart(2, '0')}` : ''}${hours24 < 12 ? 'am' : 'pm'}`;
}

export function getOpenStatus(hours: string | undefined, now = new Date()): OpenStatus | null {
  if (!hours) return null;
  const schedule = parseHours(hours);
  if (!schedule) return null;
  if (schedule === 'always') return { isOpen: true, detail: 'Open 24 hours' };

  const today = now.getDay();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  // Each range is checked as starting today and as starting yesterday to catch overnight hours.
  const current = schedule
    .flatMap((range) => [
      range.day === today ? { start: range.open, end: range.close } : null,
      range.day === (today + 6) % 7 ? { start: range.open - MINUTES_PER_DAY, end: range.close - MINUTES_PER_DAY } : null,
    ])
    .filter((range): range is { start: number; end: number } => range !== null && minuteOfDay >= range.start && minuteOfDay < range.end)
    .sort((first, second) => second.end - first.end)[0];

  if (current) return { isOpen: true, detail: `Closes ${formatClockTime(current.end)}` };

  for (let offset = 0; offset < 7; offset += 1) {
    const day = (today + offset) % 7;
    const nextOpen = schedule
      .filter((range) => range.day === day && (offset > 0 || range.open > minuteOfDay))
      .sort((first, second) => first.open - second.open)[0];
    if (!nextOpen) continue;

    const when = offset === 0 ? '' : offset === 1 ? 'tomorrow ' : `${DAY_LABELS[day]} `;
    return { isOpen: false, detail: `Opens ${when}${formatClockTime(nextOpen.open)}` };
  }

  return { isOpen: false };
}
