import type { CalendarOccurrence, EventKind, EventSourceType, SpaceEvent } from '@/types/space';

export interface ExtractedEvent {
  title: string;
  kind: EventKind;
  event_date?: string;
  weekday?: number;
  start_time?: string;
  link_url?: string;
  snippet: string;
}

export interface EventSource {
  source_type: EventSourceType;
  source_id: string;
  space_id: string;
  source_user_id?: string;
  source_created_at: string;
}

export interface EventRow extends EventSource {
  title: string;
  kind: EventKind;
  event_date: string | null;
  weekday: number | null;
  start_time: string | null;
  link_url: string | null;
  snippet: string;
  dedupe_key: string;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKLY_LOOKBACK_DAYS = 28;
export const WEEKLY_LIFETIME_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SNIPPET_LENGTH = 220;

const EVENT_KEYWORDS: [RegExp, string][] = [
  [/\btrivia\b/i, 'Trivia Night'],
  [/\bopen[- ]?mic\b/i, 'Open Mic'],
  [/\bkaraoke\b/i, 'Karaoke'],
  [/\bboard[- ]game night\b/i, 'Board Game Night'],
  [/\bgame night\b/i, 'Game Night'],
  [/\blive (?:music|band|bands|jazz)\b/i, 'Live Music'],
  [/\bjazz\b/i, 'Jazz Night'],
  [/\bdj\b/i, 'DJ Set'],
  [/\b(?:comedy|stand[- ]?up)\b/i, 'Comedy Night'],
  [/\brun(?:ning)? club\b/i, 'Run Club'],
  [/\bpick[- ]?up (?:games?|basketball|soccer|volleyball|runs?)\b/i, 'Pickup Game'],
  [/\btournament\b/i, 'Tournament'],
  [/\bbook club\b/i, 'Book Club'],
  [/\b(?:movie night|film night|screening)\b/i, 'Movie Night'],
  [/\bfarmers'? market\b/i, "Farmers' Market"],
  [/\bmarket\b/i, 'Market'],
  [/\bpop[- ]?up\b/i, 'Pop-Up'],
  [/\bmeet[- ]?up\b/i, 'Meetup'],
  [/\bworkshop\b/i, 'Workshop'],
  [/\byoga\b/i, 'Yoga'],
  [/\bsalsa\b/i, 'Salsa Night'],
  [/\btasting\b/i, 'Tasting'],
  [/\bhappy hour\b/i, 'Happy Hour'],
  [/\b(?:festival|fest)\b/i, 'Festival'],
  [/\bconcert\b/i, 'Concert'],
  [/\bparty\b/i, 'Party'],
];

const DAY_TOKEN = 'sundays?|mondays?|tuesdays?|tues|tue|wednesdays?|wed|thursdays?|thurs|thur|thu|fridays?|fri|saturdays?|sat|sun|mon';
const MONTH_TOKEN = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_PREFIXES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const EVERY_DAY_PATTERN = new RegExp(`\\b(?:every|each)\\s+(?:${DAY_TOKEN})\\b(?:\\s*(?:,|and|&|or)\\s*(?:${DAY_TOKEN})\\b)*`, 'gi');
const PLURAL_DAY_PATTERN = /\b(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b/gi;
const DAY_NIGHTS_PATTERN = new RegExp(`\\b(${DAY_TOKEN})\\s+nights\\b`, 'gi');
const WEEKLY_ON_PATTERN = new RegExp(`\\bweekly\\s+on\\s+(${DAY_TOKEN})\\b`, 'gi');
const EVERY_WEEKEND_PATTERN = /\bevery\s+weekend\b/i;
const DAY_TOKEN_PATTERN = new RegExp(`\\b(${DAY_TOKEN})\\b`, 'gi');

const RELATIVE_DAY_PATTERN = new RegExp(`\\b(this|next|coming)\\s+(${DAY_TOKEN})\\b`, 'gi');
const MONTH_DAY_PATTERN = new RegExp(`\\b(${MONTH_TOKEN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, 'gi');
const DAY_MONTH_PATTERN = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_TOKEN})\\b(?:,?\\s*(\\d{4}))?`, 'gi');
const NUMERIC_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b(?!\s*(?:stars?\b|\/))/g;

const TIME_RANGE_PATTERN = /\b(\d{1,2})(?::([0-5]\d))?\s*(?:-|–|to)\s*\d{1,2}(?::[0-5]\d)?\s*([ap])\.?m\b\.?/i;
const TIME_MERIDIEM_PATTERN = /\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\b\.?/i;
const TIME_AT_PATTERN = /\bat\s+(\d{1,2})(?::([0-5]\d))?\b(?!\s*(?:%|\/|[ap]\.?m))/i;
const TIME_24H_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const NOON_PATTERN = /\bnoon\b/i;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s)>\]]+|\b[a-z0-9-]+\.(?:com|org|net|io|co|events?|ly|app)\/[^\s)>\]]*/i;

