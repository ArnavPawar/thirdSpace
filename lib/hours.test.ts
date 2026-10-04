import { formatClockTime, getOpenStatus, parseHours } from './hours';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// 2026-10-05 is a Monday.
const at = (day: number, time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2026, 9, 4 + day, hours, minutes);
};

const cafe = 'Mon-Fri 7am-7pm, Sat-Sun 8am-7pm';
assert(getOpenStatus(cafe, at(1, '12:00'))?.isOpen === true, 'open midday on a weekday');
assert(getOpenStatus(cafe, at(1, '12:00'))?.detail === 'Closes 7pm', 'shows closing time');
assert(getOpenStatus(cafe, at(1, '19:00'))?.isOpen === false, 'closed at closing time');
assert(getOpenStatus(cafe, at(1, '20:00'))?.detail === 'Opens tomorrow 7am', 'shows tomorrow opening');
assert(getOpenStatus(cafe, at(6, '07:30'))?.detail === 'Opens 8am', 'weekend opens later');

const bar = 'Tue-Thu 4pm-11pm, Fri-Sat 12pm-1am, Sun 12pm-10pm';
assert(getOpenStatus(bar, at(0, '00:30'))?.isOpen === true, 'overnight from Saturday is open early Sunday');
assert(getOpenStatus(bar, at(0, '00:30'))?.detail === 'Closes 1am', 'overnight closing time');
assert(getOpenStatus(bar, at(1, '18:00'))?.detail === 'Opens tomorrow 4pm', 'closed all Monday');
assert(getOpenStatus(bar, at(6, '23:59'))?.isOpen === true, 'open late Saturday');

assert(getOpenStatus('Daily 7am-10pm', at(3, '21:59'))?.isOpen === true, 'daily hours');
assert(getOpenStatus('Mon - Fri 10:30am - 5pm', at(2, '10:15'))?.detail === 'Opens 10:30am', 'spaced ranges and minutes');
assert(getOpenStatus('Mo-Fr 07:00-19:00', at(4, '18:59'))?.isOpen === true, '24-hour clock');
assert(getOpenStatus('Open 24 hours', at(2, '03:00'))?.isOpen === true, 'always open');
assert(getOpenStatus('Mon closed, Tue-Sun noon-midnight', at(1, '13:00'))?.detail === 'Opens tomorrow 12pm', 'closed days are skipped');

assert(parseHours('Dawn to dusk') === null, 'unreadable hours return null');
assert(getOpenStatus(undefined) === null, 'missing hours return null');
assert(formatClockTime(0) === '12am' && formatClockTime(12 * 60 + 30) === '12:30pm', 'formats clock times');

console.log('hours tests passed');
