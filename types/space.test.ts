import {
  calculateDistanceMiles,
  calculateOverallScore,
  clampRatingValue,
  createDefaultAttributeScores,
  isPurposeValidForCategory,
  normalizePurposeForCategory,
  sanitizeAttributeScores,
} from './space';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(clampRatingValue(10) === 5, 'clamps high rating values');
assert(clampRatingValue(-2) === 1, 'clamps low rating values');
assert(clampRatingValue(Number.NaN) === 1, 'clamps invalid rating values');

const cafeDefaults = createDefaultAttributeScores('Cafe & Coworking');
assert(cafeDefaults.wifi_quality === 3, 'creates default cafe scores');
assert(cafeDefaults.outlet_density === 3, 'creates every configured cafe score');

const sanitized = sanitizeAttributeScores({ wifi_quality: 6, outlet_density: -1 });
assert(sanitized.wifi_quality === 5, 'sanitizes high attribute scores');
assert(sanitized.outlet_density === 1, 'sanitizes low attribute scores');

assert(calculateOverallScore({ wifi_quality: 5, outlet_density: 5 }) === 100, 'calculates perfect score');
assert(calculateOverallScore({ wifi_quality: 0, outlet_density: 10 }) === 60, 'calculates from sanitized values');

assert(isPurposeValidForCategory('Cafe & Coworking', 'Remote Work'), 'accepts valid category purpose');
assert(!isPurposeValidForCategory('Cafe & Coworking', 'Pickup Game'), 'rejects invalid category purpose');
assert(normalizePurposeForCategory('Park & Nature', 'Pickup Game') === 'Reading', 'normalizes invalid purpose to category default');

const distance = calculateDistanceMiles(
  { latitude: 38.8816, longitude: -77.1081 },
  { latitude: 38.8859, longitude: -77.1364 }
);
assert(distance > 1 && distance < 2, 'calculates plausible local distance');

console.log('space domain tests passed');
