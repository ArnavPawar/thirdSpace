import type { CategoryPurpose, RatingHistoryEntry, SpaceCategory } from './space';

export type VibeIdentityId =
  | 'work_junkie'
  | 'late_night_viber'
  | 'party_animal'
  | 'nature_soul'
  | 'sunset_chaser'
  | 'game_master'
  | 'court_rat'
  | 'urban_explorer'
  | 'social_butterfly';

export interface VibeIdentity {
  id: VibeIdentityId;
  title: string;
  tagline: string;
  color: string;
  categories: readonly SpaceCategory[];
  purposes: readonly CategoryPurpose[];
}

export const VIBE_IDENTITIES: readonly VibeIdentity[] = [
  {
    id: 'work_junkie',
    title: 'Work Junkie',
    tagline: 'Wi-Fi first, outlets second, everything else third.',
    color: '#2563eb',
    categories: ['Cafe & Coworking'],
    purposes: ['Remote Work', 'Deep Focus', 'Lobby Work', 'Coffee Meeting'],
  },
  {
    id: 'late_night_viber',
    title: 'Late Night Viber',
    tagline: 'The best spots open up after dark.',
    color: '#4338ca',
    categories: [],
    purposes: ['Late-Night Chill', 'Night Session', 'Low-Key Night'],
  },
  {
    id: 'party_animal',
    title: 'Party Animal',
    tagline: 'Always knows where the night is going.',
    color: '#db2777',
    categories: ['Social Drinking Spots'],
    purposes: ['Celebration', 'Drinks With Friends'],
  },
  {
    id: 'nature_soul',
    title: 'Nature Soul',
    tagline: 'Grass, shade, and a good bench.',
    color: '#16a34a',
    categories: ['Park & Nature'],
    purposes: ['Walking', 'Picnic', 'Nature Reset', 'Reading'],
  },
  {
    id: 'sunset_chaser',
    title: 'Sunset Chaser',
    tagline: 'Plans the whole day around golden hour.',
    color: '#ea580c',
    categories: ['Smoke & Sunset Spots'],
    purposes: ['Sunset Watch', 'Quiet Smoke', 'Date Spot'],
  },
  {
    id: 'game_master',
    title: 'Game Master',
    tagline: 'Board games, arcades, and friendly trash talk.',
    color: '#0d9488',
    categories: ['Interactive Fun (Arcades, Board Games)'],
    purposes: ['Group Games', 'Arcade Session', 'Board Game Night', 'Affordable Fun'],
  },
  {
    id: 'court_rat',
    title: 'Court Rat',
    tagline: 'Knows every court with working lights.',
    color: '#f97316',
    categories: ['Sports Area'],
    purposes: ['Pickup Game', 'Training', 'Spectating'],
  },
  {
    id: 'urban_explorer',
    title: 'Urban Explorer',
    tagline: 'Finds the lobbies nobody else noticed.',
    color: '#7c3aed',
    categories: ['Public Architecture (Atriums, Hotel Lobbies)'],
    purposes: ['People Watching', 'Architecture Walk', 'Rest Break'],
  },
  {
    id: 'social_butterfly',
    title: 'Social Butterfly',
    tagline: 'Every spot is better with people.',
    color: '#e11d48',
    categories: [],
    purposes: ['Casual Hangout', 'Conversation', 'Coffee Meeting', 'Group Games', 'Drinks With Friends'],
  },
];

export const VIBE_IDENTITY_UNLOCK = 25;

export interface VibeMilestone {
  threshold: number;
  name: string;
  description: string;
  perks: readonly string[];
  secretSlots: number;
  ringColor: string;
}

