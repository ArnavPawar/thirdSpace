import {
  calculateDistanceMiles,
  calculateOverallScore,
  normalizePurposeForCategory,
  sanitizeAttributeScores,
  type AttributeScores,
  type CategoryPurpose,
  type FeedActivity,
  type Profile,
  type ProfileWithStats,
  type RatingFormData,
  type ReviewComment,
  type SpaceCategory,
  type SpaceDetails,
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
  demoSpaces,
} from './fixtures';
import { isSupabaseConfigured, supabase } from './supabase';

type RankingWithSpace = UserRanking & { space: SpaceWithAttributes };
type SpaceFilters = {
  query?: string;
  category?: SpaceCategory | 'All Categories';
  purpose?: CategoryPurpose | 'All Purposes';
  userLocation?: { latitude: number; longitude: number };
};
type FeedScope = 'public' | 'following';
type FeedOptions = {
  currentUserId?: string;
  scope?: FeedScope;
};

const localState = {
  spaces: [...demoSpaces],
  feed: [...demoFeed],
  comments: [...demoComments],
  rankings: [...demoRankings],
  profiles: [...demoProfiles],
  following: new Set(['user-mike', 'user-nina']),
};

const toIso = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const canUseUserScopedRemote = (userId: string) => Boolean(isSupabaseConfigured && supabase && isUuid(userId));

const byCreatedAtDesc = <T extends { created_at: string }>(items: T[]) =>
  [...items].sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());

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
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const getDemoProfile = (userId: string): ProfileWithStats => ({
  ...(demoProfile.user_id === userId ? demoProfile : { ...demoProfile, user_id: userId }),
  stats: {
    ...demoProfile.stats,
    followers: localState.profiles.filter((profile) => profile.user_id !== userId).length,
    following: localState.following.size,
  },
});

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

export async function listSpaces(filters: SpaceFilters = {}): Promise<SpaceWithAttributes[]> {
  if (!isSupabaseConfigured || !supabase) {
    return applySpaceFilters(localState.spaces, filters);
  }

  const { data, error } = await supabase
    .from('spaces')
    .select('*, space_attributes(*)')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Falling back to demo spaces after Supabase error:', error.message);
    return applySpaceFilters(localState.spaces, filters);
  }

  const spaces = (data || []).map((row: unknown) => mapSpaceWithAttributesRow(row as Record<string, unknown>));

  return applySpaceFilters(spaces, filters);
}

export async function getSpaceDetails(spaceId: string): Promise<SpaceDetails | null> {
  const spaces = await listSpaces();
  const space = spaces.find((item) => item.id === spaceId);
  if (!space) return null;

  const reviews = (await listRecentActivity()).filter((activity) => activity.space_id === spaceId);
  const comments = localState.comments.filter((comment) => reviews.some((review) => review.id === comment.rating_id));

  return { ...space, reviews, comments };
}

export async function listRecentActivity(options: FeedOptions = {}): Promise<FeedActivity[]> {
  const scope = options.scope || 'public';
  const currentUserId = options.currentUserId;

  if (!isSupabaseConfigured || !supabase) {
    return filterFeedByScope(listRecentActivityFromDemo(), scope);
  }

  const { data, error } = await supabase
    .from('ratings')
    .select('*, spaces(*)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('Falling back to demo feed after Supabase error:', error.message);
    return filterFeedByScope(listRecentActivityFromDemo(), scope);
  }

  const profileIds = Array.from(
    new Set((data || []).map((row: unknown) => String((row as Record<string, unknown>).user_id)))
  ) as string[];
  const profilesByUserId = await fetchProfilesByUserId(profileIds);
  const followingIds = currentUserId ? await fetchFollowingIds(currentUserId) : new Set<string>();

  const remoteFeed = (data || []).map((row: unknown) => {
    const rawRow = row as unknown as Record<string, unknown>;
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

  const demoFeed = listRecentActivityFromDemo();
  const mergedFeed = mergeFeedActivity(remoteFeed, demoFeed);

  return filterFeedByScope(mergedFeed, scope);
}

function listRecentActivityFromDemo(): FeedActivity[] {
  return byCreatedAtDesc(localState.feed).map((activity) => ({
    ...activity,
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

  if (!canUseUserScopedRemote(userId)) {
    const existingSpace = localState.spaces.find((space) =>
      space.id === input.space.id ||
      (space.name.toLowerCase() === input.space.name.toLowerCase() &&
        Math.abs(space.latitude - input.space.latitude) < 0.0005 &&
        Math.abs(space.longitude - input.space.longitude) < 0.0005)
    );
    const space = existingSpace || {
      id: input.space.id || createId('space'),
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
      created_at: timestamp,
      updated_at: timestamp,
      favorites_count: 0,
    };

    if (!existingSpace) {
      localState.spaces.unshift(space);
    }

    const rating = {
      id: createId('rating'),
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
      profile: localState.profiles.find((profile) => profile.user_id === userId) || demoProfiles[0],
    };

    localState.feed.unshift(rating);
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
    updated_at: timestamp,
  };

  const { data: spaceRow, error: spaceError } = await supabase
    .from('spaces')
    .upsert(spacePayload)
    .select()
    .single();

  if (spaceError) throw spaceError;

  const { error: ratingError } = await supabase.from('ratings').insert({
    user_id: userId,
    space_id: spaceRow.id,
    category,
    primary_purpose: primaryPurpose,
    attribute_scores: attributeScores,
    overall_score: overallScore,
    review_text: input.rating.review_text,
  });

  if (ratingError) throw ratingError;

  const { error: attributeError } = await supabase
    .from('space_attributes')
    .upsert(
      {
        space_id: spaceRow.id,
        category,
        primary_purpose: primaryPurpose,
        attribute_scores: attributeScores,
        overall_score: overallScore,
        total_ratings: 1,
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
    supabase.from('ratings').select('id', { count: 'exact', head: true }).eq('user_id', userId),
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
        id: createId('profile'),
        user_id: userId,
        username: update.username,
        full_name: update.full_name,
        avatar_url: update.avatar_url,
        bio: update.bio,
        location: update.location,
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
        updated_at: toIso(),
      },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
  return getProfile(userId);
}

export async function listUserRankings(userId: string): Promise<RankingWithSpace[]> {
  if (!canUseUserScopedRemote(userId)) {
    return localState.rankings.filter((ranking) => ranking.user_id === userId);
  }

  const { data, error } = await supabase
    .from('user_rankings')
    .select('*, spaces(*)')
    .eq('user_id', userId)
    .order('personal_rank', { ascending: true });

  if (error) return localState.rankings.filter((ranking) => ranking.user_id === demoCurrentUserId);

  return (data || []).map((row: unknown) => {
    const rawRow = row as unknown as Record<string, unknown>;
    return {
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
    };
  });
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
      profile: localState.profiles.find((profile) => profile.user_id === userId) || demoProfiles[0],
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