const pad = (value: number) => String(value).padStart(2, '0');

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const weekdayIndex = (token: string) => DAY_PREFIXES.indexOf(token.slice(0, 3).toLowerCase());
const monthIndex = (token: string) => MONTH_PREFIXES.indexOf(token.slice(0, 3).toLowerCase());

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  return date.getMonth() === month ? date : null;
}

// Dates without a year land on the occurrence closest to the review, leaning toward upcoming dates.
function resolveYearlessDate(month: number, day: number, reference: Date): Date | null {
  const referenceDay = startOfDay(reference);
  for (const year of [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1]) {
    const candidate = buildDate(year, month, day);
    if (!candidate) return null;
    const diffDays = Math.round((candidate.getTime() - referenceDay.getTime()) / DAY_MS);
    if (diffDays >= -60 && diffDays < 305) return candidate;
  }
  return null;
}

function resolveExplicitYear(month: number, day: number, rawYear: string): Date | null {
  const year = Number(rawYear);
  return buildDate(rawYear.length === 2 ? 2000 + year : year, month, day);
}

function findKeyword(sentence: string): string | undefined {
  return EVENT_KEYWORDS.find(([pattern]) => pattern.test(sentence))?.[1];
}

function findWeeklyDays(sentence: string): number[] {
  const days = new Set<number>();
  const addTokens = (text: string) => {
    for (const match of text.matchAll(DAY_TOKEN_PATTERN)) {
      const index = weekdayIndex(match[1]);
      if (index >= 0) days.add(index);
    }
  };

  for (const match of sentence.matchAll(EVERY_DAY_PATTERN)) addTokens(match[0]);
  for (const match of sentence.matchAll(PLURAL_DAY_PATTERN)) addTokens(match[1]);
  for (const match of sentence.matchAll(DAY_NIGHTS_PATTERN)) addTokens(match[1]);
  for (const match of sentence.matchAll(WEEKLY_ON_PATTERN)) addTokens(match[1]);
  if (EVERY_WEEKEND_PATTERN.test(sentence)) {
    days.add(6);
    days.add(0);
  }

  return Array.from(days);
}

function findOneTimeDates(sentence: string, reference: Date): Date[] {
  const dates: Date[] = [];
  const referenceDay = startOfDay(reference);

  for (const match of sentence.matchAll(MONTH_DAY_PATTERN)) {
    const month = monthIndex(match[1]);
    const day = Number(match[2]);
    const date = match[3] ? resolveExplicitYear(month, day, match[3]) : resolveYearlessDate(month, day, reference);
    if (date) dates.push(date);
  }

  for (const match of sentence.matchAll(DAY_MONTH_PATTERN)) {
    const month = monthIndex(match[2]);
    const day = Number(match[1]);
    const date = match[3] ? resolveExplicitYear(month, day, match[3]) : resolveYearlessDate(month, day, reference);
    if (date) dates.push(date);
  }

  for (const match of sentence.matchAll(NUMERIC_DATE_PATTERN)) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    if (!match[3] && day === 10 && month < 10) continue;
    const date = match[3] ? resolveExplicitYear(month, day, match[3]) : resolveYearlessDate(month, day, reference);
    if (date) dates.push(date);
  }

  for (const match of sentence.matchAll(RELATIVE_DAY_PATTERN)) {
    if (/days$/i.test(match[2])) continue;
    const weekday = weekdayIndex(match[2]);
    if (weekday < 0) continue;
    const ahead = (weekday - referenceDay.getDay() + 7) % 7;
    dates.push(addDays(referenceDay, match[1].toLowerCase() === 'next' ? ahead || 7 : ahead));
  }

  if (/\btomorrow\b/i.test(sentence)) dates.push(addDays(referenceDay, 1));
  if (/\b(?:tonight|today)\b/i.test(sentence)) dates.push(referenceDay);

  return dates;
}

function toTime(hourText: string, minuteText: string | undefined, meridiem?: string): string | undefined {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    const isPm = meridiem.toLowerCase() === 'p';
    if (hour === 12) hour = isPm ? 12 : 0;
    else if (isPm) hour += 12;
  }
  if (hour > 23 || minute > 59) return undefined;
  return `${pad(hour)}:${pad(minute)}`;
}

