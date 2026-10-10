import {
  calculateDistanceMiles,
  calculateOverallScore,
  CATEGORY_CONFIG,
  normalizePurposeForCategory,
  sanitizeAttributeScores,
  type AttributeScores,
  type CalendarOccurrence,
  type CategoryPurpose,
  type CreateHostedEventInput,
  type EventKind,
  type EventSourceType,
  type EventTheme,
  type EventMessage,
  type EventVisibility,
  type FeedActivity,
  MAX_EVENT_MESSAGE_LENGTH,
  type LocalPhoto,
  type Profile,
  type ProfileWithStats,
  type RatingHistoryEntry,
  type RsvpStatus,
  type ReviewComment,
  type ReviewPhoto,
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
  demoPhotos,
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
  getEventPhase,
  getMonthRange,
  isChatOpen,
  nextOccurrenceDate,
  resolveOccurrenceDate,
  toDateKey,
  WEEKLY_LIFETIME_DAYS,
  WEEKLY_LOOKBACK_DAYS,
  type EventRow,
  type EventSource,
} from './events';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
type PresenceRow = { event_id: string; occurrence_date: string; user_id: string; created_at: string };
type RsvpRow = PresenceRow & { status: RsvpStatus };
type FeedOptions = {
  currentUserId?: string;
  scope?: FeedScope;
  authorId?: string;
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
  hostedEvents: null as SpaceEvent[] | null,
  rsvps: [] as RsvpRow[],
  checkins: [] as PresenceRow[],
  messages: [] as EventMessage[],
  photos: [...demoPhotos],
};

const PHOTO_BUCKET = 'review-photos';
const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.7;

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
  const favoritesPromise = fetchFavoriteStates(viewerId);

  if (!isSupabaseConfigured || !supabase) {
    return applyFavoriteStates(applySpaceFilters(listVisibleLocalSpaces(viewerId), filters), await favoritesPromise);
  }

  const { data, error } = await supabase
    .from('spaces')
    .select('*, space_attributes(*)')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Falling back to demo spaces after Supabase error:', error.message);
    return applyFavoriteStates(applySpaceFilters(listVisibleLocalSpaces(viewerId), filters), await favoritesPromise);
  }

  const spaces = (data || []).map((row: unknown) => mapSpaceWithAttributesRow(row as Record<string, unknown>));

  return applyFavoriteStates(applySpaceFilters(spaces, filters), await favoritesPromise);
}

const applyFavoriteStates = (spaces: SpaceWithAttributes[], favorites: Map<string, boolean>) =>
  spaces.map((space) => favorites.has(space.id) ? { ...space, current_user_favorited: favorites.get(space.id) } : space);

async function fetchFavoriteStates(viewerId: string): Promise<Map<string, boolean>> {
  const localFavorites = new Map(localState.rankings
    .filter((ranking) => ranking.user_id === viewerId)
    .map((ranking) => [ranking.space_id, ranking.is_favorite]));

  if (!canUseUserScopedRemote(viewerId)) return localFavorites;

  const { data, error } = await supabase
    .from('user_rankings')
    .select('space_id, is_favorite')
    .eq('user_id', viewerId);
  if (error) return localFavorites;

  return new Map(((data || []) as Record<string, unknown>[]).map((row) => [String(row.space_id), Boolean(row.is_favorite)]));
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
  const { authorId } = options;
  const filterFeed = (feed: FeedActivity[]) =>
    filterFeedByScope(authorId ? feed.filter((activity) => activity.user_id === authorId) : feed, scope);

  if (!isSupabaseConfigured || !supabase) {
    return filterFeed(listRecentActivityFromDemo(currentUserId));
  }

  let query = supabase
    .from('ratings')
    .select('*, spaces(*)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (authorId && isUuid(authorId)) query = query.eq('user_id', authorId);

  const { data, error } = await query;

  if (error) {
    console.warn('Falling back to demo feed after Supabase error:', error.message);
    return filterFeed(listRecentActivityFromDemo(currentUserId));
  }

  const visibleRows = ((data || []) as Record<string, unknown>[]).filter((row) => Boolean(row.spaces));
  const profileIds = Array.from(new Set(visibleRows.map((row) => String(row.user_id))));
  const profilesByUserId = await fetchProfilesByUserId(profileIds);
  const followingIds = await fetchFollowingIds(currentUserId);
  const photosByRatingId = groupPhotosBy(
    await fetchRemotePhotos('rating_id', visibleRows.map((row) => String(row.id))),
    'rating_id'
  );

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
      photos: photosByRatingId[String(rawRow.id)] || [],
    };
  });

  return filterFeed(mergeFeedActivity(remoteFeed, listRecentActivityFromDemo(currentUserId)));
}

