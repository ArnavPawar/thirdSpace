import { calculateDistanceMiles, type SpaceCategory } from '../types/space';

export type Coordinate = { latitude: number; longitude: number };

export interface SearchFields {
  name?: string;
  category?: SpaceCategory;
  purpose?: string;
  address?: string;
  extra?: (string | undefined)[];
}

const CATEGORY_KEYWORDS: Record<SpaceCategory, string[]> = {
  'Cafe & Coworking': ['cafe', 'coffee', 'espresso', 'latte', 'tea', 'wifi', 'work', 'remote', 'laptop', 'study', 'cowork', 'focus', 'outlet'],
  'Park & Nature': ['park', 'nature', 'trail', 'walk', 'hike', 'picnic', 'garden', 'green', 'bench', 'tree', 'grass', 'river'],
  'Sports Area': ['sport', 'court', 'field', 'basketball', 'soccer', 'tennis', 'pickleball', 'volleyball', 'gym', 'pickup', 'run', 'track'],
  'Smoke & Sunset Spots': ['sunset', 'view', 'overlook', 'skyline', 'smoke', 'rooftop', 'chill', 'date', 'golden'],
  'Social Drinking Spots': ['bar', 'drink', 'beer', 'wine', 'cocktail', 'pub', 'brewery', 'lounge', 'nightlife', 'happy hour'],
  'Interactive Fun (Arcades, Board Games)': ['arcade', 'game', 'board game', 'bowling', 'pool', 'billiards', 'karaoke', 'trivia', 'fun'],
  'Public Architecture (Atriums, Hotel Lobbies)': ['lobby', 'hotel', 'atrium', 'library', 'architecture', 'museum', 'indoor', 'quiet', 'building'],
};

export function normalizeSearchText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const tokenMatches = (token: string, keyword: string) =>
  token.length >= 3 ? keyword.startsWith(token) || token.startsWith(keyword) : keyword === token;

// 0 means no match. Name matches dominate; category/purpose keywords let "wifi" or "basketball" find spots.
export function scoreTextMatch(query: string, fields: SearchFields): number {
  const normalized = normalizeSearchText(query);
  if (!normalized) return 1;

  const name = normalizeSearchText(fields.name || '');
  let nameScore = 0;
  if (name === normalized) nameScore = 100;
  else if (name.startsWith(normalized)) nameScore = 85;
  else if (name.split(' ').some((word) => word.startsWith(normalized))) nameScore = 70;
  else if (name.includes(normalized)) nameScore = 55;

  const purpose = normalizeSearchText(fields.purpose || '');
  const address = normalizeSearchText(fields.address || '');
  const extra = normalizeSearchText((fields.extra || []).filter(Boolean).join(' '));
  const categoryKeywords = fields.category ? CATEGORY_KEYWORDS[fields.category] : [];

  const tokens = normalized.split(' ');
  let tokenScore = 0;
  const everyTokenMatched = tokens.every((token) => {
    if (name.includes(token)) tokenScore += 18;
    else if (categoryKeywords.some((keyword) => tokenMatches(token, keyword))) tokenScore += 14;
    else if (purpose.includes(token)) tokenScore += 12;
    else if (extra.includes(token)) tokenScore += 10;
    else if (address.includes(token)) tokenScore += 6;
    else return false;
    return true;
  });

  return Math.max(nameScore, everyTokenMatched ? Math.min(tokenScore, 80) : 0);
}

export function distancePenalty(distanceMiles?: number) {
  if (distanceMiles === undefined) return 0;
  return Math.min(45, distanceMiles * 4);
}

export function rankSearchResults<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchFields,
  getCoordinate: (item: T) => Coordinate,
  origin?: Coordinate
): T[] {
  if (!normalizeSearchText(query)) return items;

  return items
    .map((item) => {
      const relevance = scoreTextMatch(query, getFields(item));
      const distance = origin ? calculateDistanceMiles(origin, getCoordinate(item)) : undefined;
      return { item, relevance, rank: relevance - distancePenalty(distance) };
    })
    .filter((entry) => entry.relevance > 0)
    .sort((first, second) => second.rank - first.rank)
    .map((entry) => entry.item);
}

export function buildViewbox(center: Coordinate, radiusMiles: number) {
  const latitudeDelta = radiusMiles / 69;
  const longitudeDelta = radiusMiles / (69 * Math.cos((center.latitude * Math.PI) / 180));
  return [
    center.longitude - longitudeDelta,
    center.latitude + latitudeDelta,
    center.longitude + longitudeDelta,
    center.latitude - latitudeDelta,
  ].map((value) => value.toFixed(5)).join(',');
}