export const VIBE_MILESTONES: readonly VibeMilestone[] = [
  {
    threshold: 0,
    name: 'Newcomer',
    description: 'Welcome in. Rate your first spot to get started.',
    perks: ['1 secret spot slot'],
    secretSlots: 1,
    ringColor: '#cbd5e1',
  },
  {
    threshold: 1,
    name: 'First Check-in',
    description: 'You rated your first spot.',
    perks: ['First Check-in badge', '1 secret spot slot'],
    secretSlots: 1,
    ringColor: '#93c5fd',
  },
  {
    threshold: 5,
    name: 'Regular',
    description: 'Five spots in. People are starting to notice.',
    perks: ['Regular badge', '2 secret spot slots'],
    secretSlots: 2,
    ringColor: '#60a5fa',
  },
  {
    threshold: 10,
    name: 'Local',
    description: 'You know the area better than most.',
    perks: ['Local badge', 'Blue profile ring', '3 secret spot slots'],
    secretSlots: 3,
    ringColor: '#3b82f6',
  },
  {
    threshold: VIBE_IDENTITY_UNLOCK,
    name: 'Vibe Identity',
    description: 'Claim a title that says who you are.',
    perks: ['Custom Vibe title (Late Night Viber, Work Junkie...)', 'Purple profile ring', '5 secret spot slots'],
    secretSlots: 5,
    ringColor: '#8b5cf6',
  },
  {
    threshold: 50,
    name: 'Tastemaker',
    description: 'Your ratings shape the map.',
    perks: ['Tastemaker badge', 'Gold profile ring', '10 secret spot slots'],
    secretSlots: 10,
    ringColor: '#f59e0b',
  },
  {
    threshold: 100,
    name: 'Legend',
    description: 'One hundred spots. Absolute legend.',
    perks: ['Legend badge', 'Rose-gold profile ring', 'Unlimited secret spots'],
    secretSlots: Number.POSITIVE_INFINITY,
    ringColor: '#f43f5e',
  },
];

export interface VibeProgress {
  current: VibeMilestone;
  next?: VibeMilestone;
  remaining: number;
  progress: number;
  achieved: VibeMilestone[];
}

export function getVibeProgress(spacesRated: number): VibeProgress {
  const count = Math.max(0, Math.floor(spacesRated));
  const achieved = VIBE_MILESTONES.filter((milestone) => count >= milestone.threshold);
  const current = achieved[achieved.length - 1];
  const next = VIBE_MILESTONES.find((milestone) => milestone.threshold > count);

  if (!next) {
    return { current, remaining: 0, progress: 1, achieved };
  }

  const span = next.threshold - current.threshold;
  return {
    current,
    next,
    remaining: next.threshold - count,
    progress: span > 0 ? (count - current.threshold) / span : 1,
    achieved,
  };
}

export function isLateNight(dateString: string): boolean {
  const hour = new Date(dateString).getHours();
  return hour >= 21 || hour < 4;
}

export interface IdentityScore {
  identity: VibeIdentity;
  score: number;
}

export function scoreVibeIdentities(history: RatingHistoryEntry[]): IdentityScore[] {
  return VIBE_IDENTITIES
    .map((identity) => {
      const score = history.reduce((total, entry) => {
        let points = 0;
        if (identity.categories.includes(entry.category)) points += 2;
        if (entry.primary_purpose && identity.purposes.includes(entry.primary_purpose)) points += 2;
        if (identity.id === 'late_night_viber' && isLateNight(entry.created_at)) points += 1;
        return total + points;
      }, 0);
      return { identity, score };
    })
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
}

export interface VibeIdentityState {
  isUnlocked: boolean;
  suggested?: VibeIdentity;
  options: VibeIdentity[];
  selected?: VibeIdentity;
}

export function getVibeIdentityState(
  history: RatingHistoryEntry[],
  spacesRated: number,
  selectedTitle?: string
): VibeIdentityState {
  const ranked = scoreVibeIdentities(history);
  const options = ranked.slice(0, 4).map((item) => item.identity);
  const isUnlocked = spacesRated >= VIBE_IDENTITY_UNLOCK;

  return {
    isUnlocked,
    suggested: ranked[0]?.identity,
    options,
    selected: isUnlocked ? findVibeIdentityByTitle(selectedTitle) || ranked[0]?.identity : undefined,
  };
}

export function findVibeIdentityByTitle(title?: string): VibeIdentity | undefined {
  if (!title) return undefined;
  return VIBE_IDENTITIES.find((identity) => identity.title.toLowerCase() === title.toLowerCase());
}

export function getSecretSlotsRemaining(spacesRated: number, ownedSecretSpots: number): number {
  return Math.max(0, getVibeProgress(spacesRated).current.secretSlots - ownedSecretSpots);
}
