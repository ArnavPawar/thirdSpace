import {
  getSecretSlotsRemaining,
  getVibeIdentityState,
  getVibeProgress,
  scoreVibeIdentities,
  VIBE_IDENTITY_UNLOCK,
} from './vibes';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(getVibeProgress(0).current.name === 'Newcomer', 'starts at newcomer');
assert(getVibeProgress(1).current.name === 'First Check-in', 'reaches first milestone');
assert(getVibeProgress(7).next?.name === 'Local', 'points at the next milestone');
assert(getVibeProgress(7).remaining === 3, 'counts remaining spots');
assert(getVibeProgress(500).next === undefined, 'caps at the final milestone');
assert(getVibeProgress(500).progress === 1, 'final milestone is full progress');

assert(getSecretSlotsRemaining(0, 0) === 1, 'newcomers get one secret slot');
assert(getSecretSlotsRemaining(0, 1) === 0, 'secret slots run out');
assert(getSecretSlotsRemaining(25, 1) === 4, 'vibe identity tier grants more slots');

const workHistory = [
  { category: 'Cafe & Coworking' as const, primary_purpose: 'Remote Work' as const, created_at: '2026-05-25T14:00:00' },
  { category: 'Cafe & Coworking' as const, primary_purpose: 'Deep Focus' as const, created_at: '2026-05-26T14:00:00' },
  { category: 'Park & Nature' as const, primary_purpose: 'Walking' as const, created_at: '2026-05-27T14:00:00' },
];

assert(scoreVibeIdentities(workHistory)[0].identity.id === 'work_junkie', 'detects work junkie');

const nightHistory = [
  { category: 'Smoke & Sunset Spots' as const, primary_purpose: 'Late-Night Chill' as const, created_at: '2026-05-25T23:30:00' },
  { category: 'Social Drinking Spots' as const, primary_purpose: 'Low-Key Night' as const, created_at: '2026-05-26T23:00:00' },
];

assert(scoreVibeIdentities(nightHistory)[0].identity.id === 'late_night_viber', 'detects late night viber');

assert(!getVibeIdentityState(workHistory, VIBE_IDENTITY_UNLOCK - 1).isUnlocked, 'identity locked before milestone');
assert(getVibeIdentityState(workHistory, VIBE_IDENTITY_UNLOCK).selected?.id === 'work_junkie', 'identity defaults to suggestion');
assert(
  getVibeIdentityState(workHistory, VIBE_IDENTITY_UNLOCK, 'Nature Soul').selected?.id === 'nature_soul',
  'identity respects chosen title'
);

console.log('vibe domain tests passed');
