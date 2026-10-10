export type SpaceCategory =
  | 'Cafe & Coworking'
  | 'Park & Nature'
  | 'Sports Area'
  | 'Smoke & Sunset Spots'
  | 'Social Drinking Spots'
  | 'Interactive Fun (Arcades, Board Games)'
  | 'Public Architecture (Atriums, Hotel Lobbies)';

export type VibeAttributeKey =
  | 'wifi_quality'
  | 'outlet_density'
  | 'quietness'
  | 'chair_comfort'
  | 'scenery_views'
  | 'seating_benches'
  | 'shade_cover'
  | 'cleanliness'
  | 'court_field_quality'
  | 'night_lighting'
  | 'crowdedness'
  | 'amenities'
  | 'privacy_seclusion'
  | 'view_quality'
  | 'wind_shelter'
  | 'chill_factor'
  | 'conversation_volume'
  | 'drink_variety'
  | 'cozy_vibe'
  | 'dim_lighting'
  | 'gear_game_quality'
  | 'group_friendliness'
  | 'cost_value'
  | 'atmosphere'
  | 'people_watching'
  | 'design_aesthetic'
  | 'public_restrooms'
  | 'comfort';

export type CategoryPurpose =
  | 'Remote Work'
  | 'Coffee Meeting'
  | 'Deep Focus'
  | 'Casual Hangout'
  | 'Reading'
  | 'Walking'
  | 'Picnic'
  | 'Nature Reset'
  | 'Pickup Game'
  | 'Training'
  | 'Spectating'
  | 'Night Session'
  | 'Sunset Watch'
  | 'Quiet Smoke'
  | 'Late-Night Chill'
  | 'Date Spot'
  | 'Conversation'
  | 'Drinks With Friends'
  | 'Low-Key Night'
  | 'Celebration'
  | 'Group Games'
  | 'Arcade Session'
  | 'Board Game Night'
  | 'Affordable Fun'
  | 'People Watching'
  | 'Architecture Walk'
  | 'Lobby Work'
  | 'Rest Break';

export interface VibeAttributeDefinition {
  key: VibeAttributeKey;
  label: string;
  description: string;
}

export interface CategoryConfig {
  label: SpaceCategory;
  attributes: readonly VibeAttributeDefinition[];
  purposes: readonly CategoryPurpose[];
}

export type AttributeScores = Partial<Record<VibeAttributeKey, number>>;
export type RatingTarget = 'space' | 'review';