function listRecentActivityFromDemo(viewerId: string): FeedActivity[] {
  return byCreatedAtDesc(localState.feed)
    .filter((activity) => canViewLocalSpace(activity.space, viewerId))
    .map((activity) => ({
      ...activity,
      profile: findLocalProfile(activity.user_id) || activity.profile,
      is_following: localState.following.has(activity.user_id),
      comments_count: localState.comments.filter((comment) => comment.rating_id === activity.id).length,
      photos: localState.photos.filter((photo) => photo.rating_id === activity.id),
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

// Seeded demo rows store a full external URL instead of a bucket path.
const resolvePhotoUrl = (storagePath: string) =>
  /^https?:\/\//.test(storagePath)
    ? storagePath
    : supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;

const mapPhotoRow = (row: Record<string, unknown>, profile?: Profile): ReviewPhoto => ({
  id: String(row.id),
  user_id: String(row.user_id),
  space_id: String(row.space_id),
  rating_id: (row.rating_id as string | null) || undefined,
  comment_id: (row.comment_id as string | null) || undefined,
  url: resolvePhotoUrl(String(row.storage_path)),
  width: row.width === null || row.width === undefined ? undefined : Number(row.width),
  height: row.height === null || row.height === undefined ? undefined : Number(row.height),
  created_at: String(row.created_at),
  profile,
});

const groupPhotosBy = (photos: ReviewPhoto[], key: 'rating_id' | 'comment_id') =>
  photos.reduce<Record<string, ReviewPhoto[]>>((groups, photo) => {
    const groupId = photo[key];
    if (groupId) (groups[groupId] ||= []).push(photo);
    return groups;
  }, {});

// Errors return [] so the feed still loads before review-photos.sql has been run.
async function fetchRemotePhotos(column: 'rating_id' | 'comment_id' | 'space_id', ids: string[]): Promise<ReviewPhoto[]> {
  const validIds = ids.filter(isUuid);
  if (!isSupabaseConfigured || !supabase || validIds.length === 0) return [];

  const { data, error } = await supabase
    .from('review_photos')
    .select('*')
    .in(column, validIds)
    .order('created_at', { ascending: column !== 'space_id' })
    .limit(200);

  if (error) return [];

  const rows = (data || []) as Record<string, unknown>[];
  const profilesByUserId = await fetchProfilesByUserId(Array.from(new Set(rows.map((row) => String(row.user_id)))));
  return rows.map((row) => mapPhotoRow(row, profilesByUserId[String(row.user_id)]));
}

async function preparePhoto(photo: LocalPhoto): Promise<LocalPhoto> {
  const context = ImageManipulator.manipulate(photo.uri);
  const longestEdge = Math.max(photo.width || 0, photo.height || 0);
  if (longestEdge > PHOTO_MAX_EDGE) {
    context.resize((photo.width || 0) >= (photo.height || 0) ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}

async function uploadPhoto(userId: string, photo: LocalPhoto) {
  const prepared = await preparePhoto(photo);
  const body = await (await fetch(prepared.uri)).arrayBuffer();
  const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  return { storage_path: storagePath, width: prepared.width ?? null, height: prepared.height ?? null };
}

type PhotoOwner = { userId: string; spaceId: string; ratingId?: string; commentId?: string };

/** Returns how many photos failed to save; the parent review or comment is already saved by then. */
async function attachPhotos(owner: PhotoOwner, photos: LocalPhoto[] = []): Promise<number> {
  if (photos.length === 0) return 0;

  if (!canUseUserScopedRemote(owner.userId)) {
    const timestamp = toIso();
    localState.photos.unshift(...photos.map((photo) => ({
      id: createId('photo'),
      user_id: owner.userId,
      space_id: owner.spaceId,
      rating_id: owner.ratingId,
      comment_id: owner.commentId,
      url: photo.uri,
      width: photo.width,
      height: photo.height,
      created_at: timestamp,
      profile: findLocalProfile(owner.userId) || demoProfiles[0],
    })));
    return 0;
  }

  const uploads = await Promise.allSettled(photos.map((photo) => uploadPhoto(owner.userId, photo)));
  const uploaded = uploads.flatMap((upload) => (upload.status === 'fulfilled' ? [upload.value] : []));
  uploads.forEach((upload) => {
    if (upload.status === 'rejected') console.warn('Could not upload photo:', upload.reason);
  });
  if (uploaded.length === 0) return photos.length;

  const { error } = await supabase.from('review_photos').insert(uploaded.map((photo) => ({
    ...photo,
    user_id: owner.userId,
    space_id: owner.spaceId,
    rating_id: owner.ratingId ?? null,
    comment_id: owner.commentId ?? null,
  })));

  if (error) {
    console.warn('Could not save photo rows:', error.message);
    await supabase.storage.from(PHOTO_BUCKET).remove(uploaded.map((photo) => photo.storage_path));
    return photos.length;
  }

  return photos.length - uploaded.length;
}

export async function listSpacePhotos(spaceId: string): Promise<ReviewPhoto[]> {
  const localPhotos = localState.photos.filter((photo) => photo.space_id === spaceId);
  const remotePhotos = await fetchRemotePhotos('space_id', [spaceId]);
  return byCreatedAtDesc([...remotePhotos, ...localPhotos]);
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

export async function submitRating(userId: string, input: SubmitRatingInput): Promise<{ failedPhotos: number }> {
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

    await attachPhotos({ userId, spaceId: space.id, ratingId }, input.photos);
    return { failedPhotos: 0 };
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

  const failedPhotos = await attachPhotos(
    { userId, spaceId: spaceRow.id, ratingId: String(ratingRow.id) },
    input.photos
  );

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

  return { failedPhotos };
}

async function fetchRemoteProfileWithStats(userId: string): Promise<ProfileWithStats | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
  if (error) return null;

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
      following: following || 0,
    },
  };
}

export async function getProfile(userId: string): Promise<ProfileWithStats> {
  if (!canUseUserScopedRemote(userId)) {
    return getDemoProfile(userId);
  }

  const profile = await fetchRemoteProfileWithStats(userId);
  if (!profile) return getDemoProfile(userId);

  return {
    ...profile,
    stats: { ...profile.stats, following: Math.max(profile.stats.following, localState.following.size) },
  };
}

export async function getPublicProfile(targetUserId: string, viewerId: string): Promise<ProfileWithStats | null> {
  const followingIds = await fetchFollowingIds(viewerId);
  const remoteProfile = isSupabaseConfigured && supabase && isUuid(targetUserId)
    ? await fetchRemoteProfileWithStats(targetUserId)
    : null;
  if (remoteProfile) return { ...remoteProfile, is_following: followingIds.has(targetUserId) };

  const localProfile = findLocalProfile(targetUserId);
  if (!localProfile) return null;

  const ratings = localState.feed.filter((activity) => activity.user_id === targetUserId);
  const isFollowing = followingIds.has(targetUserId);
  return {
    ...localProfile,
    is_following: isFollowing,
    stats: {
      spaces_rated: new Set(ratings.map((activity) => activity.space_id)).size,
      reviews_written: ratings.filter((activity) => activity.review_text).length,
      helpful_votes: ratings.reduce((total, activity) => total + (activity.likes_count || 0), 0),
      rank_in_area: 0,
      followers: isFollowing ? 1 : 0,
      following: 0,
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

export async function addComment(
  userId: string,
  rating: { id: string; space_id: string },
  body: string,
  photos: LocalPhoto[] = []
): Promise<{ failedPhotos: number }> {
  const trimmedBody = body.trim();
  if (!trimmedBody) return { failedPhotos: 0 };

  if (!canUseUserScopedRemote(userId)) {
    const commentId = createId('comment');
    localState.comments.unshift({
      id: commentId,
      rating_id: rating.id,
      user_id: userId,
      body: trimmedBody,
      created_at: toIso(),
      profile: findLocalProfile(userId) || demoProfiles[0],
    });
    await attachPhotos({ userId, spaceId: rating.space_id, commentId }, photos);
    return { failedPhotos: 0 };
  }

  const { data, error } = await supabase.from('review_comments').insert({
    rating_id: rating.id,
    user_id: userId,
    body: trimmedBody,
  }).select('id').single();

  if (error) throw error;

  const failedPhotos = await attachPhotos(
    { userId, spaceId: rating.space_id, commentId: String(data.id) },
    photos
  );
  return { failedPhotos };
}

export async function listComments(ratingId: string): Promise<ReviewComment[]> {
  const listLocalComments = () => byCreatedAtDesc(localState.comments.filter((comment) => comment.rating_id === ratingId))
    .map((comment) => ({ ...comment, photos: localState.photos.filter((photo) => photo.comment_id === comment.id) }));

  if (!isSupabaseConfigured || !supabase) {
    return listLocalComments();
  }

  const { data, error } = await supabase
    .from('review_comments')
    .select('*')
    .eq('rating_id', ratingId)
    .order('created_at', { ascending: false });

  if (error) return listLocalComments();

  const rows = (data || []) as Record<string, unknown>[];
  const [profilesByUserId, commentPhotos] = await Promise.all([
    fetchProfilesByUserId(rows.map((row) => String(row.user_id))),
    fetchRemotePhotos('comment_id', rows.map((row) => String(row.id))),
  ]);
  const photosByCommentId = groupPhotosBy(commentPhotos, 'comment_id');

  return rows.map((rawRow) => ({
    id: String(rawRow.id),
    rating_id: String(rawRow.rating_id),
    user_id: String(rawRow.user_id),
    body: String(rawRow.body),
    created_at: String(rawRow.created_at),
    profile: profilesByUserId[String(rawRow.user_id)],
    photos: photosByCommentId[String(rawRow.id)] || [],
  }));
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
  viewerId?: string;
  includePrivate?: boolean;
  force?: boolean;
};

const MILES_PER_DEGREE_LATITUDE = 69;

const spaceEventText = (space: { description?: string | null; hours?: string | null }) =>
  [space.description, space.hours].filter(Boolean).join('. ');

type StoredEventRow = Omit<EventRow, 'dedupe_key'> & {
  id?: string;
  created_at?: string;
  visibility?: EventVisibility | null;
  theme?: EventTheme | null;
  host_user_id?: string | null;
  invite_token?: string | null;
  description?: string | null;
  capacity?: number | null;
  allow_over_capacity?: boolean | null;
  cancelled_at?: string | null;
};

const EMPTY_PRESENCE = {
  going_count: 0,
  going: [] as Profile[],
  viewer_going: false,
  here_count: 0,
  here: [] as Profile[],
  viewer_here: false,
};

const rowToSpaceEvent = (
  row: StoredEventRow,
  space: SpaceWithAttributes,
  profile?: Profile
): SpaceEvent => ({
  id: row.id || `event-${row.source_type}-${row.source_id}-${row.kind}-${row.title}-${row.event_date ?? row.weekday}`,
  space_id: row.space_id,
  source_type: row.source_type,
  source_id: row.source_id,
  source_user_id: row.source_user_id || undefined,
  host_user_id: row.host_user_id || undefined,
  visibility: row.visibility === 'private' ? 'private' : 'public',
  theme: isEventTheme(row.theme) ? row.theme : 'indigo',
  title: row.title,
  kind: row.kind,
  event_date: row.event_date || undefined,
  weekday: row.weekday ?? undefined,
  start_time: row.start_time || undefined,
  link_url: row.link_url || undefined,
  snippet: row.snippet,
  description: row.description || undefined,
  capacity: row.capacity ?? undefined,
  allow_over_capacity: Boolean(row.allow_over_capacity),
  invite_token: row.invite_token || undefined,
  cancelled_at: row.cancelled_at || undefined,
  source_created_at: row.source_created_at,
  created_at: row.created_at || row.source_created_at,
  space,
  profile,
  ...EMPTY_PRESENCE,
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
    Array.from(new Set(rows.flatMap((row) => [row.source_user_id, row.host_user_id]).filter(Boolean).map(String)))
  );

  return rows.map((row) => {
    const hostId = (row.host_user_id as string | null) || (row.source_user_id as string | null);
    return rowToSpaceEvent(mapStoredEventRow(row), mapSpaceRow(row.spaces as Record<string, unknown>), hostId ? profilesByUserId[hostId] : undefined);
  });
}

// Several reviews can mention the same trivia night. RSVPs attach to whichever mention represents it,
// so the pick has to stay the same between loads or headcounts would jump around.
const mentionRichness = (event: SpaceEvent) => Number(Boolean(event.link_url)) + Number(Boolean(event.start_time));
const isBetterMention = (candidate: SpaceEvent, current: SpaceEvent) =>
  mentionRichness(candidate) - mentionRichness(current)
  || current.source_created_at.localeCompare(candidate.source_created_at)
  || current.id.localeCompare(candidate.id);

function buildOccurrences(events: SpaceEvent[], query: EventQuery): CalendarOccurrence[] {
  const byKey = new Map<string, CalendarOccurrence>();

  events.forEach((event) => {
    const distance = calculateDistanceMiles(query.center, event.space);
    if (distance > query.radiusMiles) return;

    expandEventDates(event, query.monthStart).forEach((date) => {
      const key = event.source_type === 'hosted'
        ? `${event.id}|${date}`
        : `${event.space_id}|${event.title}|${date}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { key, date, event, distance, mention_count: 1 });
        return;
      }

      existing.mention_count += 1;
      if (isBetterMention(event, existing.event) > 0) existing.event = event;
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
    query.viewerId || 'anon',
    query.includePrivate ? 'private' : 'public',
  ].join('|');

  const cached = eventCache.get(cacheKey);
  if (cached && !query.force) return cached;

  const localEvents = getLocalEvents();
  const remoteEvents = await fetchRemoteEvents(query);
  const remoteIds = new Set((remoteEvents || []).map((event) => event.id));
  const hosted = remoteEvents ? [] : getLocalHosted(query.viewerId);
  const events = remoteEvents
    ? [...remoteEvents, ...localEvents.filter((event) => !remoteIds.has(event.id))]
    : [...localEvents, ...hosted];

  const built = buildOccurrences(events.filter((event) => !event.cancelled_at), query);
  const { startKey, endKey } = getMonthRange(query.monthStart);
  const presence = await loadPresence(built.map((occurrence) => occurrence.event.id), { from: startKey, to: endKey });
  const occurrences = built
    .map((occurrence) => ({ ...occurrence, event: applyPresence(occurrence.event, occurrence.date, presence, query.viewerId) }))
    .filter((occurrence) => canShowInLists(occurrence.event, query.viewerId, Boolean(query.includePrivate)));
  eventCache.set(cacheKey, occurrences);
  return occurrences;
}

type Presence = { rsvps: RsvpRow[]; checkins: PresenceRow[]; profiles: Record<string, Profile> };

const placeholderProfile = (userId: string, createdAt = ''): Profile => ({
  id: userId,
  user_id: userId,
  created_at: createdAt,
  updated_at: createdAt,
});

const isLocalEventId = (eventId: string) => !isSupabaseConfigured || !supabase || !isUuid(eventId);

function applyPresence(event: SpaceEvent, date: string | undefined, presence: Presence, viewerId?: string): SpaceEvent {
  if (!date) return event;
  const matches = (row: PresenceRow) => row.event_id === event.id && row.occurrence_date === date;
  const toPeople = (rows: PresenceRow[]) => rows
    .sort((first, second) => first.created_at.localeCompare(second.created_at))
    .map((row) => presence.profiles[row.user_id] || placeholderProfile(row.user_id, row.created_at));
  const rsvps = presence.rsvps.filter(matches);
  const checkins = presence.checkins.filter(matches);
  const going = toPeople(rsvps.filter((row) => row.status === 'going'));
  const here = toPeople(checkins);
  const viewerRsvp = viewerId ? rsvps.find((row) => row.user_id === viewerId)?.status : undefined;
  return {
    ...event,
    occurrence_date: date,
    going,
    going_count: going.length,
    viewer_going: viewerRsvp === 'going',
    viewer_rsvp: viewerRsvp,
    here,
    here_count: here.length,
    viewer_here: Boolean(viewerId && checkins.some((row) => row.user_id === viewerId)),
  };
}

function localPresence(eventIds: string[]): Presence {
  const ids = new Set(eventIds);
  const rsvps = localState.rsvps.filter((row) => ids.has(row.event_id));
  const checkins = localState.checkins.filter((row) => ids.has(row.event_id));
  const profiles: Record<string, Profile> = {};
  [...rsvps, ...checkins].forEach((row) => {
    const profile = findLocalProfile(row.user_id);
    if (profile) profiles[row.user_id] = profile;
  });
  return { rsvps, checkins, profiles };
}

async function loadPresence(eventIds: string[], range?: { from: string; to: string }): Promise<Presence> {
  const presence = localPresence(eventIds);
  const remoteIds = Array.from(new Set(eventIds.filter((id) => !isLocalEventId(id))));
  if (!supabase || remoteIds.length === 0) return presence;

  const scoped = (builder: any) => (range ? builder.gte('occurrence_date', range.from).lte('occurrence_date', range.to) : builder);
  const [rsvpResult, checkinResult] = await Promise.all([
    scoped(supabase.from('event_rsvps').select('event_id, occurrence_date, user_id, status, created_at').in('event_id', remoteIds)),
    scoped(supabase.from('event_checkins').select('event_id, occurrence_date, user_id, created_at').in('event_id', remoteIds)),
  ]);
  if (rsvpResult.error) console.warn('Could not load RSVPs:', rsvpResult.error.message);
  if (checkinResult.error) console.warn('Could not load check-ins:', checkinResult.error.message);

  const rsvps = [...presence.rsvps, ...((rsvpResult.data || []) as RsvpRow[])];
  const checkins = [...presence.checkins, ...((checkinResult.data || []) as PresenceRow[])];
  const remoteProfiles = await fetchProfilesByUserId(Array.from(new Set([...rsvps, ...checkins].map((row) => row.user_id))));
  return { rsvps, checkins, profiles: { ...presence.profiles, ...remoteProfiles } };
}

const DEMO_COFFEE_EVENT = 'hosted-demo-coffee';
const DEMO_PRIVATE_EVENT = 'hosted-demo-game';
const DEMO_PICKUP_EVENT = 'hosted-demo-pickup';
const DEMO_LIVE_EVENT = 'hosted-demo-live';

const createUuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.floor(Math.random() * 16);
  const value = char === 'x' ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});

const createToken = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const daysFromToday = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const clipText = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

const EVENT_THEME_IDS: EventTheme[] = ['indigo', 'sunset', 'night', 'court', 'cafe', 'grove'];
const isEventTheme = (value: unknown): value is EventTheme =>
  typeof value === 'string' && EVENT_THEME_IDS.includes(value as EventTheme);

const namesMatch = (left: string, right: string) => {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
};

const canShowInLists = (event: SpaceEvent, viewerId: string | undefined, includePrivate: boolean, allowSecretSpace = false) => {
  if (event.cancelled_at) return false;
  if (event.space.is_secret && event.visibility !== 'private' && !allowSecretSpace) return false;
  if (event.visibility !== 'private') return true;
  if (!includePrivate) return false;
  return event.host_user_id === viewerId || Boolean(event.viewer_rsvp) || event.going.some((person) => person.user_id === viewerId);
};

const canReadEvent = (event: SpaceEvent, viewerId: string | undefined, token?: string) => {
  if (event.cancelled_at && event.host_user_id !== viewerId) return false;
  if (event.visibility !== 'private') return !event.space.is_secret || event.host_user_id === viewerId || Boolean(event.viewer_rsvp);
  return event.host_user_id === viewerId
    || Boolean(event.viewer_rsvp)
    || Boolean(token && event.invite_token && token === event.invite_token);
};

function hydrateHosted(event: SpaceEvent, viewerId?: string): SpaceEvent {
  return applyPresence(
    { ...event, profile: event.profile || findLocalProfile(event.host_user_id) },
    event.event_date,
    localPresence([event.id]),
    viewerId
  );
}

function withLocalPresence(event: SpaceEvent, date: string | undefined, viewerId?: string): SpaceEvent {
  return applyPresence(event, date, localPresence([event.id]), viewerId);
}

function seedDemoHosted() {
  if (localState.hostedEvents) return;
  const timestamp = toIso();
  const cafe = localState.spaces.find((space) => space.id === '00000000-0000-0000-0000-000000000101');
  const board = localState.spaces.find((space) => space.id === '00000000-0000-0000-0000-000000000104');
  const court = localState.spaces.find((space) => space.category === 'Sports Area' && !space.is_secret);
  const mike = findLocalProfile('user-mike');
  const sarah = findLocalProfile(demoCurrentUserId);
  const events: SpaceEvent[] = [];

  if (cafe && mike) {
    events.push({
      id: DEMO_COFFEE_EVENT,
      space_id: cafe.id,
      source_type: 'hosted',
      source_id: DEMO_COFFEE_EVENT,
      source_user_id: mike.user_id,
      host_user_id: mike.user_id,
      visibility: 'public',
      theme: 'cafe',
      title: 'After-work coffee hang',
      kind: 'one_time',
      event_date: daysFromToday(2),
      start_time: '18:00',
      snippet: 'Laptops optional. We will grab the big table upstairs.',
      description: 'Laptops optional. We will grab the big table upstairs.',
      invite_token: 'demo-coffee-hang',
      allow_over_capacity: false,
      source_created_at: timestamp,
      created_at: timestamp,
      space: cafe,
      profile: mike,
      ...EMPTY_PRESENCE,
    });
    localState.rsvps.push(
      { event_id: DEMO_COFFEE_EVENT, occurrence_date: daysFromToday(2), user_id: demoCurrentUserId, status: 'going', created_at: timestamp },
      { event_id: DEMO_COFFEE_EVENT, occurrence_date: daysFromToday(2), user_id: 'user-emma', status: 'going', created_at: timestamp }
    );
    localState.messages.push(
      {
        id: createId('message'),
        event_id: DEMO_COFFEE_EVENT,
        occurrence_date: daysFromToday(2),
        user_id: mike.user_id,
        body: 'I will get there around 5:45 to hold the big table.',
        created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      },
      {
        id: createId('message'),
        event_id: DEMO_COFFEE_EVENT,
        occurrence_date: daysFromToday(2),
        user_id: 'user-emma',
        body: 'Bringing my laptop, might stay after.',
        created_at: timestamp,
      }
    );
  }

  if (court && sarah) {
    events.push({
      id: DEMO_PICKUP_EVENT,
      space_id: court.id,
      source_type: 'hosted',
      source_id: DEMO_PICKUP_EVENT,
      source_user_id: sarah.user_id,
      host_user_id: sarah.user_id,
      visibility: 'private',
      theme: 'court',
      title: 'Pickup basketball',
      kind: 'one_time',
      event_date: daysFromToday(3),
      start_time: '17:00',
      snippet: 'Full court 5v5. Bring a dark and a light shirt.',
      description: 'Full court 5v5. Bring a dark and a light shirt.',
      capacity: 10,
      allow_over_capacity: false,
      invite_token: 'demo-pickup-hoops',
      source_created_at: timestamp,
      created_at: timestamp,
      space: court,
      profile: sarah,
      ...EMPTY_PRESENCE,
    });
    localState.rsvps.push(
      { event_id: DEMO_PICKUP_EVENT, occurrence_date: daysFromToday(3), user_id: 'user-mike', status: 'going', created_at: timestamp },
      { event_id: DEMO_PICKUP_EVENT, occurrence_date: daysFromToday(3), user_id: 'user-nina', status: 'going', created_at: timestamp },
      { event_id: DEMO_PICKUP_EVENT, occurrence_date: daysFromToday(3), user_id: 'user-emma', status: 'not_going', created_at: timestamp }
    );
  }

  if (board && sarah) {
    events.push({
      id: DEMO_PRIVATE_EVENT,
      space_id: board.id,
      source_type: 'hosted',
      source_id: DEMO_PRIVATE_EVENT,
      source_user_id: sarah.user_id,
      host_user_id: sarah.user_id,
      visibility: 'private',
      theme: 'night',
      title: 'Friends-only game night',
      kind: 'one_time',
      event_date: daysFromToday(6),
      start_time: '19:30',
      snippet: 'Just us. Bring a game if you have one.',
      description: 'Just us. Bring a game if you have one.',
      invite_token: 'demo-private-game-night',
      allow_over_capacity: false,
      source_created_at: timestamp,
      created_at: timestamp,
      space: board,
      profile: sarah,
      ...EMPTY_PRESENCE,
    });
  }

  // Started an hour ago so the "I'm here" flow is visible in demo mode.
  if (board && mike) {
    const today = daysFromToday(0);
    events.push({
      id: DEMO_LIVE_EVENT,
      space_id: board.id,
      source_type: 'hosted',
      source_id: DEMO_LIVE_EVENT,
      source_user_id: mike.user_id,
      host_user_id: mike.user_id,
      visibility: 'public',
      theme: 'night',
      title: 'Board game night',
      kind: 'one_time',
      event_date: today,
      start_time: `${String(Math.max(0, new Date().getHours() - 1)).padStart(2, '0')}:00`,
      snippet: 'Catan and Codenames on the back table. Newcomers welcome.',
      description: 'Catan and Codenames on the back table. Newcomers welcome.',
      capacity: 6,
      allow_over_capacity: false,
      invite_token: 'demo-board-game-night',
      source_created_at: timestamp,
      created_at: timestamp,
      space: board,
      profile: mike,
      ...EMPTY_PRESENCE,
    });
    localState.rsvps.push(
      { event_id: DEMO_LIVE_EVENT, occurrence_date: today, user_id: 'user-nina', status: 'going', created_at: timestamp },
      { event_id: DEMO_LIVE_EVENT, occurrence_date: today, user_id: 'user-emma', status: 'going', created_at: timestamp }
    );
    localState.checkins.push(
      { event_id: DEMO_LIVE_EVENT, occurrence_date: today, user_id: 'user-mike', created_at: timestamp },
      { event_id: DEMO_LIVE_EVENT, occurrence_date: today, user_id: 'user-nina', created_at: timestamp }
    );
  }

  localState.hostedEvents = events;
}

function getLocalHosted(viewerId?: string) {
  seedDemoHosted();
  return (localState.hostedEvents || []).map((event) => hydrateHosted(event, viewerId));
}

function mapStoredEventRow(row: Record<string, unknown>): StoredEventRow {
  return {
    id: String(row.id),
    space_id: String(row.space_id),
    source_type: row.source_type as EventSourceType,
    source_id: String(row.source_id),
    source_user_id: (row.source_user_id as string | null) || undefined,
    host_user_id: (row.host_user_id as string | null) || undefined,
    visibility: row.visibility === 'private' ? 'private' : 'public',
    theme: isEventTheme(row.theme) ? row.theme : 'indigo',
    title: String(row.title),
    kind: row.kind as EventKind,
    event_date: (row.event_date as string | null) ?? null,
    weekday: row.weekday === null || row.weekday === undefined ? null : Number(row.weekday),
    start_time: (row.start_time as string | null) ?? null,
    link_url: (row.link_url as string | null) ?? null,
    snippet: String(row.snippet || row.title || ''),
    description: (row.description as string | null) ?? null,
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    allow_over_capacity: Boolean(row.allow_over_capacity),
    invite_token: (row.invite_token as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    source_created_at: String(row.source_created_at),
    created_at: String(row.created_at),
  };
}

function profileFromPayload(row: Record<string, unknown> | null | undefined): Profile | undefined {
  if (!row?.user_id) return undefined;
  return {
    id: String(row.id || row.user_id),
    user_id: String(row.user_id),
    username: (row.username as string | null) || undefined,
    full_name: (row.full_name as string | null) || undefined,
    avatar_url: (row.avatar_url as string | null) || undefined,
    bio: (row.bio as string | null) || undefined,
    location: (row.location as string | null) || undefined,
    vibe_title: (row.vibe_title as string | null) || undefined,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

const profilesFromPayload = (value: unknown) => (Array.isArray(value)
  ? value.map((row) => profileFromPayload(row as Record<string, unknown>)).filter((profile): profile is Profile => Boolean(profile))
  : []);

function mapFetchedEvent(payload: Record<string, unknown>, viewerId?: string): SpaceEvent | null {
  const eventRow = payload.event as Record<string, unknown> | undefined;
  const spaceRow = payload.space as Record<string, unknown> | undefined;
  if (!eventRow || !spaceRow) return null;
  const going = profilesFromPayload(payload.going);
  const here = profilesFromPayload(payload.here);
  const event = rowToSpaceEvent(mapStoredEventRow(eventRow), mapSpaceRow(spaceRow), profileFromPayload(payload.host as Record<string, unknown> | undefined));
  const viewerRsvp = payload.viewer_status === 'going' || payload.viewer_status === 'not_going'
    ? payload.viewer_status as RsvpStatus
    : undefined;
  return {
    ...event,
    occurrence_date: typeof payload.occurrence_date === 'string' ? payload.occurrence_date : event.event_date,
    going,
    going_count: going.length,
    viewer_going: viewerRsvp === 'going' || Boolean(viewerId && going.some((person) => person.user_id === viewerId)),
    viewer_rsvp: viewerRsvp,
    here,
    here_count: here.length,
    viewer_here: Boolean(payload.viewer_here) || Boolean(viewerId && here.some((person) => person.user_id === viewerId)),
  };
}

function matchKnownSpace(
  spaces: SpaceWithAttributes[],
  candidate: { name: string; latitude: number; longitude: number }
) {
  let best: { space: SpaceWithAttributes; distance: number } | undefined;
  spaces.forEach((space) => {
    if (space.is_secret) return;
    const distance = calculateDistanceMiles(candidate, space);
    if (distance > 0.05) return;
    if (!namesMatch(space.name, candidate.name) && distance > 0.02) return;
    if (!best || distance < best.distance) best = { space, distance };
  });
  return best?.space;
}

async function resolveEventSpace(userId: string, input: CreateHostedEventInput): Promise<SpaceWithAttributes> {
  const purpose = input.space.primary_purpose || CATEGORY_CONFIG[input.space.category].purposes[0];

  if (input.existingSpace) {
    if (!canUseUserScopedRemote(userId)) {
      const known = localState.spaces.find((space) => space.id === input.space.id);
      if (!known) throw new Error('Pick a place first');
      return known;
    }
    const { data, error } = await supabase.from('spaces').select('*').eq('id', input.space.id).maybeSingle();
    if (error || !data) throw new Error('That place is not available');
    return mapSpaceRow(data as Record<string, unknown>);
  }

  if (!canUseUserScopedRemote(userId)) {
    const nearby = matchKnownSpace(localState.spaces, input.space);
    if (nearby) return nearby;
    const timestamp = toIso();
    const space: SpaceWithAttributes = {
      id: createId('space'),
      name: input.space.name.trim(),
      category: input.space.category,
      primary_purpose: purpose,
      address: input.space.address,
      latitude: input.space.latitude,
      longitude: input.space.longitude,
      is_secret: false,
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    localState.spaces.push(space);
    return space;
  }

  const delta = 0.05 / MILES_PER_DEGREE_LATITUDE;
  const { data: nearbyRows } = await supabase
    .from('spaces')
    .select('*')
    .gte('latitude', input.space.latitude - delta)
    .lte('latitude', input.space.latitude + delta)
    .gte('longitude', input.space.longitude - delta)
    .lte('longitude', input.space.longitude + delta)
    .limit(20);
  const nearby = matchKnownSpace(((nearbyRows || []) as Record<string, unknown>[]).map(mapSpaceRow), input.space);
  if (nearby) return nearby;

  const timestamp = toIso();
  const { data, error } = await supabase.from('spaces').insert({
    name: input.space.name.trim(),
    category: input.space.category,
    primary_purpose: purpose,
    address: input.space.address,
    latitude: input.space.latitude,
    longitude: input.space.longitude,
    is_secret: false,
    created_by: userId,
    updated_at: timestamp,
  }).select().single();
  if (error) throw error;
  return mapSpaceRow(data as Record<string, unknown>);
}

export async function createHostedEvent(userId: string, input: CreateHostedEventInput): Promise<SpaceEvent> {
  const title = input.title.trim();
  const description = input.description?.trim();
  if (!title || title.length > 60) throw new Error('Give it a title, up to 60 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) throw new Error('Pick a date.');
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) throw new Error('Pick a start time.');
  if (description && description.length > 800) throw new Error('Keep the note under 800 characters.');
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 500)) {
    throw new Error('Capacity has to be between 1 and 500.');
  }
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to host an event');

  const space = await resolveEventSpace(userId, input);
  if (space.is_secret && input.visibility === 'public') throw new Error('Public hangouts have to be at a public spot.');

  const id = createUuid();
  const token = createToken();
  const timestamp = toIso();
  const snippet = clipText(description || `Hosted at ${space.name}`, 220);
  const profile = findLocalProfile(userId);
  const event: SpaceEvent = {
    id,
    space_id: space.id,
    source_type: 'hosted',
    source_id: id,
    source_user_id: userId,
    host_user_id: userId,
    visibility: input.visibility,
    theme: isEventTheme(input.theme) ? input.theme : 'indigo',
    title,
    kind: 'one_time',
    event_date: input.eventDate,
    start_time: input.startTime,
    link_url: input.linkUrl,
    snippet,
    description,
    capacity: input.capacity,
    allow_over_capacity: Boolean(input.capacity && input.allowOverCapacity),
    invite_token: token,
    source_created_at: timestamp,
    created_at: timestamp,
    space,
    profile,
    ...EMPTY_PRESENCE,
  };

  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    localState.hostedEvents?.push(event);
    eventCache.clear();
    return hydrateHosted(event, userId);
  }

  const { error } = await supabase.from('space_events').insert({
    id,
    space_id: space.id,
    source_type: 'hosted',
    source_id: id,
    source_user_id: userId,
    host_user_id: userId,
    visibility: input.visibility,
    theme: isEventTheme(input.theme) ? input.theme : 'indigo',
    title,
    kind: 'one_time',
    event_date: input.eventDate,
    weekday: null,
    start_time: input.startTime,
    link_url: input.linkUrl ?? null,
    snippet,
    description: description ?? null,
    capacity: input.capacity ?? null,
    allow_over_capacity: Boolean(input.capacity && input.allowOverCapacity),
    invite_token: token,
    dedupe_key: id,
    source_created_at: timestamp,
  });
  if (error) throw new Error(error.message);
  eventCache.clear();
  return (await getEvent(id, userId, token)) || event;
}

export async function updateHostedEventTheme(userId: string, eventId: string, theme: EventTheme): Promise<void> {
  if (!isEventTheme(theme)) throw new Error('Pick a look from the list.');
  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    const event = localState.hostedEvents?.find((item) => item.id === eventId);
    if (!event || event.host_user_id !== userId) throw new Error('Only the host can change the look');
    event.theme = theme;
    eventCache.clear();
    return;
  }

  const { error } = await supabase
    .from('space_events')
    .update({ theme })
    .eq('id', eventId)
    .eq('host_user_id', userId)
    .eq('source_type', 'hosted');
  if (error) throw new Error(error.message);
  eventCache.clear();
}

// `date` picks the occurrence for weekly events; one-time events always use their own date.
export async function getEvent(eventId: string, viewerId?: string, token?: string, date?: string): Promise<SpaceEvent | null> {
  if (isLocalEventId(eventId)) {
    const hosted = getLocalHosted(viewerId).find((event) => event.id === eventId);
    if (hosted) return canReadEvent(hosted, viewerId, token) ? hosted : null;
    const mentioned = getLocalEvents().find((event) => event.id === eventId);
    return mentioned ? withLocalPresence(mentioned, resolveOccurrenceDate(mentioned, date), viewerId) : null;
  }

  const { data, error } = await supabase.rpc('fetch_event', { target_id: eventId, token: token || null, occurrence: date || null });
  if (!error && data) return mapFetchedEvent(data as Record<string, unknown>, viewerId);
  if (error) console.warn('fetch_event failed, trying a direct read:', error.message);

  const { data: row, error: readError } = await supabase
    .from('space_events')
    .select('*, spaces!inner(*)')
    .eq('id', eventId)
    .maybeSingle();
  if (readError || !row) return null;
  const stored = mapStoredEventRow(row as Record<string, unknown>);
  const hostId = stored.host_user_id || stored.source_user_id;
  const profiles = hostId ? await fetchProfilesByUserId([hostId]) : {};
  const event = rowToSpaceEvent(stored, mapSpaceRow((row as Record<string, unknown>).spaces as Record<string, unknown>), hostId ? profiles[hostId] : undefined);
  return applyPresence(event, resolveOccurrenceDate(event, date), await loadPresence([event.id]), viewerId);
}

function findLocalEventForPresence(eventId: string, userId: string, token?: string) {
  const event = getLocalHosted(userId).find((item) => item.id === eventId)
    || getLocalEvents().find((item) => item.id === eventId);
  if (!event || event.cancelled_at) throw new Error('Event not found');
  if (!canReadEvent(event, userId, token)) throw new Error('You need an invite for this one');
  return event;
}

export async function setEventRsvp(
  userId: string,
  eventId: string,
  status: RsvpStatus | null,
  token?: string,
  date?: string
): Promise<void> {
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to RSVP');

  if (isLocalEventId(eventId) || !canUseUserScopedRemote(userId)) {
    const event = findLocalEventForPresence(eventId, userId, token);
    const occurrence = resolveOccurrenceDate(event, date);
    if (!occurrence) throw new Error('Pick a date for this event');
    if (status && getEventPhase(event, occurrence) === 'ended') throw new Error('This event already happened');
    const isSameSlot = (rsvp: RsvpRow) => rsvp.event_id === eventId && rsvp.occurrence_date === occurrence;
    const others = localState.rsvps.filter((rsvp) => !(isSameSlot(rsvp) && rsvp.user_id === userId));
    if (status === 'going' && event.capacity && !event.allow_over_capacity) {
      const count = others.filter((rsvp) => isSameSlot(rsvp) && rsvp.status === 'going').length;
      if (count >= event.capacity) throw new Error('This event is full');
    }
    localState.rsvps = status
      ? [...others, { event_id: eventId, occurrence_date: occurrence, user_id: userId, status, created_at: toIso() }]
      : others;
    eventCache.clear();
    return;
  }

  const { error } = await supabase.rpc('set_event_rsvp', {
    target_id: eventId,
    rsvp_status: status,
    token: token || null,
    occurrence: date || null,
  });
  if (error) throw new Error(error.message);
  eventCache.clear();
}

export async function setEventCheckin(userId: string, eventId: string, here: boolean, token?: string, date?: string): Promise<void> {
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to check in');

  if (isLocalEventId(eventId) || !canUseUserScopedRemote(userId)) {
    const event = findLocalEventForPresence(eventId, userId, token);
    const occurrence = resolveOccurrenceDate(event, date);
    if (!occurrence) throw new Error('Pick a date for this event');
    if (here && getEventPhase(event, occurrence) !== 'live') throw new Error('You can only check in while it is happening');
    const others = localState.checkins.filter((row) =>
      !(row.event_id === eventId && row.occurrence_date === occurrence && row.user_id === userId));
    localState.checkins = here
      ? [...others, { event_id: eventId, occurrence_date: occurrence, user_id: userId, created_at: toIso() }]
      : others;
    eventCache.clear();
    return;
  }

  const { error } = await supabase.rpc('set_event_checkin', {
    target_id: eventId,
    is_here: here,
    token: token || null,
    occurrence: date || null,
  });
  if (error) throw new Error(error.message);
  eventCache.clear();
}

export async function cancelHostedEvent(userId: string, eventId: string): Promise<void> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    const event = localState.hostedEvents?.find((item) => item.id === eventId);
    if (!event || event.host_user_id !== userId) throw new Error('Only the host can cancel this');
    event.cancelled_at = toIso();
    eventCache.clear();
    return;
  }

  const { error } = await supabase
    .from('space_events')
    .update({ cancelled_at: toIso() })
    .eq('id', eventId)
    .eq('host_user_id', userId)
    .eq('source_type', 'hosted');
  if (error) throw new Error(error.message);
  eventCache.clear();
}

export async function listSpaceEvents(spaceId: string, viewerId?: string): Promise<SpaceEvent[]> {
  const today = toDateKey(new Date());
  const localHosted = isSupabaseConfigured && supabase ? [] : getLocalHosted(viewerId).filter((event) => event.space_id === spaceId);
  let remote: SpaceEvent[] = [];

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('space_events').select('*, spaces!inner(*)').eq('space_id', spaceId).limit(100);
    if (!error && data) {
      const profiles = await fetchProfilesByUserId(
        (data as Record<string, unknown>[]).flatMap((row) => [row.host_user_id, row.source_user_id]).filter(Boolean).map(String)
      );
      const mapped = (data as Record<string, unknown>[]).map((row) => {
        const hostId = (row.host_user_id as string | null) || (row.source_user_id as string | null);
        return rowToSpaceEvent(mapStoredEventRow(row), mapSpaceRow(row.spaces as Record<string, unknown>), hostId ? profiles[hostId] : undefined);
      });
      remote = mapped;
    }
  }

  const candidates = [...remote, ...getLocalEvents().filter((event) => event.space_id === spaceId), ...localHosted];
  const presence = await loadPresence(candidates.map((event) => event.id));
  const seen = new Set<string>();
  return candidates
    .map((event) => applyPresence(event, nextOccurrenceDate(event), presence, viewerId))
    .filter((event) => {
      const signature = `${event.source_type}|${event.title}|${event.event_date ?? ''}|${event.weekday ?? ''}`;
      if (seen.has(signature) || !canShowInLists(event, viewerId, true, true)) return false;
      if (event.kind === 'one_time' && event.event_date && event.event_date < today) return false;
      seen.add(signature);
      return true;
    })
    .sort((first, second) => (first.occurrence_date || '9999').localeCompare(second.occurrence_date || '9999')
      || (first.start_time || '99:99').localeCompare(second.start_time || '99:99'));
}

const mapMessageRow = (row: Record<string, unknown>, profiles: Record<string, Profile>): EventMessage => ({
  id: String(row.id),
  event_id: String(row.event_id),
  occurrence_date: String(row.occurrence_date),
  user_id: String(row.user_id),
  body: String(row.body || ''),
  created_at: String(row.created_at),
  profile: profiles[String(row.user_id)] || findLocalProfile(String(row.user_id)),
});

type MessageListener = (message: EventMessage) => void;
const localChatListeners = new Map<string, Set<MessageListener>>();
const chatKey = (eventId: string, date: string) => `${eventId}|${date}`;

/** The host and people going for that date are in the chat, and it closes the day after the event. */
export function canUseEventChat(event: SpaceEvent, viewerId?: string) {
  if (!viewerId || event.cancelled_at || !event.occurrence_date) return false;
  if (!isChatOpen(event.occurrence_date)) return false;
  return event.host_user_id === viewerId || event.viewer_going;
}

export async function listEventMessages(eventId: string, date: string): Promise<EventMessage[]> {
  if (isLocalEventId(eventId)) {
    if (!isChatOpen(date)) return [];
    return byCreatedAtDesc(localState.messages.filter((message) => message.event_id === eventId && message.occurrence_date === date))
      .reverse()
      .map((message) => ({ ...message, profile: findLocalProfile(message.user_id) }));
  }

  const { data, error } = await supabase
    .from('event_messages')
    .select('*')
    .eq('event_id', eventId)
    .eq('occurrence_date', date)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = ((data || []) as Record<string, unknown>[]).reverse();
  const profiles = await fetchProfilesByUserId(Array.from(new Set(rows.map((row) => String(row.user_id)))));
  return rows.map((row) => mapMessageRow(row, profiles));
}

export async function sendEventMessage(userId: string, event: SpaceEvent, body: string): Promise<EventMessage> {
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (text.length > MAX_EVENT_MESSAGE_LENGTH) throw new Error(`Keep it under ${MAX_EVENT_MESSAGE_LENGTH} characters.`);
  if (!canUseEventChat(event, userId) || !event.occurrence_date) throw new Error('RSVP going to join the chat.');
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to chat');

  if (isLocalEventId(event.id) || !canUseUserScopedRemote(userId)) {
    const message: EventMessage = {
      id: createId('message'),
      event_id: event.id,
      occurrence_date: event.occurrence_date,
      user_id: userId,
      body: text,
      created_at: toIso(),
      profile: findLocalProfile(userId),
    };
    localState.messages.push(message);
    localChatListeners.get(chatKey(event.id, event.occurrence_date))?.forEach((listener) => listener(message));
    return message;
  }

  const { data, error } = await supabase
    .from('event_messages')
    .insert({ event_id: event.id, occurrence_date: event.occurrence_date, user_id: userId, body: text })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const profiles = await fetchProfilesByUserId([userId]);
  return mapMessageRow(data as Record<string, unknown>, profiles);
}

/** Calls `onMessage` for every new message in the chat. Returns an unsubscribe function. */
export function subscribeToEventMessages(eventId: string, date: string, onMessage: MessageListener): () => void {
  if (isLocalEventId(eventId)) {
    const key = chatKey(eventId, date);
    const listeners = localChatListeners.get(key) || new Set<MessageListener>();
    listeners.add(onMessage);
    localChatListeners.set(key, listeners);
    return () => {
      listeners.delete(onMessage);
    };
  }

  const channel = supabase
    .channel(`event-chat-${eventId}-${date}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${eventId}` },
      async (payload: { new: Record<string, unknown> }) => {
        if (String(payload.new.occurrence_date) !== date) return;
        const profiles = await fetchProfilesByUserId([String(payload.new.user_id)]);
        onMessage(mapMessageRow(payload.new, profiles));
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