export function findStartTime(sentence: string): string | undefined {
  const range = sentence.match(TIME_RANGE_PATTERN);
  if (range) return toTime(range[1], range[2], range[3]);

  const meridiem = sentence.match(TIME_MERIDIEM_PATTERN);
  if (meridiem) return toTime(meridiem[1], meridiem[2], meridiem[3]);

  const at = sentence.match(TIME_AT_PATTERN);
  if (at) {
    const hour = Number(at[1]);
    // "at 8" in an event sentence almost always means evening.
    if (hour >= 1 && hour <= 11) return toTime(at[1], at[2], 'p');
    if (hour === 12) return toTime(at[1], at[2], 'p');
  }

  const twentyFour = sentence.match(TIME_24H_PATTERN);
  if (twentyFour) return toTime(twentyFour[1], twentyFour[2]);

  if (NOON_PATTERN.test(sentence)) return '12:00';
  return undefined;
}

export function findLink(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  if (!match) return undefined;
  const url = match[0].replace(/[.,!?;:'"]+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function splitSentences(text: string): string[] {
  const protectedText = text.replace(new RegExp(`\\b(${MONTH_TOKEN})\\.`, 'gi'), '$1');
  return protectedText
    .split(/\n+|[.!?]+\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const clipSnippet = (snippet: string) =>
  snippet.length > MAX_SNIPPET_LENGTH ? `${snippet.slice(0, MAX_SNIPPET_LENGTH - 1).trimEnd()}…` : snippet;

/**
 * A sentence becomes an event only when it pairs an event keyword with a date or weekly cue,
 * so passing mentions like "came here on a Tuesday" are ignored.
 */
export function extractEvents(text: string | undefined | null, referenceDate: Date | string = new Date()): ExtractedEvent[] {
  if (!text?.trim()) return [];

  const reference = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
  const sentences = splitSentences(text);
  const fallbackLink = findLink(text);
  const events: ExtractedEvent[] = [];
  const seen = new Set<string>();

  const push = (event: ExtractedEvent) => {
    const key = `${event.kind}|${event.title}|${event.event_date ?? event.weekday}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  sentences.forEach((sentence, index) => {
    const weeklyDays = findWeeklyDays(sentence);
    const dates = findOneTimeDates(sentence, reference);
    if (weeklyDays.length === 0 && dates.length === 0) return;

    const previous = index > 0 ? sentences[index - 1] : undefined;
    const ownKeyword = findKeyword(sentence);
    const title = ownKeyword || (previous ? findKeyword(previous) : undefined);
    if (!title) return;

    const snippet = clipSnippet(ownKeyword || !previous ? sentence : `${previous}. ${sentence}`);
    const shared = {
      title,
      snippet,
      start_time: findStartTime(sentence),
      link_url: findLink(sentence) || fallbackLink,
    };

    weeklyDays.forEach((weekday) => push({ ...shared, kind: 'weekly', weekday }));
    dates.forEach((date) => push({ ...shared, kind: 'one_time', event_date: toDateKey(date) }));
  });

  return events;
}

export function buildEventRows(events: ExtractedEvent[], source: EventSource): EventRow[] {
  return events.map((event) => ({
    ...source,
    title: event.title,
    kind: event.kind,
    event_date: event.event_date ?? null,
    weekday: event.weekday ?? null,
    start_time: event.start_time ?? null,
    link_url: event.link_url ?? null,
    snippet: event.snippet,
    dedupe_key: `${event.kind}|${event.title}|${event.event_date ?? event.weekday}`,
  }));
}

export function getMonthRange(monthStart: Date) {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  return { start, end, startKey: toDateKey(start), endKey: toDateKey(end) };
}

/**
 * Weekly events only repeat in a window around the review that mentioned them,
 * so a months-old "every Tuesday" doesn't stay on the calendar forever.
 */
export function expandEventDates(
  event: { kind: EventKind; event_date?: string; weekday?: number; source_created_at: string },
  monthStart: Date
): string[] {
  const { start, end, startKey, endKey } = getMonthRange(monthStart);

  if (event.kind === 'one_time') {
    return event.event_date && event.event_date >= startKey && event.event_date <= endKey ? [event.event_date] : [];
  }

  if (event.weekday === undefined) return [];
  const sourceDay = startOfDay(new Date(event.source_created_at));
  const windowStart = addDays(sourceDay, -WEEKLY_LOOKBACK_DAYS);
  const windowEnd = addDays(sourceDay, WEEKLY_LIFETIME_DAYS);
  const dates: string[] = [];

  for (let day = addDays(start, (event.weekday - start.getDay() + 7) % 7); day <= end; day = addDays(day, 7)) {
    if (day >= windowStart && day <= windowEnd) dates.push(toDateKey(day));
  }

  return dates;
}

export function formatEventTime(time?: string): string | undefined {
  if (!time) return undefined;
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${pad(minute)} ${suffix}` : `${displayHour} ${suffix}`;
}

export function parseEventTime(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  const twentyFour = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFour) return `${twentyFour[1].padStart(2, '0')}:${twentyFour[2]}`;

  const meridiem = trimmed.match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?$/);
  if (!meridiem) return undefined;
  let hour = Number(meridiem[1]);
  const minute = meridiem[2] || '00';
  if (hour < 1 || hour > 12) return undefined;
  if (hour === 12) hour = meridiem[3] === 'p' ? 12 : 0;
  else if (meridiem[3] === 'p') hour += 12;
  return `${pad(hour)}:${minute}`;
}

export function formatEventWhen(
  event: { kind: EventKind; event_date?: string; weekday?: number; start_time?: string },
  occurrenceDate?: string
) {
  const time = formatEventTime(event.start_time);
  if (event.kind === 'weekly') {
    const day = WEEKDAY_NAMES[event.weekday ?? (occurrenceDate ? parseDateKey(occurrenceDate).getDay() : 0)];
    return [`Every ${day}`, time].filter(Boolean).join(' · ');
  }

  const dateKey = occurrenceDate || event.event_date;
  const label = dateKey
    ? parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Date TBD';
  return [label, time].filter(Boolean).join(' · ');
}

export function isHostedEvent(event: { source_type: string }) {
  return event.source_type === 'hosted';
}

/**
 * Every review mentioning "Trivia Night" at the same spot is one series. RSVPs, check-ins, and the
 * group chat attach to the series so the headcount doesn't split across mentions.
 */
export function eventSeriesId(event: { id: string; series_id?: string }) {
  return event.series_id || event.id;
}

export function seriesKey(event: { space_id: string; title: string }) {
  return `${event.space_id}|${event.title.trim().toLowerCase()}`;
}

export type EventPhase = 'upcoming' | 'live' | 'ended';

export const LIVE_LEAD_MINUTES = 30;
export const LIVE_DURATION_HOURS = 4;

type OccurrenceShape = { kind: EventKind; event_date?: string; weekday?: number };

export function nextOccurrenceDate(event: OccurrenceShape, from = new Date()): string | undefined {
  if (event.kind === 'one_time') return event.event_date;
  if (event.weekday === undefined) return undefined;
  const today = startOfDay(from);
  return toDateKey(addDays(today, (event.weekday - today.getDay() + 7) % 7));
}

/** Weekly events need a specific date for headcounts; a requested date only counts if it lands on the right weekday. */
export function resolveOccurrenceDate(event: OccurrenceShape, requested?: string, from = new Date()): string | undefined {
  if (event.kind === 'one_time') return event.event_date;
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && parseDateKey(requested).getDay() === event.weekday) {
    return requested;
  }
  return nextOccurrenceDate(event, from);
}

/** The next date after `occurrenceDate` (and not before today) that a weekly event happens. */
export function nextOccurrenceAfter(event: OccurrenceShape, occurrenceDate: string, today = new Date()): string | undefined {
  if (event.kind !== 'weekly') return undefined;
  const dayAfter = addDays(parseDateKey(occurrenceDate), 1);
  const from = dayAfter > startOfDay(today) ? dayAfter : today;
  return nextOccurrenceDate(event, from);
}

export function getLiveWindow(event: { start_time?: string }, occurrenceDate: string) {
  const day = parseDateKey(occurrenceDate);
  if (!event.start_time) return { start: day, end: addDays(day, 1) };
  const [hour, minute] = event.start_time.split(':').map(Number);
  const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
  return {
    start: new Date(startsAt - LIVE_LEAD_MINUTES * 60 * 1000),
    end: new Date(startsAt + LIVE_DURATION_HOURS * 60 * 60 * 1000),
  };
}

export function getEventPhase(event: { start_time?: string }, occurrenceDate: string, now = new Date()): EventPhase {
  const { start, end } = getLiveWindow(event, occurrenceDate);
  if (now < start) return 'upcoming';
  return now < end ? 'live' : 'ended';
}

// The database stops returning chat rows after the day following the event (see event-chat.sql).
export function getChatClosesAt(occurrenceDate: string): Date {
  return addDays(parseDateKey(occurrenceDate), 2);
}

export function isChatOpen(occurrenceDate: string, now = new Date()) {
  return now < getChatClosesAt(occurrenceDate);
}

export function upcomingEventsBySpace(occurrences: CalendarOccurrence[], today = toDateKey(new Date())) {
  const bySpace = new Map<string, SpaceEvent[]>();
  occurrences.filter((occurrence) => occurrence.date >= today).forEach((occurrence) => {
    const list = bySpace.get(occurrence.event.space_id) ?? [];
    if (!list.some((event) => event.id === occurrence.event.id)) list.push(occurrence.event);
    bySpace.set(occurrence.event.space_id, list);
  });
  return bySpace;
}