export const CATEGORY_CONFIG = {
  'Cafe & Coworking': {
    label: 'Cafe & Coworking',
    attributes: [
      {
        key: 'wifi_quality',
        label: 'Wi-Fi Quality',
        description: 'Reliability and speed for calls, browsing, and focused work.',
      },
      {
        key: 'outlet_density',
        label: 'Outlet Density',
        description: 'How easy it is to find usable power nearby.',
      },
      {
        key: 'quietness',
        label: 'Quietness',
        description: 'How calm and focus-friendly the sound level feels.',
      },
      {
        key: 'chair_comfort',
        label: 'Chair Comfort',
        description: 'How comfortable the seating is for a longer stay.',
      },
    ],
    purposes: ['Remote Work', 'Coffee Meeting', 'Deep Focus', 'Casual Hangout'],
  },
  'Park & Nature': {
    label: 'Park & Nature',
    attributes: [
      {
        key: 'scenery_views',
        label: 'Scenery/Views',
        description: 'Natural beauty, views, and visual calm.',
      },
      {
        key: 'seating_benches',
        label: 'Seating/Benches',
        description: 'Availability and quality of places to sit.',
      },
      {
        key: 'shade_cover',
        label: 'Shade/Cover',
        description: 'Protection from sun, rain, and weather.',
      },
      {
        key: 'cleanliness',
        label: 'Cleanliness',
        description: 'How well-kept the space feels.',
      },
    ],
    purposes: ['Reading', 'Walking', 'Picnic', 'Nature Reset'],
  },
  'Sports Area': {
    label: 'Sports Area',
    attributes: [
      {
        key: 'court_field_quality',
        label: 'Court/Field Quality',
        description: 'Surface condition, markings, and playability.',
      },
      {
        key: 'night_lighting',
        label: 'Night Lighting',
        description: 'How usable the space is after dark.',
      },
      {
        key: 'crowdedness',
        label: 'Crowdedness',
        description: 'How manageable the wait and crowd level are.',
      },
      {
        key: 'amenities',
        label: 'Amenities',
        description: 'Water, restrooms, equipment, and nearby support.',
      },
    ],
    purposes: ['Pickup Game', 'Training', 'Spectating', 'Night Session'],
  },
  'Smoke & Sunset Spots': {
    label: 'Smoke & Sunset Spots',
    attributes: [
      {
        key: 'privacy_seclusion',
        label: 'Privacy/Seclusion',
        description: 'How tucked-away and low-pressure the spot feels.',
      },
      {
        key: 'view_quality',
        label: 'View Quality',
        description: 'How strong the sunset, skyline, or overlook is.',
      },
      {
        key: 'wind_shelter',
        label: 'Wind Shelter',
        description: 'How protected the spot is from gusts and exposure.',
      },
      {
        key: 'chill_factor',
        label: 'Chill Factor',
        description: 'Overall relaxed, stay-awhile energy.',
      },
    ],
    purposes: ['Sunset Watch', 'Quiet Smoke', 'Late-Night Chill', 'Date Spot'],
  },
  'Social Drinking Spots': {
    label: 'Social Drinking Spots',
    attributes: [
      {
        key: 'conversation_volume',
        label: 'Conversation Volume',
        description: 'How easy it is to talk without shouting.',
      },
      {
        key: 'drink_variety',
        label: 'Drink Variety',
        description: 'Range and quality of drinks available.',
      },
      {
        key: 'cozy_vibe',
        label: 'Cozy Vibe',
        description: 'Warmth, intimacy, and comfort of the setting.',
      },
      {
        key: 'dim_lighting',
        label: 'Dim Lighting',
        description: 'How well the lighting supports a relaxed night out.',
      },
    ],
    purposes: ['Conversation', 'Drinks With Friends', 'Low-Key Night', 'Celebration'],
  },
  'Interactive Fun (Arcades, Board Games)': {
    label: 'Interactive Fun (Arcades, Board Games)',
    attributes: [
      {
        key: 'gear_game_quality',
        label: 'Gear/Game Quality',
        description: 'Condition and variety of games, gear, and tables.',
      },
      {
        key: 'group_friendliness',
        label: 'Group Friendliness',
        description: 'How well the space works for groups.',
      },
      {
        key: 'cost_value',
        label: 'Cost Value',
        description: 'Whether the experience feels worth the price.',
      },
      {
        key: 'atmosphere',
        label: 'Atmosphere',
        description: 'Energy, decor, and overall fun factor.',
      },
    ],
    purposes: ['Group Games', 'Arcade Session', 'Board Game Night', 'Affordable Fun'],
  },
  'Public Architecture (Atriums, Hotel Lobbies)': {
    label: 'Public Architecture (Atriums, Hotel Lobbies)',
    attributes: [
      {
        key: 'people_watching',
        label: 'People Watching',
        description: 'How interesting and comfortable the public flow is.',
      },
      {
        key: 'design_aesthetic',
        label: 'Design/Aesthetic',
        description: 'Architecture, materials, light, and visual detail.',
      },
      {
        key: 'public_restrooms',
        label: 'Public Restrooms',
        description: 'Availability and cleanliness of restrooms.',
      },
      {
        key: 'comfort',
        label: 'Comfort',
        description: 'How comfortable it is to sit, pause, or work briefly.',
      },
    ],
    purposes: ['People Watching', 'Architecture Walk', 'Lobby Work', 'Rest Break'],
  },
} as const satisfies Record<SpaceCategory, CategoryConfig>;

