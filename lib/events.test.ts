import { expandEventDates, extractEvents, findLink, findStartTime, formatEventTime } from './events';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Thursday, Oct 1 2026
const reference = new Date(2026, 9, 1, 12);

const weekly = extractEvents('Great spot. Trivia every Tuesday at 8, bring a team!', reference);
assert(weekly.length === 1, 'finds one weekly event');
assert(weekly[0].kind === 'weekly' && weekly[0].weekday === 2, 'weekly trivia lands on Tuesday');
assert(weekly[0].title === 'Trivia Night', 'trivia gets a friendly title');
assert(weekly[0].start_time === '20:00', '"at 8" reads as 8pm');

const plural = extractEvents('Live music on Fridays and karaoke Thursday nights from 9-11pm.', reference);
assert(plural.some((event) => event.kind === 'weekly' && event.weekday === 5), 'plural weekday becomes weekly');
assert(plural.some((event) => event.weekday === 4), '"Thursday nights" becomes weekly');

const multiDay = extractEvents('Pickup games every Monday and Wednesday at 6pm.', reference);
assert(multiDay.length === 2, 'every X and Y yields two weekly events');

const explicit = extractEvents('Open mic on Sept. 14th, 7:30pm. Sign up at eventbrite.com/e/123.', reference);
assert(explicit.length === 1 && explicit[0].event_date === '2026-09-14', 'month-day date with abbreviation dot');
assert(explicit[0].start_time === '19:30', 'parses 7:30pm');
assert(explicit[0].link_url === 'https://eventbrite.com/e/123', 'picks up the link from the next sentence');

const numeric = extractEvents('Farmers market 10/17 starting at 9am', reference);
assert(numeric[0]?.event_date === '2026-10-17', 'numeric M/D date');

const rollover = extractEvents('Holiday market Jan 5', reference);
assert(rollover[0]?.event_date === '2027-01-05', 'yearless date in the past rolls to next year');

const recentPast = extractEvents('The jazz night on September 20 was packed', reference);
assert(recentPast[0]?.event_date === '2026-09-20', 'recent past dates stay in the current year');

const relative = extractEvents('Book club this Saturday at 2pm', reference);
assert(relative[0]?.event_date === '2026-10-03', '"this Saturday" resolves forward');

const tonight = extractEvents('DJ set tonight!', reference);
assert(tonight[0]?.event_date === '2026-10-01', '"tonight" is the review date');

const crossSentence = extractEvents('They host a run club. Meets every Thursday at 6:30pm.', reference);
assert(crossSentence[0]?.title === 'Run Club' && crossSentence[0].weekday === 4, 'keyword from previous sentence');

assert(extractEvents('Came here on a Tuesday and it was quiet.', reference).length === 0, 'bare weekday is not an event');
assert(extractEvents('Every Tuesday I work from here.', reference).length === 0, 'weekly cue without keyword is ignored');
assert(extractEvents('Trivia is fun.', reference).length === 0, 'keyword without date is ignored');
assert(extractEvents('Rated the trivia 4/5 stars', reference).length === 0, 'scores are not dates');
assert(extractEvents('Every month there is a party', reference).length === 0, '"every month" is not Monday');
assert(extractEvents('', reference).length === 0, 'empty text');

assert(findStartTime('starts at noon') === '12:00', 'noon');
assert(findStartTime('doors 12am') === '00:00', 'midnight via 12am');
assert(findLink('see www.example.com/events.') === 'https://www.example.com/events', 'www link gets protocol');
assert(formatEventTime('19:30') === '7:30 PM' && formatEventTime('20:00') === '8 PM', 'formats times');

const tuesdays = expandEventDates(
  { kind: 'weekly', weekday: 2, source_created_at: reference.toISOString() },
  new Date(2026, 9, 1)
);
assert(tuesdays.join(',') === '2026-10-06,2026-10-13,2026-10-20,2026-10-27', 'expands Tuesdays in October');

const stale = expandEventDates(
  { kind: 'weekly', weekday: 2, source_created_at: new Date(2026, 0, 1).toISOString() },
  new Date(2026, 9, 1)
);
assert(stale.length === 0, 'weekly events expire after the lifetime window');

const oneTime = expandEventDates(
  { kind: 'one_time', event_date: '2026-10-17', source_created_at: reference.toISOString() },
  new Date(2026, 9, 1)
);
assert(oneTime.length === 1 && expandEventDates(
  { kind: 'one_time', event_date: '2026-11-02', source_created_at: reference.toISOString() },
  new Date(2026, 9, 1)
).length === 0, 'one-time events only appear in their month');

console.log('events tests passed');
