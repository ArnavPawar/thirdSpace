import { buildViewbox, rankSearchResults, scoreTextMatch } from './search';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(scoreTextMatch('north', { name: 'Northside Social' }) > scoreTextMatch('north', { name: 'Cafe North' }), 'prefix beats word match');
assert(scoreTextMatch('wifi', { name: 'Blue Door', category: 'Cafe & Coworking' }) > 0, 'keyword finds cafes');
assert(scoreTextMatch('basketball', { name: 'Blue Door', category: 'Cafe & Coworking' }) === 0, 'keyword rejects wrong category');
assert(scoreTextMatch('game night', { name: 'The Board Room', purpose: 'Board Game Night' }) > 0, 'multi-word purpose match');

const home = { latitude: 38.878, longitude: -77.1205 };
const spots = [
  { name: 'Coffee Far Away', latitude: 40.7128, longitude: -74.006 },
  { name: 'Coffee Nearby', latitude: 38.88, longitude: -77.11 },
];
const ranked = rankSearchResults(
  spots,
  'coffee',
  (spot) => ({ name: spot.name, category: 'Cafe & Coworking' }),
  (spot) => spot,
  home
);
assert(ranked[0].name === 'Coffee Nearby', 'nearby results rank first');
assert(rankSearchResults(spots, '', (spot) => ({ name: spot.name }), (spot) => spot, home).length === 2, 'empty query keeps everything');

assert(buildViewbox(home, 10).split(',').length === 4, 'viewbox has four coordinates');

console.log('search tests passed');