export const SPACE_CATEGORIES = Object.keys(CATEGORY_CONFIG) as SpaceCategory[];

export function createDefaultAttributeScores(category: SpaceCategory, defaultValue = 3): AttributeScores {
  return CATEGORY_CONFIG[category].attributes.reduce<AttributeScores>((scores, attribute) => {
    scores[attribute.key] = clampRatingValue(defaultValue);
    return scores;
  }, {});
}

export function clampRatingValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

export function sanitizeAttributeScores(attributeScores: AttributeScores): AttributeScores {
  return Object.entries(attributeScores).reduce<AttributeScores>((scores, [key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      scores[key as VibeAttributeKey] = clampRatingValue(value);
    }

    return scores;
  }, {});
}

export function calculateOverallScore(attributeScores: AttributeScores): number {
  const values = Object.values(sanitizeAttributeScores(attributeScores)).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );

  if (values.length === 0) {
    return 0;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.round((average / 5) * 100);
}

export function isPurposeValidForCategory(category: SpaceCategory, purpose: CategoryPurpose): boolean {
  return (CATEGORY_CONFIG[category].purposes as readonly CategoryPurpose[]).includes(purpose);
}

export function normalizePurposeForCategory(
  category: SpaceCategory,
  purpose?: CategoryPurpose
): CategoryPurpose {
  return purpose && isPurposeValidForCategory(category, purpose)
    ? purpose
    : CATEGORY_CONFIG[category].purposes[0];
}

export function calculateDistanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export interface ThirdSpace {
  id: string;
  name: string;
  category: SpaceCategory;
  primary_purpose?: CategoryPurpose;
  address: string;
  latitude: number;
  longitude: number;
  description?: string;
  website?: string;
  phone?: string;
  hours?: string;
  is_secret?: boolean;
  created_by?: string;
  area_hint?: string;
  created_at: string;
  updated_at: string;
}

export interface VibeAttributes {
  id: string;
  space_id: string;
  category: SpaceCategory;
  primary_purpose: CategoryPurpose;
  attribute_scores: AttributeScores;
  overall_score: number;
  total_ratings: number;
  created_at: string;
  updated_at: string;
}

