import {
  calculateDistanceMiles,
  calculateOverallScore,
  normalizePurposeForCategory,
  sanitizeAttributeScores,
  type AttributeScores,
  type CalendarOccurrence,
  type CategoryPurpose,
  type EventKind,
  type EventSourceType,
  type FeedActivity,
  type Profile,
  type ProfileWithStats,
  type RatingHistoryEntry,
  type ReviewComment,
  type SecretAccessStatus,
  type SecretRequestKind,
  type SecretSpotPreview,
  type SecretSpotRequest,
  type SpaceCategory,
  type SpaceDetails,
  type SpaceEvent,
  type SpaceWithAttributes,
  type SubmitRatingInput,
  type UserRanking,
} from '@/types/space';
import {
  demoComments,
  demoCurrentUserId,
  demoFeed,
  demoProfile,
  demoProfiles,
  demoRankings,
  demoSecretAccess,
  demoSecretRequests,
  demoSecretSpaces,
  demoSpaces,
} from './fixtures';
import {
  buildEventRows,
  expandEventDates,
  extractEvents,
  getMonthRange,
  toDateKey,
  WEEKLY_LIFETIME_DAYS,
  WEEKLY_LOOKBACK_DAYS,
  type EventRow,
  type EventSource,
} from './events';
import { isSupabaseConfigured, supabase } from './supabase';

type RankingWithSpace = UserRanking & { space: SpaceWithAttributes };
type SpaceFilters = {
  query?: string;
  category?: SpaceCategory | 'All Categories';
  purpose?: CategoryPurpose | 'All Purposes';
  userLocation?: { latitude: number; longitude: number };
  viewerId?: string;
};
type FeedScope = 'public' | 'following';
type FeedOptions = {
  currentUserId?: string;
  scope?: FeedScope;
};

const localState = {
  spaces: [...demoSpaces, ...demoSecretSpaces],
  feed: [...demoFeed],
  comments: [...demoComments],
  rankings: [...demoRankings],
  profiles: [...demoProfiles],
  following: new Set(['user-mike', 'user-nina']),
  secretAccess: new Set(demoSecretAccess),
  secretRequests: [...demoSecretRequests],
  sessionRatings: {} as Record<string, number>,
  events: null as SpaceEvent[] | null,
};

const eventCache = new Map<string, CalendarOccurrence[]>();

const toIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const canUseUserScopedRemote = (userId: string) => Boolean(isSupabaseConfigured && supabase && isUuid(userId));
const secretAccessKey = (userId: string, spaceId: string) => `${userId}:${spaceId}`;
const coarsenCoordinate = (value: number) => Math.round(value * 100) / 100;

const byCreatedAtDesc = <T extends { created_at: string }>(items: T[]) =>
  [...items].sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());

const findLocalProfile = (userId?: string) =>
  localState.profiles.find((profile) => profile.user_id === userId);

const canViewLocalSpace = (space: SpaceWithAttributes, viewerId: string) =>
  !space.is_secret ||
  space.created_by === viewerId ||
  localState.secretAccess.has(secretAccessKey(viewerId, space.id));