export interface UserRanking {
  id: string;
  user_id: string;
  space_id: string;
  personal_rank: number;
  notes?: string;
  is_favorite: boolean;
  last_visited?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRating {
  id: string;
  user_id: string;
  space_id: string;
  category: SpaceCategory;
  primary_purpose: CategoryPurpose;
  attribute_scores: AttributeScores;
  overall_score: number;
  review_text?: string;
  likes_count?: number;
  comments_count?: number;
  current_user_liked?: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string; // References auth.users.id
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  vibe_title?: string;
  is_following?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceWithAttributes extends ThirdSpace {
  attributes?: VibeAttributes;
  user_ranking?: UserRanking;
  distance?: number; // Distance in miles from user location
  ratings_count?: number;
  favorites_count?: number;
  current_user_favorited?: boolean;
}

export interface ReviewPhoto {
  id: string;
  user_id: string;
  space_id: string;
  rating_id?: string;
  comment_id?: string;
  url: string;
  width?: number;
  height?: number;
  created_at: string;
  profile?: Profile;
}

export interface ReviewComment {
  id: string;
  rating_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Profile;
  photos?: ReviewPhoto[];
}

export interface FeedActivity extends UserRating {
  space: SpaceWithAttributes;
  profile: Profile;
  is_following?: boolean;
  photos?: ReviewPhoto[];
}

export interface ProfileStats {
  spaces_rated: number;
  reviews_written: number;
  helpful_votes: number;
  rank_in_area: number;
  followers: number;
  following: number;
}

export interface ProfileWithStats extends Profile {
  stats: ProfileStats;
}

export interface SpaceDetails extends SpaceWithAttributes {
  reviews: FeedActivity[];
  comments: ReviewComment[];
}

export interface RatingFormData {
  category: SpaceCategory;
  primary_purpose: CategoryPurpose;
  attribute_scores: AttributeScores;
  review_text?: string;
}

export interface SubmitRatingInput {
  space: Pick<ThirdSpace, 'name' | 'address' | 'latitude' | 'longitude'> &
    Partial<Pick<ThirdSpace, 'id' | 'description' | 'website' | 'phone' | 'hours'>>;
  rating: RatingFormData;
  secret?: { area_hint?: string };
  photos?: LocalPhoto[];
}

export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export const MAX_PHOTOS_PER_POST = 4;

export interface RatingHistoryEntry {
  category: SpaceCategory;
  primary_purpose?: CategoryPurpose;
  created_at: string;
}

export type EventKind = 'one_time' | 'weekly';
export type EventSourceType = 'rating' | 'space' | 'hosted';
export type EventVisibility = 'public' | 'private';
export type EventTheme = 'indigo' | 'sunset' | 'night' | 'court' | 'cafe' | 'grove';

export interface SpaceEvent {
  id: string;
  space_id: string;
  source_type: EventSourceType;
  source_id: string;
  source_user_id?: string;
  /** Shared by every mention of the same event at the same spot. Hosted events are their own series. */
  series_id?: string;
  /** How many reviews mention this event, when known. */
  mention_count?: number;
  host_user_id?: string;
  visibility: EventVisibility;
  theme: EventTheme;
  title: string;
  kind: EventKind;
  event_date?: string; // YYYY-MM-DD, one_time only
  weekday?: number; // 0 = Sunday, weekly only
  start_time?: string; // HH:MM, 24h
  link_url?: string;
  snippet: string;
  description?: string;
  capacity?: number;
  allow_over_capacity: boolean;
  invite_token?: string;
  cancelled_at?: string;
  source_created_at: string;
  created_at: string;
  space: SpaceWithAttributes;
  profile?: Profile;
  /** The date the going/here headcounts below belong to. Weekly events have one per week. */
  occurrence_date?: string;
  going_count: number;
  going: Profile[];
  viewer_going: boolean;
  viewer_rsvp?: RsvpStatus;
  here_count: number;
  here: Profile[];
  viewer_here: boolean;
}

export type RsvpStatus = 'going' | 'not_going';

export interface EventMessage {
  id: string;
  event_id: string;
  occurrence_date: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Profile;
}

export const MAX_EVENT_MESSAGE_LENGTH = 1000;

export interface CreateHostedEventInput {
  title: string;
  eventDate: string;
  startTime: string;
  visibility: EventVisibility;
  theme?: EventTheme;
  description?: string;
  capacity?: number;
  allowOverCapacity?: boolean;
  linkUrl?: string;
  existingSpace: boolean;
  space: Pick<ThirdSpace, 'id' | 'name' | 'category' | 'address' | 'latitude' | 'longitude'> & {
    primary_purpose?: CategoryPurpose;
  };
}

export interface CalendarOccurrence {
  key: string;
  date: string; // YYYY-MM-DD
  event: SpaceEvent;
  distance?: number;
  mention_count: number;
}

export type SecretAccessStatus = 'owner' | 'unlocked' | 'pending' | 'locked';

export interface SecretSpotPreview {
  id: string;
  category: SpaceCategory;
  primary_purpose?: CategoryPurpose;
  area_hint?: string;
  approx_latitude: number;
  approx_longitude: number;
  owner: Profile;
  overall_score?: number;
  access: SecretAccessStatus;
  space?: SpaceWithAttributes;
  created_at: string;
}

export type SecretRequestKind = 'request' | 'trade';

export interface SecretSpotRequest {
  id: string;
  space_id: string;
  requester_id: string;
  owner_id: string;
  kind: SecretRequestKind;
  offered_space_id?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester?: Profile;
  space_name?: string;
  offered_space_category?: SpaceCategory;
}