const mapSpaceRow = (row: Record<string, unknown>): SpaceWithAttributes => ({
  id: String(row.id),
  name: String(row.name),
  category: row.category as SpaceCategory,
  primary_purpose: row.primary_purpose as CategoryPurpose | undefined,
  address: String(row.address),
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  description: (row.description as string | null) || undefined,
  website: (row.website as string | null) || undefined,
  phone: (row.phone as string | null) || undefined,
  hours: (row.hours as string | null) || undefined,
  is_secret: Boolean(row.is_secret),
  created_by: (row.created_by as string | null) || undefined,
  area_hint: (row.area_hint as string | null) || undefined,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const mapSpaceWithAttributesRow = (row: Record<string, unknown>): SpaceWithAttributes => {
  const rawAttributes = row.space_attributes;
  const attributes = Array.isArray(rawAttributes)
    ? rawAttributes[0] as Record<string, unknown> | undefined
    : rawAttributes as Record<string, unknown> | null | undefined;

  return {
    ...mapSpaceRow(row),
    attributes: attributes
      ? {
          id: String(attributes.id),
          space_id: String(attributes.space_id),
          category: attributes.category as SpaceCategory,
          primary_purpose: attributes.primary_purpose as CategoryPurpose,
          attribute_scores: attributes.attribute_scores as AttributeScores,
          overall_score: Number(attributes.overall_score),
          total_ratings: Number(attributes.total_ratings),
          created_at: String(attributes.created_at),
          updated_at: String(attributes.updated_at),
        }
      : undefined,
  };
};

const mapProfileRow = (row: Record<string, unknown>): Profile => ({
  id: String(row.id),
  user_id: String(row.user_id),
  username: (row.username as string | null) || undefined,
  full_name: (row.full_name as string | null) || undefined,
  avatar_url: (row.avatar_url as string | null) || undefined,
  bio: (row.bio as string | null) || undefined,
  location: (row.location as string | null) || undefined,
  vibe_title: (row.vibe_title as string | null) || undefined,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const getDemoProfile = (userId: string): ProfileWithStats => {
  const storedProfile = findLocalProfile(userId);
  const sessionRatings = localState.sessionRatings[userId] || 0;

  return {
    ...(storedProfile || { ...demoProfile, user_id: userId }),
    stats: {
      ...demoProfile.stats,
      spaces_rated: demoProfile.stats.spaces_rated + sessionRatings,
      reviews_written: demoProfile.stats.reviews_written + sessionRatings,
      followers: localState.profiles.filter((profile) => profile.user_id !== userId).length,
      following: localState.following.size,
    },
  };
};

const applySpaceFilters = (spaces: SpaceWithAttributes[], filters: SpaceFilters = {}) => {
  const query = filters.query?.trim().toLowerCase();

  return spaces
    .filter((space) => {
      const matchesQuery = !query || [space.name, space.address, space.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
      const matchesCategory = !filters.category || filters.category === 'All Categories' || space.category === filters.category;
      const matchesPurpose = !filters.purpose || filters.purpose === 'All Purposes' || space.primary_purpose === filters.purpose;

      return matchesQuery && matchesCategory && matchesPurpose;
    })
    .map((space) => ({
      ...space,
      distance: filters.userLocation
        ? calculateDistanceMiles(filters.userLocation, { latitude: space.latitude, longitude: space.longitude })
        : space.distance,
    }))
    .sort((first, second) => {
      if (first.distance !== undefined && second.distance !== undefined) {
        return first.distance - second.distance;
      }

      return (second.attributes?.overall_score || 0) - (first.attributes?.overall_score || 0);
    });
};

const aggregateAttributes = (
  spaceId: string,
  category: SpaceCategory,
  primaryPurpose: CategoryPurpose,
  ratings: { attribute_scores: AttributeScores }[]
) => {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};

  ratings.forEach((rating) => {
    Object.entries(sanitizeAttributeScores(rating.attribute_scores)).forEach(([key, value]) => {
      if (typeof value !== 'number') return;
      totals[key] = (totals[key] || 0) + value;
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const averages = Object.entries(totals).reduce<AttributeScores>((scores, [key, total]) => {
    scores[key as keyof AttributeScores] = Math.round((total / counts[key]) * 10) / 10;
    return scores;
  }, {});

  return {
    id: `attr-${spaceId}`,
    space_id: spaceId,
    category,
    primary_purpose: primaryPurpose,
    attribute_scores: averages,
    overall_score: calculateOverallScore(averages),
    total_ratings: ratings.length,
    created_at: toIso(),
    updated_at: toIso(),
  };
};

const listVisibleLocalSpaces = (viewerId: string) =>
  localState.spaces.filter((space) => canViewLocalSpace(space, viewerId));

export async function listSpaces(filters: SpaceFilters = {}): Promise<SpaceWithAttributes[]> {
  const viewerId = filters.viewerId || demoCurrentUserId;

  if (!isSupabaseConfigured || !supabase) {
    return applySpaceFilters(listVisibleLocalSpaces(viewerId), filters);
  }

  const { data, error } = await supabase
    .from('spaces')
    .select('*, space_attributes(*)')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Falling back to demo spaces after Supabase error:', error.message);
    return applySpaceFilters(listVisibleLocalSpaces(viewerId), filters);
  }

  const spaces = (data || []).map((row: unknown) => mapSpaceWithAttributesRow(row as Record<string, unknown>));

  return applySpaceFilters(spaces, filters);
}

export async function getSpaceDetails(spaceId: string, viewerId = demoCurrentUserId): Promise<SpaceDetails | null> {
  const spaces = await listSpaces({ viewerId });
  const space = spaces.find((item) => item.id === spaceId)
    || listVisibleLocalSpaces(viewerId).find((item) => item.id === spaceId);
  if (!space) return null;

  const reviews = (await listRecentActivity({ currentUserId: viewerId })).filter((activity) => activity.space_id === spaceId);
  const comments = localState.comments.filter((comment) => reviews.some((review) => review.id === comment.rating_id));
  const ranking = localState.rankings.find((item) => item.user_id === viewerId && item.space_id === spaceId);

  return {
    ...space,
    current_user_favorited: ranking ? ranking.is_favorite : space.current_user_favorited,
    reviews,
    comments,
  };
}

export async function listRecentActivity(options: FeedOptions = {}): Promise<FeedActivity[]> {
  const scope = options.scope || 'public';
  const currentUserId = options.currentUserId || demoCurrentUserId;

  if (!isSupabaseConfigured || !supabase) {
    return filterFeedByScope(listRecentActivityFromDemo(currentUserId), scope);
  }

  const { data, error } = await supabase
    .from('ratings')
    .select('*, spaces(*)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('Falling back to demo feed after Supabase error:', error.message);
    return filterFeedByScope(listRecentActivityFromDemo(currentUserId), scope);
  }

  const visibleRows = ((data || []) as Record<string, unknown>[]).filter((row) => Boolean(row.spaces));
  const profileIds = Array.from(new Set(visibleRows.map((row) => String(row.user_id))));
  const profilesByUserId = await fetchProfilesByUserId(profileIds);
  const followingIds = await fetchFollowingIds(currentUserId);

  const remoteFeed = visibleRows.map((rawRow) => {
    const spaceRow = rawRow.spaces as Record<string, unknown>;
    const profile = profilesByUserId[String(rawRow.user_id)] || demoProfiles[0];

    return {
      id: String(rawRow.id),
      user_id: String(rawRow.user_id),
      space_id: String(rawRow.space_id),
      category: rawRow.category as SpaceCategory,
      primary_purpose: rawRow.primary_purpose as CategoryPurpose,
      attribute_scores: rawRow.attribute_scores as AttributeScores,
      overall_score: Number(rawRow.overall_score),
      review_text: (rawRow.review_text as string | null) || undefined,
      likes_count: 0,
      comments_count: 0,
      is_following: followingIds.has(String(rawRow.user_id)),
      created_at: String(rawRow.created_at),
      space: mapSpaceWithAttributesRow(spaceRow),
      profile,
    };
  });

  const mergedFeed = mergeFeedActivity(remoteFeed, listRecentActivityFromDemo(currentUserId));

  return filterFeedByScope(mergedFeed, scope);
}

function listRecentActivityFromDemo(viewerId: string): FeedActivity[] {
  return byCreatedAtDesc(localState.feed)
    .filter((activity) => canViewLocalSpace(activity.space, viewerId))
    .map((activity) => ({
      ...activity,
      profile: findLocalProfile(activity.user_id) || activity.profile,
      is_following: localState.following.has(activity.user_id),
      comments_count: localState.comments.filter((comment) => comment.rating_id === activity.id).length,
    }));
}

function mergeFeedActivity(primary: FeedActivity[], fallback: FeedActivity[]): FeedActivity[] {
  const seen = new Set(primary.map((activity) => activity.id));
  return byCreatedAtDesc([
    ...primary,
    ...fallback.filter((activity) => !seen.has(activity.id)),
  ]);
}

function filterFeedByScope(feed: FeedActivity[], scope: FeedScope): FeedActivity[] {
  if (scope === 'public') {
    return feed;
  }

  return feed.filter((activity) => activity.is_following);
}

async function fetchProfilesByUserId(userIds: string[]): Promise<Record<string, Profile>> {
  const validUserIds = userIds.filter(isUuid);
  if (!isSupabaseConfigured || !supabase || validUserIds.length === 0) return {};

  const { data, error } = await supabase.from('profiles').select('*').in('user_id', validUserIds);
  if (error) return {};

  return (data || []).reduce((profiles: Record<string, Profile>, row: unknown) => {
    const profile = mapProfileRow(row as Record<string, unknown>);
    profiles[profile.user_id] = profile;
    return profiles;
  }, {});
}

export async function submitRating(userId: string, input: SubmitRatingInput): Promise<void> {
  const category = input.rating.category;
  const primaryPurpose = normalizePurposeForCategory(category, input.rating.primary_purpose);
  const attributeScores = sanitizeAttributeScores(input.rating.attribute_scores);
  const overallScore = calculateOverallScore(attributeScores);
  const timestamp = toIso();
  const secretFields = input.secret
    ? { is_secret: true, created_by: userId, area_hint: input.secret.area_hint?.trim() || undefined }
    : {};

  if (!canUseUserScopedRemote(userId)) {
    const existingEvents = getLocalEvents();
    const existingSpace = localState.spaces.find((space) =>
      space.id === input.space.id ||
      (space.name.toLowerCase() === input.space.name.toLowerCase() &&
        Math.abs(space.latitude - input.space.latitude) < 0.0005 &&
        Math.abs(space.longitude - input.space.longitude) < 0.0005)
    );
    const space: SpaceWithAttributes = existingSpace || {
      id: input.space.id && !input.space.id.startsWith('draft-') ? input.space.id : createId('space'),
      name: input.space.name,
      category,
      primary_purpose: primaryPurpose,
      address: input.space.address,
      latitude: input.space.latitude,
      longitude: input.space.longitude,
      description: input.space.description,
      website: input.space.website,
      phone: input.space.phone,
      hours: input.space.hours,
      ...secretFields,
      created_at: timestamp,
      updated_at: timestamp,
      favorites_count: 0,
    };

    if (!existingSpace) {
      localState.spaces.unshift(space);
    }

    const ratingId = createId('rating');
    const profile = findLocalProfile(userId) || demoProfiles[0];
    const newEvents = [
      ...extractSpaceEvents(input.rating.review_text, {
        source_type: 'rating', source_id: ratingId, space_id: space.id, source_user_id: userId, source_created_at: timestamp,
      }, space, profile),
      ...(!existingSpace ? extractSpaceEvents(spaceEventText(space), {
        source_type: 'space', source_id: space.id, space_id: space.id, source_created_at: timestamp,
      }, space) : []),
    ];
    localState.events = [...existingEvents, ...newEvents];
    eventCache.clear();

    localState.feed.unshift({
      id: ratingId,
      user_id: userId,
      space_id: space.id,
      category,
      primary_purpose: primaryPurpose,
      attribute_scores: attributeScores,
      overall_score: overallScore,
      review_text: input.rating.review_text,
      likes_count: 0,
      comments_count: 0,
      current_user_liked: false,
      created_at: timestamp,
      space,
      profile,
    });
    localState.sessionRatings[userId] = (localState.sessionRatings[userId] || 0) + 1;

    const spaceRatings = localState.feed.filter((activity) => activity.space_id === space.id);
    space.attributes = aggregateAttributes(space.id, category, primaryPurpose, spaceRatings);

    const existingRanking = localState.rankings.find((ranking) => ranking.user_id === userId && ranking.space_id === space.id);
    if (!existingRanking) {
      localState.rankings.push({
        id: createId('ranking'),
        user_id: userId,
        space_id: space.id,
        personal_rank: localState.rankings.filter((ranking) => ranking.user_id === userId).length + 1,
        is_favorite: false,
        last_visited: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
        space,
      });
    }

    return;
  }

  const spacePayload = {
    ...(isUuid(input.space.id || '') ? { id: input.space.id } : {}),
    name: input.space.name,
    category,
    primary_purpose: primaryPurpose,
    address: input.space.address,
    latitude: input.space.latitude,
    longitude: input.space.longitude,
    description: input.space.description,
    website: input.space.website,
    phone: input.space.phone,
    hours: input.space.hours,
    ...secretFields,
    updated_at: timestamp,
  };

  const { data: spaceRow, error: spaceError } = await supabase
    .from('spaces')
    .upsert(spacePayload)
    .select()
    .single();

  if (spaceError) throw spaceError;

  const { data: ratingRow, error: ratingError } = await supabase.from('ratings').insert({
    user_id: userId,
    space_id: spaceRow.id,
    category,
    primary_purpose: primaryPurpose,
    attribute_scores: attributeScores,
    overall_score: overallScore,
    review_text: input.rating.review_text,
  }).select('id, created_at').single();

  if (ratingError) throw ratingError;

  if (!spaceRow.is_secret) {
    await saveRemoteEventRows([
      ...buildEventRows(extractEvents(input.rating.review_text, ratingRow.created_at), {
        source_type: 'rating',
        source_id: String(ratingRow.id),
        space_id: spaceRow.id,
        source_user_id: userId,
        source_created_at: ratingRow.created_at,
      }),
      ...buildEventRows(extractEvents(spaceEventText(spaceRow), spaceRow.updated_at), {
        source_type: 'space',
        source_id: spaceRow.id,
        space_id: spaceRow.id,
        source_created_at: spaceRow.updated_at,
      }),
    ]);
  }
  eventCache.clear();

  const { data: spaceRatings, error: spaceRatingsError } = await supabase
    .from('ratings')
    .select('attribute_scores')
    .eq('space_id', spaceRow.id);

  if (spaceRatingsError) throw spaceRatingsError;

  const aggregate = aggregateAttributes(
    spaceRow.id,
    category,
    primaryPurpose,
    (spaceRatings || []) as { attribute_scores: AttributeScores }[]
  );

  const { error: attributeError } = await supabase
    .from('space_attributes')
    .upsert(
      {
        space_id: spaceRow.id,
        category,
        primary_purpose: primaryPurpose,
        attribute_scores: aggregate.attribute_scores,
        overall_score: aggregate.overall_score,
        total_ratings: aggregate.total_ratings,
        updated_at: timestamp,
      },
      { onConflict: 'space_id' }
    );

  if (attributeError) throw attributeError;

  const { data: existingRanking, error: rankingLookupError } = await supabase
    .from('user_rankings')
    .select('id')
    .eq('user_id', userId)
    .eq('space_id', spaceRow.id)
    .maybeSingle();

  if (rankingLookupError) throw rankingLookupError;

  if (!existingRanking) {
    const { error: rankingError } = await supabase.from('user_rankings').insert({
      user_id: userId,
      space_id: spaceRow.id,
      personal_rank: 999,
      is_favorite: false,
      last_visited: timestamp,
    });

    if (rankingError) throw rankingError;
  }
}

export async function getProfile(userId: string): Promise<ProfileWithStats> {
  if (!canUseUserScopedRemote(userId)) {
    return getDemoProfile(userId);
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
  if (error) return getDemoProfile(userId);

  const [
    { count: spacesRated },
    { count: reviewsWritten },
    { count: followers },
    { count: following },
  ] = await Promise.all([
    supabase.from('ratings').select('space_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('ratings').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('review_text', 'is', null),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);

  return {
    ...mapProfileRow(data as unknown as Record<string, unknown>),
    stats: {
      spaces_rated: spacesRated || 0,
      reviews_written: reviewsWritten || 0,
      helpful_votes: 0,
      rank_in_area: 0,
      followers: followers || 0,
      following: Math.max(following || 0, localState.following.size),
    },
  };
}

export async function updateProfile(userId: string, update: Partial<Profile>): Promise<ProfileWithStats> {
  if (!canUseUserScopedRemote(userId)) {
    const index = localState.profiles.findIndex((profile) => profile.user_id === userId);
    if (index >= 0) {
      localState.profiles[index] = { ...localState.profiles[index], ...update, updated_at: toIso() };
    } else {
      localState.profiles.push({
        ...demoProfile,
        id: createId('profile'),
        user_id: userId,
        ...update,
        created_at: toIso(),
        updated_at: toIso(),
      });
    }
    return getProfile(userId);
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        username: update.username,
        full_name: update.full_name,
        avatar_url: update.avatar_url,
        bio: update.bio,
        location: update.location,
        vibe_title: update.vibe_title,
        updated_at: toIso(),
      },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
  return getProfile(userId);
}

export async function setVibeTitle(userId: string, vibeTitle: string): Promise<ProfileWithStats> {
  return updateProfile(userId, { vibe_title: vibeTitle });
}

export async function listUserRatingHistory(userId: string): Promise<RatingHistoryEntry[]> {
  const localHistory: RatingHistoryEntry[] = [
    ...localState.feed
      .filter((activity) => activity.user_id === userId)
      .map((activity) => ({
        category: activity.category,
        primary_purpose: activity.primary_purpose,
        created_at: activity.created_at,
      })),
    ...localState.rankings
      .filter((ranking) => ranking.user_id === userId)
      .map((ranking) => ({
        category: ranking.space.category,
        primary_purpose: ranking.space.primary_purpose,
        created_at: ranking.last_visited || ranking.created_at,
      })),
  ];

  if (!canUseUserScopedRemote(userId)) {
    return localHistory;
  }

  const { data, error } = await supabase
    .from('ratings')
    .select('category, primary_purpose, created_at')
    .eq('user_id', userId);

  if (error) return localHistory;

  return ((data || []) as Record<string, unknown>[]).map((row) => ({
    category: row.category as SpaceCategory,
    primary_purpose: (row.primary_purpose as CategoryPurpose | null) || undefined,
    created_at: String(row.created_at),
  }));
}

export async function listUserRankings(userId: string): Promise<RankingWithSpace[]> {
  if (!canUseUserScopedRemote(userId)) {
    return localState.rankings.filter((ranking) => ranking.user_id === userId);
  }

  const { data, error } = await supabase
    .from('user_rankings')
    .select('*, spaces(*, space_attributes(*))')
    .eq('user_id', userId)
    .order('personal_rank', { ascending: true });

  if (error) return localState.rankings.filter((ranking) => ranking.user_id === demoCurrentUserId);

  return ((data || []) as Record<string, unknown>[])
    .filter((rawRow) => Boolean(rawRow.spaces))
    .map((rawRow) => ({
      id: String(rawRow.id),
      user_id: String(rawRow.user_id),
      space_id: String(rawRow.space_id),
      personal_rank: Number(rawRow.personal_rank),
      notes: (rawRow.notes as string | null) || undefined,
      is_favorite: Boolean(rawRow.is_favorite),
      last_visited: (rawRow.last_visited as string | null) || undefined,
      created_at: String(rawRow.created_at),
      updated_at: String(rawRow.updated_at),
      space: mapSpaceWithAttributesRow(rawRow.spaces as Record<string, unknown>),
    }));
}

export async function toggleFavorite(userId: string, space: SpaceWithAttributes): Promise<void> {
  if (!canUseUserScopedRemote(userId)) {
    const existing = localState.rankings.find((ranking) => ranking.user_id === userId && ranking.space_id === space.id);
    if (existing) {
      existing.is_favorite = !existing.is_favorite;
      existing.updated_at = toIso();
    } else {
      localState.rankings.push({
        id: createId('ranking'),
        user_id: userId,
        space_id: space.id,
        personal_rank: localState.rankings.length + 1,
        is_favorite: true,
        created_at: toIso(),
        updated_at: toIso(),
        space,
      });
    }
    return;
  }

  const { data: existing } = await supabase
    .from('user_rankings')
    .select('*')
    .eq('user_id', userId)
    .eq('space_id', space.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_rankings')
      .update({ is_favorite: !existing.is_favorite, updated_at: toIso() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('user_rankings').insert({
      user_id: userId,
      space_id: space.id,
      personal_rank: 999,
      is_favorite: true,
    });
    if (error) throw error;
  }
}

export async function toggleLike(userId: string, ratingId: string): Promise<void> {
  if (!canUseUserScopedRemote(userId)) {
    const activity = localState.feed.find((item) => item.id === ratingId);
    if (!activity) return;
    activity.current_user_liked = !activity.current_user_liked;
    activity.likes_count = Math.max(0, (activity.likes_count || 0) + (activity.current_user_liked ? 1 : -1));
    return;
  }

  const { data: existing } = await supabase
    .from('rating_likes')
    .select('*')
    .eq('user_id', userId)
    .eq('rating_id', ratingId)
    .maybeSingle();

  const result = existing
    ? await supabase.from('rating_likes').delete().eq('user_id', userId).eq('rating_id', ratingId)
    : await supabase.from('rating_likes').insert({ user_id: userId, rating_id: ratingId });

  if (result.error) throw result.error;
}

export async function addComment(userId: string, ratingId: string, body: string): Promise<void> {
  const trimmedBody = body.trim();
  if (!trimmedBody) return;

  if (!canUseUserScopedRemote(userId)) {
    localState.comments.unshift({
      id: createId('comment'),
      rating_id: ratingId,
      user_id: userId,
      body: trimmedBody,
      created_at: toIso(),
      profile: findLocalProfile(userId) || demoProfiles[0],
    });
    return;
  }

  const { error } = await supabase.from('review_comments').insert({
    rating_id: ratingId,
    user_id: userId,
    body: trimmedBody,
  });

  if (error) throw error;
}

export async function listComments(ratingId: string): Promise<ReviewComment[]> {
  if (!isSupabaseConfigured || !supabase) {
    return byCreatedAtDesc(localState.comments.filter((comment) => comment.rating_id === ratingId));
  }

  const { data, error } = await supabase
    .from('review_comments')
    .select('*')
    .eq('rating_id', ratingId)
    .order('created_at', { ascending: false });

  if (error) return byCreatedAtDesc(localState.comments.filter((comment) => comment.rating_id === ratingId));

  const profilesByUserId = await fetchProfilesByUserId((data || []).map((row: unknown) => String((row as Record<string, unknown>).user_id)));

  return (data || []).map((row: unknown) => {
    const rawRow = row as unknown as Record<string, unknown>;
    return {
      id: String(rawRow.id),
      rating_id: String(rawRow.rating_id),
      user_id: String(rawRow.user_id),
      body: String(rawRow.body),
      created_at: String(rawRow.created_at),
      profile: profilesByUserId[String(rawRow.user_id)],
    };
  });
}

export async function toggleFollow(_currentUserId: string, targetUserId: string): Promise<boolean> {
  if (!canUseUserScopedRemote(_currentUserId) || !isUuid(targetUserId)) {
    if (localState.following.has(targetUserId)) {
      localState.following.delete(targetUserId);
      return false;
    }

    localState.following.add(targetUserId);
    return true;
  }

  const { data: existing } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', _currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle();

  const result = existing
    ? await supabase.from('follows').delete().eq('follower_id', _currentUserId).eq('following_id', targetUserId)
    : await supabase.from('follows').insert({ follower_id: _currentUserId, following_id: targetUserId });

  if (result.error) throw result.error;
  return !existing;
}

function listDemoSocialProfiles(type: 'followers' | 'following', currentUserId: string): Profile[] {
  const profiles = localState.profiles
      .filter((profile) => profile.user_id !== demoCurrentUserId)
      .map((profile) => ({ ...profile, is_following: localState.following.has(profile.user_id) }));

  if (type === 'following') {
    return profiles.filter((profile) => localState.following.has(profile.user_id));
  }

  return profiles.filter((profile) => profile.user_id !== currentUserId);
}

export async function listSocialProfiles(type: 'followers' | 'following', currentUserId: string): Promise<Profile[]> {
  if (!canUseUserScopedRemote(currentUserId)) {
    return listDemoSocialProfiles(type, currentUserId);
  }

  const relationColumn = type === 'following' ? 'follower_id' : 'following_id';
  const selectedColumn = type === 'following' ? 'following_id' : 'follower_id';

  const { data, error } = await supabase
    .from('follows')
    .select(selectedColumn)
    .eq(relationColumn, currentUserId);

  if (error) {
    return listDemoSocialProfiles(type, currentUserId);
  }

  const userIds = ((data || []) as Record<string, unknown>[])
    .map((row: Record<string, unknown>) => String(row[selectedColumn]))
    .filter(isUuid);

  if (userIds.length === 0) {
    return listDemoSocialProfiles(type, currentUserId);
  }

  const profilesByUserId = await fetchProfilesByUserId(userIds);
  const currentFollowing = await fetchFollowingIds(currentUserId);
  const remoteProfiles = (userIds as string[])
    .map((followedUserId: string) => profilesByUserId[followedUserId])
    .filter((profile: Profile | undefined): profile is Profile => Boolean(profile))
    .map((profile: Profile) => ({
      ...profile,
      is_following: currentFollowing.has(profile.user_id),
    }));

  if (type === 'following') {
    const localProfiles = listDemoSocialProfiles(type, currentUserId);
    const seen = new Set(remoteProfiles.map((profile) => profile.user_id));
    return [
      ...remoteProfiles,
      ...localProfiles.filter((profile) => !seen.has(profile.user_id)),
    ];
  }

  return remoteProfiles;
}

async function fetchFollowingIds(currentUserId: string): Promise<Set<string>> {
  if (!canUseUserScopedRemote(currentUserId)) {
    return new Set(localState.following);
  }

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId);

  if (error) {
    return new Set(localState.following);
  }

  return new Set((data || []).map((row: Record<string, unknown>) => String(row.following_id)));
}

const unknownOwner = (userId: string): Profile => ({
  id: `profile-${userId}`,
  user_id: userId,
  username: 'gatekeeper',
  full_name: 'A local',
  created_at: toIso(),
  updated_at: toIso(),
});

function getLocalSecretAccess(space: SpaceWithAttributes, viewerId: string): SecretAccessStatus {
  if (space.created_by === viewerId) return 'owner';
  if (localState.secretAccess.has(secretAccessKey(viewerId, space.id))) return 'unlocked';
  const hasPendingRequest = localState.secretRequests.some((request) =>
    request.space_id === space.id && request.requester_id === viewerId && request.status === 'pending'
  );
  return hasPendingRequest ? 'pending' : 'locked';
}

function toSecretPreview(space: SpaceWithAttributes, access: SecretAccessStatus, owner: Profile): SecretSpotPreview {
  const isVisible = access === 'owner' || access === 'unlocked';

  return {
    id: space.id,
    category: space.category,
    primary_purpose: space.primary_purpose,
    area_hint: space.area_hint,
    approx_latitude: isVisible ? space.latitude : coarsenCoordinate(space.latitude),
    approx_longitude: isVisible ? space.longitude : coarsenCoordinate(space.longitude),
    owner,
    overall_score: space.attributes?.overall_score,
    access,
    space: isVisible ? space : undefined,
    created_at: space.created_at,
  };
}

function listLocalSecretSpots(viewerId: string): SecretSpotPreview[] {
  return localState.spaces
    .filter((space) => space.is_secret)
    .map((space) => toSecretPreview(
      space,
      getLocalSecretAccess(space, viewerId),
      findLocalProfile(space.created_by) || unknownOwner(space.created_by || 'unknown')
    ));
}

export async function listSecretSpots(viewerId: string): Promise<SecretSpotPreview[]> {
  const localSpots = listLocalSecretSpots(viewerId);
  if (!canUseUserScopedRemote(viewerId)) return localSpots;

  const { data, error } = await supabase.rpc('list_secret_spots');
  if (error) return localSpots;

  const rows = (data || []) as Record<string, unknown>[];
  const ownersById = await fetchProfilesByUserId(rows.map((row) => String(row.owner_id)));
  const visibleIds = rows
    .filter((row) => row.access === 'owner' || row.access === 'unlocked')
    .map((row) => String(row.id));

  const visibleSpaces: Record<string, SpaceWithAttributes> = {};
  if (visibleIds.length > 0) {
    const { data: spaceRows } = await supabase.from('spaces').select('*, space_attributes(*)').in('id', visibleIds);
    ((spaceRows || []) as Record<string, unknown>[]).forEach((row) => {
      const space = mapSpaceWithAttributesRow(row);
      visibleSpaces[space.id] = space;
    });
  }

  const remoteSpots = rows.map((row): SecretSpotPreview => {
    const id = String(row.id);
    const ownerId = String(row.owner_id);
    return {
      id,
      category: row.category as SpaceCategory,
      primary_purpose: (row.primary_purpose as CategoryPurpose | null) || undefined,
      area_hint: (row.area_hint as string | null) || undefined,
      approx_latitude: Number(row.approx_latitude),
      approx_longitude: Number(row.approx_longitude),
      owner: ownersById[ownerId] || unknownOwner(ownerId),
      overall_score: row.overall_score === null || row.overall_score === undefined ? undefined : Number(row.overall_score),
      access: row.access as SecretAccessStatus,
      space: visibleSpaces[id],
      created_at: String(row.created_at),
    };
  });

  return [...remoteSpots, ...localSpots];
}

export async function requestSecretSpot(
  viewerId: string,
  spot: SecretSpotPreview,
  options: { kind: SecretRequestKind; offeredSpaceId?: string; message?: string }
): Promise<SecretAccessStatus> {
  if (options.kind === 'trade' && !options.offeredSpaceId) {
    throw new Error('Pick one of your secret spots to trade.');
  }

  if (!canUseUserScopedRemote(viewerId) || !isUuid(spot.id)) {
    const existing = localState.secretRequests.find((request) =>
      request.space_id === spot.id && request.requester_id === viewerId && request.status === 'pending'
    );
    if (existing && options.kind === 'request') return 'pending';

    const request: SecretSpotRequest = {
      id: createId('secret-request'),
      space_id: spot.id,
      requester_id: viewerId,
      owner_id: spot.owner.user_id,
      kind: options.kind,
      offered_space_id: options.offeredSpaceId,
      message: options.message?.trim() || undefined,
      status: 'pending',
      created_at: toIso(),
    };

    // Demo owners can't respond, so trades settle immediately to keep the flow explorable.
    if (options.kind === 'trade') {
      request.status = 'accepted';
      localState.secretAccess.add(secretAccessKey(viewerId, spot.id));
      localState.secretAccess.add(secretAccessKey(spot.owner.user_id, options.offeredSpaceId!));
      localState.secretRequests.push(request);
      return 'unlocked';
    }

    localState.secretRequests.push(request);
    return 'pending';
  }

  const { data, error } = await supabase.rpc('request_secret_spot', {
    target_space: spot.id,
    offered_space: options.offeredSpaceId ?? null,
    note: options.message?.trim() || null,
  });

  if (error) throw error;
  return (data as SecretAccessStatus | null) || 'pending';
}

export async function listIncomingSecretRequests(ownerId: string): Promise<SecretSpotRequest[]> {
  const enrichLocal = (request: SecretSpotRequest): SecretSpotRequest => ({
    ...request,
    requester: request.requester || findLocalProfile(request.requester_id),
    space_name: request.space_name || localState.spaces.find((space) => space.id === request.space_id)?.name,
    offered_space_category: request.offered_space_category ||
      localState.spaces.find((space) => space.id === request.offered_space_id)?.category,
  });

  const localRequests = byCreatedAtDesc(
    localState.secretRequests.filter((request) => request.owner_id === ownerId && request.status === 'pending')
  ).map(enrichLocal);

  if (!canUseUserScopedRemote(ownerId)) return localRequests;

  const { data, error } = await supabase
    .from('secret_spot_requests')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return localRequests;

  const rows = (data || []) as Record<string, unknown>[];
  const requesters = await fetchProfilesByUserId(rows.map((row) => String(row.requester_id)));
  const spaceIds = rows.map((row) => String(row.space_id));
  const spaceNames: Record<string, string> = {};
  if (spaceIds.length > 0) {
    const { data: spaceRows } = await supabase.from('spaces').select('id, name').in('id', spaceIds);
    ((spaceRows || []) as Record<string, unknown>[]).forEach((row) => {
      spaceNames[String(row.id)] = String(row.name);
    });
  }

  const remoteRequests = rows.map((row): SecretSpotRequest => ({
    id: String(row.id),
    space_id: String(row.space_id),
    requester_id: String(row.requester_id),
    owner_id: String(row.owner_id),
    kind: row.kind as SecretRequestKind,
    offered_space_id: (row.offered_space_id as string | null) || undefined,
    message: (row.message as string | null) || undefined,
    status: row.status as SecretSpotRequest['status'],
    created_at: String(row.created_at),
    requester: requesters[String(row.requester_id)],
    space_name: spaceNames[String(row.space_id)],
  }));

  return [...remoteRequests, ...localRequests];
}

export async function respondToSecretRequest(
  ownerId: string,
  request: SecretSpotRequest,
  accept: boolean
): Promise<void> {
  if (!canUseUserScopedRemote(ownerId) || !isUuid(request.id)) {
    const stored = localState.secretRequests.find((item) => item.id === request.id);
    if (!stored || stored.owner_id !== ownerId || stored.status !== 'pending') return;

    stored.status = accept ? 'accepted' : 'declined';
    if (accept) {
      localState.secretAccess.add(secretAccessKey(stored.requester_id, stored.space_id));
      if (stored.kind === 'trade' && stored.offered_space_id) {
        localState.secretAccess.add(secretAccessKey(ownerId, stored.offered_space_id));
      }
    }
    return;
  }

  const { error } = await supabase.rpc('respond_secret_request', { request_id: request.id, accept });
  if (error) throw error;
}

type EventQuery = {
  monthStart: Date;
  center: { latitude: number; longitude: number };
  radiusMiles: number;
  force?: boolean;
};

const MILES_PER_DEGREE_LATITUDE = 69;

const spaceEventText = (space: { description?: string | null; hours?: string | null }) =>
  [space.description, space.hours].filter(Boolean).join('. ');

const rowToSpaceEvent = (
  row: Omit<EventRow, 'dedupe_key'> & { id?: string; created_at?: string },
  space: SpaceWithAttributes,
  profile?: Profile
): SpaceEvent => ({
  id: row.id || `event-${row.source_type}-${row.source_id}-${row.kind}-${row.title}-${row.event_date ?? row.weekday}`,
  space_id: row.space_id,
  source_type: row.source_type,
  source_id: row.source_id,
  source_user_id: row.source_user_id || undefined,
  title: row.title,
  kind: row.kind,
  event_date: row.event_date || undefined,
  weekday: row.weekday ?? undefined,
  start_time: row.start_time || undefined,
  link_url: row.link_url || undefined,
  snippet: row.snippet,
  source_created_at: row.source_created_at,
  created_at: row.created_at || row.source_created_at,
  space,
  profile,
});

function extractSpaceEvents(
  text: string | undefined,
  source: EventSource,
  space: SpaceWithAttributes,
  profile?: Profile
): SpaceEvent[] {
  if (space.is_secret) return [];
  return buildEventRows(extractEvents(text, source.source_created_at), source).map((row) => rowToSpaceEvent(row, space, profile));
}

function getLocalEvents(): SpaceEvent[] {
  if (!localState.events) {
    localState.events = [
      ...localState.feed.flatMap((activity) => extractSpaceEvents(activity.review_text, {
        source_type: 'rating',
        source_id: activity.id,
        space_id: activity.space_id,
        source_user_id: activity.user_id,
        source_created_at: activity.created_at,
      }, activity.space, findLocalProfile(activity.user_id) || activity.profile)),
      ...localState.spaces.flatMap((space) => extractSpaceEvents(spaceEventText(space), {
        source_type: 'space',
        source_id: space.id,
        space_id: space.id,
        source_created_at: space.updated_at,
      }, space)),
    ];
  }
  return localState.events;
}

async function saveRemoteEventRows(rows: EventRow[]): Promise<void> {
  if (rows.length === 0 || !supabase) return;
  const { error } = await supabase
    .from('space_events')
    .upsert(rows, { onConflict: 'source_type,source_id,dedupe_key', ignoreDuplicates: true });
  if (error) console.warn('Could not save extracted events:', error.message);
}

async function fetchRemoteEvents(query: EventQuery): Promise<SpaceEvent[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { start, end, startKey, endKey } = getMonthRange(query.monthStart);
  const latitudeDelta = query.radiusMiles / MILES_PER_DEGREE_LATITUDE;
  const longitudeDelta = query.radiusMiles /
    (MILES_PER_DEGREE_LATITUDE * Math.max(0.1, Math.cos(query.center.latitude * (Math.PI / 180))));
  const weeklyFrom = toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - WEEKLY_LIFETIME_DAYS));
  const weeklyTo = toDateKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() + WEEKLY_LOOKBACK_DAYS + 1));

  const { data, error } = await supabase
    .from('space_events')
    .select('*, spaces!inner(*)')
    .gte('spaces.latitude', query.center.latitude - latitudeDelta)
    .lte('spaces.latitude', query.center.latitude + latitudeDelta)
    .gte('spaces.longitude', query.center.longitude - longitudeDelta)
    .lte('spaces.longitude', query.center.longitude + longitudeDelta)
    .or(
      `and(kind.eq.one_time,event_date.gte.${startKey},event_date.lte.${endKey}),` +
      `and(kind.eq.weekly,source_created_at.gte.${weeklyFrom},source_created_at.lte.${weeklyTo})`
    )
    .limit(500);

  if (error) {
    console.warn('Falling back to demo events after Supabase error:', error.message);
    return null;
  }

  const rows = (data || []) as Record<string, unknown>[];
  const profilesByUserId = await fetchProfilesByUserId(
    Array.from(new Set(rows.map((row) => row.source_user_id).filter(Boolean).map(String)))
  );

  return rows.map((row) => rowToSpaceEvent({
    id: String(row.id),
    space_id: String(row.space_id),
    source_type: row.source_type as EventSourceType,
    source_id: String(row.source_id),
    source_user_id: (row.source_user_id as string | null) || undefined,
    title: String(row.title),
    kind: row.kind as EventKind,
    event_date: (row.event_date as string | null) ?? null,
    weekday: row.weekday === null || row.weekday === undefined ? null : Number(row.weekday),
    start_time: (row.start_time as string | null) ?? null,
    link_url: (row.link_url as string | null) ?? null,
    snippet: String(row.snippet),
    source_created_at: String(row.source_created_at),
    created_at: String(row.created_at),
  }, mapSpaceRow(row.spaces as Record<string, unknown>), profilesByUserId[String(row.source_user_id)]));
}

function buildOccurrences(events: SpaceEvent[], query: EventQuery): CalendarOccurrence[] {
  const byKey = new Map<string, CalendarOccurrence>();

  events.forEach((event) => {
    if (event.space.is_secret) return;
    const distance = calculateDistanceMiles(query.center, event.space);
    if (distance > query.radiusMiles) return;

    expandEventDates(event, query.monthStart).forEach((date) => {
      const key = `${event.space_id}|${event.title}|${date}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { key, date, event, distance, mention_count: 1 });
        return;
      }

      existing.mention_count += 1;
      const isRicher = Number(Boolean(event.link_url)) + Number(Boolean(event.start_time)) >
        Number(Boolean(existing.event.link_url)) + Number(Boolean(existing.event.start_time));
      if (isRicher) existing.event = event;
    });
  });

  return Array.from(byKey.values()).sort((first, second) =>
    first.date.localeCompare(second.date) ||
    (first.event.start_time || '99:99').localeCompare(second.event.start_time || '99:99') ||
    (first.distance || 0) - (second.distance || 0)
  );
}

export async function listEventsNearby(query: EventQuery): Promise<CalendarOccurrence[]> {
  const cacheKey = [
    getMonthRange(query.monthStart).startKey,
    query.center.latitude.toFixed(3),
    query.center.longitude.toFixed(3),
    query.radiusMiles,
  ].join('|');

  const cached = eventCache.get(cacheKey);
  if (cached && !query.force) return cached;

  const localEvents = getLocalEvents();
  const remoteEvents = await fetchRemoteEvents(query);
  const remoteIds = new Set((remoteEvents || []).map((event) => event.id));
  const events = remoteEvents
    ? [...remoteEvents, ...localEvents.filter((event) => !remoteIds.has(event.id))]
    : localEvents;

  const occurrences = buildOccurrences(events, query);
  eventCache.set(cacheKey, occurrences);
  return occurrences;
}
