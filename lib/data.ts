import {
  calculateDistanceMiles,
  calculateOverallScore,
  CATEGORY_CONFIG,
  normalizePurposeForCategory,
  sanitizeAttributeScores,
  type AttributeScores,
  type CalendarOccurrence,
  type ChatThread,
  type DirectMessage,
  type DirectThread,
  type CategoryPurpose,
  type CreateGroupInput,
  type CreateHostedEventInput,
  type EventKind,
  type EventSourceType,
  type EventTheme,
  type EventMention,
  type EventMessage,
  type EventVisibility,
  type FeedActivity,
  type Group,
  type GroupDetail,
  type GroupMember,
  type GroupRole,
  type GroupVisibility,
  type IncomingInvite,
  type InviteStatus,
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
  demoCrowdProfiles,
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
  eventSeriesId,
  expandEventDates,
  extractEvents,
  getEventPhase,
  getMonthRange,
  isChatOpen,
  nextOccurrenceDate,
  parseDateKey,
  resolveOccurrenceDate,
  seriesKey,
  toDateKey,
  WEEKLY_LIFETIME_DAYS,
  WEEKLY_LOOKBACK_DAYS,
  type EventRow,
  type EventSource,
} from './events';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getDisplayName } from './format';
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
  authorIds?: string[];
};

type StoredGroup = {
  id: string;
  name: string;
  description?: string;
  visibility: GroupVisibility;
  invite_token: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type LocalMember = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  created_at: string;
};

type LocalInvite = {
  target_id: string;
  invitee_user_id: string;
  invited_by: string;
  status: InviteStatus;
  created_at: string;
};

const localState = {
  spaces: [...demoSpaces, ...demoSecretSpaces],
  feed: [...demoFeed],
  comments: [...demoComments],
  rankings: [...demoRankings],
  profiles: [...demoProfiles, ...demoCrowdProfiles],
  following: new Set(['user-mike', 'user-nina']),
  followers: new Set(['user-mike', 'user-nina', 'user-emma']),
  secretAccess: new Set(demoSecretAccess),
  secretRequests: [...demoSecretRequests],
  sessionRatings: {} as Record<string, number>,
  events: null as SpaceEvent[] | null,
  hostedEvents: null as SpaceEvent[] | null,
  rsvps: [] as RsvpRow[],
  checkins: [] as PresenceRow[],
  messages: [] as EventMessage[],
  hereMessages: [] as EventMessage[],
  directMessages: [] as DirectMessage[],
  photos: [...demoPhotos],
  groups: null as StoredGroup[] | null,
  groupMembers: [] as LocalMember[],
  eventGroups: [] as { event_id: string; group_id: string }[],
  groupSpots: [] as { group_id: string; space_id: string; added_by: string; created_at: string }[],
  eventInvites: [] as LocalInvite[],
  groupInvites: [] as LocalInvite[],
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
  const { authorId, authorIds } = options;
  const filterFeed = (feed: FeedActivity[]) => {
    let next = authorId ? feed.filter((activity) => activity.user_id === authorId) : feed;
    if (authorIds) {
      const allowed = new Set(authorIds);
      next = next.filter((activity) => allowed.has(activity.user_id));
    }
    return filterFeedByScope(next, scope);
  };

  if (!isSupabaseConfigured || !supabase) {
    return filterFeed(listRecentActivityFromDemo(currentUserId));
  }

  let query = supabase
    .from('ratings')
    .select('*, spaces(*)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (authorId && isUuid(authorId)) query = query.eq('user_id', authorId);
  if (authorIds) {
    const ids = authorIds.filter(isUuid);
    if (ids.length === 0) return filterFeed(listRecentActivityFromDemo(currentUserId));
    query = query.in('user_id', ids);
  }

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
    localState.events = assignLocalSeries([...existingEvents, ...newEvents]);
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
  series_id?: string | null;
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
  series_id: row.series_id || undefined,
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

// Mirrors assign_event_series in hosted-events.sql: the oldest mention anchors the series.
function assignLocalSeries(events: SpaceEvent[]): SpaceEvent[] {
  const groups = new Map<string, SpaceEvent[]>();
  events.forEach((event) => {
    if (event.source_type === 'hosted') return;
    const group = groups.get(seriesKey(event)) || [];
    group.push(event);
    groups.set(seriesKey(event), group);
  });
  return events.map((event) => {
    const group = event.source_type === 'hosted' ? undefined : groups.get(seriesKey(event));
    if (!group) return { ...event, series_id: event.id, mention_count: 1 };
    const anchor = group.reduce((oldest, candidate) =>
      candidate.source_created_at.localeCompare(oldest.source_created_at) < 0
        || (candidate.source_created_at === oldest.source_created_at && candidate.id < oldest.id)
        ? candidate
        : oldest);
    return { ...event, series_id: anchor.id, mention_count: group.length };
  });
}

function getLocalEvents(): SpaceEvent[] {
  if (!localState.events) {
    localState.events = assignLocalSeries([
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
    ]);
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

// Several reviews can mention the same trivia night. Presence lives on the series, so this only picks
// which mention's link, time, and snippet to show.
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
      const series = event.series_id || (event.source_type === 'hosted' ? event.id : seriesKey(event));
      const key = `${series}|${date}`;
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
  const presence = await loadPresence(built.map((occurrence) => eventSeriesId(occurrence.event)), { from: startKey, to: endKey });
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
  const series = eventSeriesId(event);
  const matches = (row: PresenceRow) => row.event_id === series && row.occurrence_date === date;
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
const DEMO_SPRINT_EVENT = 'hosted-demo-sprint';
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
  if (hasGroupEventAccess(event.id, viewerId)) return true;
  if (event.visibility !== 'private') return !event.space.is_secret || event.host_user_id === viewerId || Boolean(event.viewer_rsvp);
  return event.host_user_id === viewerId
    || Boolean(event.viewer_rsvp)
    || Boolean(token && event.invite_token && token === event.invite_token);
};

function hydrateHosted(event: SpaceEvent, viewerId?: string): SpaceEvent {
  return applyPresence(
    { ...event, series_id: event.id, profile: event.profile || findLocalProfile(event.host_user_id) },
    event.event_date,
    localPresence([event.id]),
    viewerId
  );
}

function withLocalPresence(event: SpaceEvent, date: string | undefined, viewerId?: string): SpaceEvent {
  return applyPresence(event, date, localPresence([eventSeriesId(event)]), viewerId);
}

const DEMO_FRIDAY_EVENT = 'hosted-demo-friday';
const DEMO_SUPPER_EVENT = 'hosted-demo-supper';
const DEMO_POTLUCK_EVENT = 'hosted-demo-potluck';
const DEMO_PICNIC_EVENT = 'hosted-demo-picnic';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

const nextWeekdayFromToday = (weekday: number) => {
  const today = new Date();
  return daysFromToday((weekday - today.getDay() + 7) % 7 || 7);
};

function seedRsvps(eventId: string, date: string, userIds: string[], status: RsvpStatus = 'going') {
  userIds.forEach((userId, index) => {
    localState.rsvps.push({ event_id: eventId, occurrence_date: date, user_id: userId, status, created_at: minutesAgo(600 - index * 7) });
  });
}

function seedCheckins(eventId: string, date: string, userIds: string[]) {
  userIds.forEach((userId, index) => {
    localState.checkins.push({ event_id: eventId, occurrence_date: date, user_id: userId, created_at: minutesAgo(90 - index * 5) });
  });
}

function seedHereMessages(eventId: string, date: string, lines: [string, string][]) {
  lines.forEach(([userId, body], index) => {
    localState.hereMessages.push({
      id: createId('here'),
      event_id: eventId,
      occurrence_date: date,
      user_id: userId,
      body,
      created_at: minutesAgo((lines.length - index) * 8),
    });
  });
}

function seedMessages(eventId: string, date: string, lines: [string, string][]) {
  lines.forEach(([userId, body], index) => {
    localState.messages.push({
      id: createId('message'),
      event_id: eventId,
      occurrence_date: date,
      user_id: userId,
      body,
      created_at: minutesAgo((lines.length - index) * 12),
    });
  });
}

// Mentioned events from the demo reviews get headcounts too: next week's trivia, plus last week's for a recap.
function seedDemoMentionPresence() {
  const trivia = getLocalEvents().find((event) => event.title === 'Trivia Night' && event.space_id === '00000000-0000-0000-0000-000000000104');
  if (trivia?.weekday !== undefined) {
    const next = nextOccurrenceDate(trivia) || daysFromToday(0);
    const nextDay = parseDateKey(next);
    const last = toDateKey(new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate() - 7));
    const series = eventSeriesId(trivia);
    seedRsvps(series, next, ['user-nina', 'user-emma', 'user-priya', 'user-sam', 'user-zoe', 'user-marcus', 'user-hana', 'user-diego', 'user-maya']);
    seedRsvps(series, next, ['user-tyler'], 'not_going');
    seedRsvps(series, last, [demoCurrentUserId, 'user-nina', 'user-emma', 'user-priya', 'user-sam', 'user-zoe', 'user-jordan']);
    seedCheckins(series, last, [demoCurrentUserId, 'user-nina', 'user-priya', 'user-sam', 'user-jordan']);
  }

  const runClub = getLocalEvents().find((event) => event.title === 'Run Club');
  if (runClub) {
    seedRsvps(eventSeriesId(runClub), nextOccurrenceDate(runClub) || daysFromToday(0), ['user-tyler', 'user-ava', 'user-omar', 'user-mike']);
  }
}

type DemoHostedInput = Pick<SpaceEvent, 'id' | 'title' | 'theme' | 'visibility' | 'event_date' | 'start_time' | 'space'> & {
  host: Profile;
  description: string;
  capacity?: number;
  allowOverCapacity?: boolean;
};

function demoHosted(input: DemoHostedInput, timestamp: string): SpaceEvent {
  return {
    id: input.id,
    series_id: input.id,
    space_id: input.space.id,
    source_type: 'hosted',
    source_id: input.id,
    source_user_id: input.host.user_id,
    host_user_id: input.host.user_id,
    visibility: input.visibility,
    theme: input.theme,
    title: input.title,
    kind: 'one_time',
    event_date: input.event_date,
    start_time: input.start_time,
    snippet: input.description,
    description: input.description,
    capacity: input.capacity,
    allow_over_capacity: Boolean(input.allowOverCapacity),
    invite_token: `demo-${input.id}`,
    source_created_at: timestamp,
    created_at: timestamp,
    space: input.space,
    profile: input.host,
    ...EMPTY_PRESENCE,
  };
}

function seedDemoHosted() {
  if (localState.hostedEvents) return;
  const timestamp = toIso();
  const space = (id: string) => localState.spaces.find((item) => item.id === id);
  const cafe = space('00000000-0000-0000-0000-000000000101');
  const park = space('00000000-0000-0000-0000-000000000102');
  const board = space('00000000-0000-0000-0000-000000000104');
  const overlook = space('00000000-0000-0000-0000-000000000105');
  const mike = findLocalProfile('user-mike');
  const sarah = findLocalProfile(demoCurrentUserId);
  const emma = findLocalProfile('user-emma');
  const nina = findLocalProfile('user-nina');
  const events: SpaceEvent[] = [];

  if (cafe && mike) {
    const date = daysFromToday(2);
    events.push(demoHosted({
      id: DEMO_COFFEE_EVENT, title: 'After-work coffee hang', theme: 'cafe', visibility: 'public',
      event_date: date, start_time: '18:00', space: cafe, host: mike,
      description: 'Laptops optional. We will grab the big table upstairs.',
    }, timestamp));
    seedRsvps(DEMO_COFFEE_EVENT, date, [demoCurrentUserId, 'user-emma', 'user-priya', 'user-sam', 'user-hana', 'user-leo']);
    seedMessages(DEMO_COFFEE_EVENT, date, [
      ['user-mike', 'I will get there around 5:45 to hold the big table.'],
      ['user-emma', 'Bringing my laptop, might stay after.'],
      ['user-priya', 'Is the upstairs open on weekdays? First time here.'],
      ['user-mike', 'Yep, take the stairs past the pastry case.'],
    ]);
  }

  // Started an hour ago so the "I'm here" flow is visible in demo mode.
  if (board && mike) {
    const today = daysFromToday(0);
    events.push(demoHosted({
      id: DEMO_LIVE_EVENT, title: 'Board game night', theme: 'night', visibility: 'public',
      event_date: today, start_time: `${String(Math.max(0, new Date().getHours() - 1)).padStart(2, '0')}:00`,
      space: board, host: mike, capacity: 6,
      description: 'Catan and Codenames on the back table. Newcomers welcome.',
    }, timestamp));
    seedRsvps(DEMO_LIVE_EVENT, today, ['user-nina', 'user-emma', 'user-zoe', 'user-marcus']);
    seedCheckins(DEMO_LIVE_EVENT, today, ['user-mike', 'user-nina', 'user-zoe']);
    seedHereMessages(DEMO_LIVE_EVENT, today, [
      ['user-mike', 'We are at the back table.'],
      ['user-nina', 'Grabbing a chair, be right there.'],
    ]);
  }

  // "Board game night at The Board Room, Friday 8pm, 4 spots open."
  if (board && mike) {
    const friday = nextWeekdayFromToday(5);
    events.push(demoHosted({
      id: DEMO_FRIDAY_EVENT, title: 'Friday board game night', theme: 'indigo', visibility: 'public',
      event_date: friday, start_time: '20:00', space: board, host: mike, capacity: 8,
      description: 'Bring a game or play one of theirs. Two tables, mixed skill levels.',
    }, timestamp));
    seedRsvps(DEMO_FRIDAY_EVENT, friday, ['user-mike', 'user-jordan', 'user-diego', 'user-maya']);
  }

  // Private and full. You answered "Can't go", so it stays in your calendar and "I'm in" shows Full.
  if (overlook && nina) {
    const date = daysFromToday(4);
    events.push(demoHosted({
      id: DEMO_SUPPER_EVENT, title: 'Sunset supper club', theme: 'sunset', visibility: 'private',
      event_date: date, start_time: '18:30', space: overlook, host: nina, capacity: 6,
      description: 'Six seats, one long blanket. Everyone brings a dish to share.',
    }, timestamp));
    seedRsvps(DEMO_SUPPER_EVENT, date, ['user-nina', 'user-omar', 'user-ava', 'user-hana', 'user-leo', 'user-priya']);
    seedRsvps(DEMO_SUPPER_EVENT, date, [demoCurrentUserId], 'not_going');
  }

  // Private with two spots left, and you're going, so the group chat is open.
  if (park && emma) {
    const date = daysFromToday(5);
    events.push(demoHosted({
      id: DEMO_POTLUCK_EVENT, title: 'Picnic potluck', theme: 'grove', visibility: 'private',
      event_date: date, start_time: '13:00', space: park, host: emma, capacity: 10,
      description: 'Invite only. Emma is bringing the speaker, you bring a side.',
    }, timestamp));
    seedRsvps(DEMO_POTLUCK_EVENT, date, ['user-emma', demoCurrentUserId, 'user-nina', 'user-sam', 'user-zoe', 'user-tyler', 'user-maya', 'user-omar']);
    seedRsvps(DEMO_POTLUCK_EVENT, date, ['user-diego'], 'not_going');
    seedMessages(DEMO_POTLUCK_EVENT, date, [
      ['user-emma', 'Spot is by the fountain on the north side. Look for the green blanket.'],
      ['user-sam', 'I can bring a pasta salad.'],
      ['user-zoe', 'Lemonade + cups on me'],
    ]);
  }

  // Private, over the cap, and the host is letting extras in.
  if (cafe && sarah) {
    const date = daysFromToday(3);
    events.push(demoHosted({
      id: DEMO_SPRINT_EVENT, title: 'Saturday cowork sprint', theme: 'cafe', visibility: 'private',
      event_date: date, start_time: '10:00', space: cafe, host: sarah, capacity: 10, allowOverCapacity: true,
      description: 'Two 90-minute focus blocks with a coffee break in between. Invite only.',
    }, timestamp));
    seedRsvps(DEMO_SPRINT_EVENT, date, [
      demoCurrentUserId, 'user-mike', 'user-nina', 'user-jordan', 'user-marcus', 'user-diego',
      'user-tyler', 'user-omar', 'user-leo', 'user-sam', 'user-ava',
    ]);
    seedRsvps(DEMO_SPRINT_EVENT, date, ['user-emma'], 'not_going');
  }

  if (board && sarah) {
    events.push(demoHosted({
      id: DEMO_PRIVATE_EVENT, title: 'Friends-only game night', theme: 'night', visibility: 'private',
      event_date: daysFromToday(6), start_time: '19:30', space: board, host: sarah,
      description: 'Just us. Bring a game if you have one.',
    }, timestamp));
  }

  // Already happened, so you can see the recap.
  if (overlook && nina) {
    const date = daysFromToday(-3);
    events.push(demoHosted({
      id: DEMO_PICNIC_EVENT, title: 'Plane-spotting picnic', theme: 'sunset', visibility: 'public',
      event_date: date, start_time: '17:30', space: overlook, host: nina,
      description: 'Blankets out by the runway fence. Bring snacks.',
    }, timestamp));
    seedRsvps(DEMO_PICNIC_EVENT, date, [demoCurrentUserId, 'user-nina', 'user-omar', 'user-ava', 'user-mike', 'user-hana', 'user-tyler']);
    seedCheckins(DEMO_PICNIC_EVENT, date, [demoCurrentUserId, 'user-nina', 'user-omar', 'user-ava', 'user-hana']);
  }

  localState.hostedEvents = events;
  seedDemoMentionPresence();
  if (localState.directMessages.length === 0) {
    localState.directMessages.push({
      id: 'dm-demo-nina',
      sender_id: 'user-nina',
      recipient_id: demoCurrentUserId,
      body: 'Save me a seat if you are coming by later.',
      created_at: minutesAgo(20),
      profile: findLocalProfile('user-nina'),
    });
  }
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
    series_id: (row.series_id as string | null) ?? null,
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
    mention_count: payload.mention_count === undefined ? undefined : Number(payload.mention_count),
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

  const groupIds = Array.from(new Set((input.groupIds || []).filter(Boolean)));
  if (groupIds.length > 0) {
    const joinedIds = new Set((await listMyGroups(userId)).map((group) => group.id));
    if (groupIds.some((groupId) => !joinedIds.has(groupId))) {
      throw new Error('You can only post to groups you belong to.');
    }
  }

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
    seedDemoGroups();
    localState.hostedEvents?.push(event);
    groupIds.forEach((groupId) => localState.eventGroups.push({ event_id: id, group_id: groupId }));
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
  if (groupIds.length > 0) {
    const { error: linkError } = await supabase.from('event_groups').insert(groupIds.map((groupId) => ({
      event_id: id,
      group_id: groupId,
      created_by: userId,
    })));
    if (linkError) throw new Error(linkError.message);
  }
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
  return applyPresence(event, resolveOccurrenceDate(event, date), await loadPresence([eventSeriesId(event)]), viewerId);
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
    const series = eventSeriesId(event);
    const isSameSlot = (rsvp: RsvpRow) => rsvp.event_id === series && rsvp.occurrence_date === occurrence;
    const others = localState.rsvps.filter((rsvp) => !(isSameSlot(rsvp) && rsvp.user_id === userId));
    if (status === 'going' && event.capacity && !event.allow_over_capacity) {
      const count = others.filter((rsvp) => isSameSlot(rsvp) && rsvp.status === 'going').length;
      if (count >= event.capacity) throw new Error('This event is full');
    }
    localState.rsvps = status
      ? [...others, { event_id: series, occurrence_date: occurrence, user_id: userId, status, created_at: toIso() }]
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
    const series = eventSeriesId(event);
    const others = localState.checkins.filter((row) =>
      !(row.event_id === series && row.occurrence_date === occurrence && row.user_id === userId));
    localState.checkins = here
      ? [...others, { event_id: series, occurrence_date: occurrence, user_id: userId, created_at: toIso() }]
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

  const remoteIds = new Set(remote.map((event) => event.id));
  const candidates = [
    ...remote,
    ...getLocalEvents().filter((event) => event.space_id === spaceId && !remoteIds.has(event.id)),
    ...localHosted,
  ].filter((event) => !(event.kind === 'one_time' && event.event_date && event.event_date < today));

  // One card per series: the mention with the soonest date, so "trivia every Tuesday" and
  // "trivia on the 13th" don't show up twice.
  const bySeries = new Map<string, { event: SpaceEvent; date: string; mentions: number }>();
  candidates.forEach((event) => {
    const date = nextOccurrenceDate(event);
    if (!date) return;
    const key = event.series_id || (event.source_type === 'hosted' ? event.id : seriesKey(event));
    const current = bySeries.get(key);
    if (!current) {
      bySeries.set(key, { event, date, mentions: 1 });
      return;
    }
    current.mentions += 1;
    if (date < current.date || (date === current.date && isBetterMention(event, current.event) > 0)) {
      current.event = event;
      current.date = date;
    }
  });

  const picks = Array.from(bySeries.values());
  const presence = await loadPresence(picks.map((pick) => eventSeriesId(pick.event)));
  return picks
    .map((pick) => applyPresence(
      { ...pick.event, mention_count: Math.max(pick.event.mention_count || 0, pick.mentions) },
      pick.date,
      presence,
      viewerId
    ))
    .filter((event) => canShowInLists(event, viewerId, true, true))
    .sort((first, second) => (first.occurrence_date || '9999').localeCompare(second.occurrence_date || '9999')
      || (first.start_time || '99:99').localeCompare(second.start_time || '99:99'));
}

const toMention = (event: SpaceEvent): EventMention => ({
  id: event.id,
  source_type: event.source_type,
  snippet: event.snippet,
  kind: event.kind,
  event_date: event.event_date,
  weekday: event.weekday,
  start_time: event.start_time,
  link_url: event.link_url,
  source_created_at: event.source_created_at,
  profile: event.profile,
});

/** Every review/description in the event's series, with the one being shown first and the rest newest first. */
export async function listEventMentions(event: SpaceEvent): Promise<EventMention[]> {
  if (event.source_type === 'hosted') return [];
  const series = eventSeriesId(event);
  let mentions: EventMention[] = [];

  if (!isLocalEventId(event.id) && supabase) {
    const { data, error } = await supabase
      .from('space_events')
      .select('id, source_type, source_user_id, snippet, kind, event_date, weekday, start_time, link_url, source_created_at')
      .eq('series_id', series)
      .neq('source_type', 'hosted')
      .limit(50);
    if (error) {
      console.warn('Could not load other mentions:', error.message);
    } else if (data) {
      const rows = data as Record<string, unknown>[];
      const profiles = await fetchProfilesByUserId(rows.map((row) => row.source_user_id).filter(Boolean).map(String));
      mentions = rows.map((row) => ({
        id: String(row.id),
        source_type: row.source_type as EventMention['source_type'],
        snippet: String(row.snippet),
        kind: row.kind as EventMention['kind'],
        event_date: (row.event_date as string | null) || undefined,
        weekday: (row.weekday as number | null) ?? undefined,
        start_time: (row.start_time as string | null) || undefined,
        link_url: (row.link_url as string | null) || undefined,
        source_created_at: String(row.source_created_at),
        profile: row.source_user_id ? profiles[String(row.source_user_id)] : undefined,
      }));
    }
  } else {
    mentions = getLocalEvents()
      .filter((candidate) => candidate.source_type !== 'hosted' && eventSeriesId(candidate) === series)
      .map(toMention);
  }

  const others = mentions
    .filter((mention) => mention.id !== event.id)
    .sort((first, second) => second.source_created_at.localeCompare(first.source_created_at));
  return [toMention(event), ...others];
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

function chatDatesFor(event: SpaceEvent, userId: string, rsvps: { event_id: string; occurrence_date: string }[]) {
  const series = eventSeriesId(event);
  const dates = new Set<string>();
  rsvps
    .filter((rsvp) => rsvp.event_id === event.id || rsvp.event_id === series)
    .forEach((rsvp) => dates.add(rsvp.occurrence_date));
  if (event.host_user_id === userId) {
    const next = nextOccurrenceDate(event);
    if (next) dates.add(next);
    if (event.kind === 'weekly' && event.weekday !== undefined) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (parseDateKey(toDateKey(yesterday)).getDay() === event.weekday) dates.add(toDateKey(yesterday));
    }
  }
  return Array.from(dates).filter((date) => isChatOpen(date));
}

function withChatAccess(event: SpaceEvent, userId: string, date: string, going: boolean): SpaceEvent {
  return { ...event, occurrence_date: date, viewer_going: going || event.viewer_going };
}

function latestMessage(messages: EventMessage[], eventId: string, date: string) {
  return messages
    .filter((message) => message.event_id === eventId && message.occurrence_date === date)
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
}

/** The host and people going for that date are in the chat, and it closes the day after the event. */
export function canUseEventChat(event: SpaceEvent, viewerId?: string) {
  if (!viewerId || event.cancelled_at || !event.occurrence_date) return false;
  if (!isChatOpen(event.occurrence_date)) return false;
  return event.host_user_id === viewerId || event.viewer_going;
}

/** Checked-in people only, and only while the hangout is still live. */
export function canUseHereChat(event: SpaceEvent, viewerId?: string) {
  if (!viewerId || !event.occurrence_date || event.cancelled_at || !event.viewer_here) return false;
  return getEventPhase(event, event.occurrence_date) === 'live';
}

const hereChatListeners = new Map<string, Set<MessageListener>>();

export async function listHereMessages(event: SpaceEvent, date: string): Promise<EventMessage[]> {
  if (getEventPhase(event, date) !== 'live') return [];
  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId) || !canUseUserScopedRemote(event.host_user_id || '')) {
    return localState.hereMessages
      .filter((message) => message.event_id === seriesId && message.occurrence_date === date)
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
      .map((message) => ({ ...message, profile: findLocalProfile(message.user_id) || message.profile }));
  }

  const { data, error } = await supabase
    .from('here_messages')
    .select('*')
    .eq('event_id', seriesId)
    .eq('occurrence_date', date)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  const profiles = await fetchProfilesByUserId(rows.map((row) => String(row.user_id)));
  return rows.map((row) => mapMessageRow(row, profiles));
}

export async function sendHereMessage(userId: string, event: SpaceEvent, body: string): Promise<EventMessage> {
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (text.length > MAX_EVENT_MESSAGE_LENGTH) throw new Error(`Keep it under ${MAX_EVENT_MESSAGE_LENGTH} characters.`);
  if (!canUseHereChat(event, userId) || !event.occurrence_date) throw new Error('Check in while the hangout is live to join this chat.');
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to chat');

  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId) || !canUseUserScopedRemote(userId)) {
    const message: EventMessage = {
      id: createId('here'),
      event_id: seriesId,
      occurrence_date: event.occurrence_date,
      user_id: userId,
      body: text,
      created_at: toIso(),
      profile: findLocalProfile(userId),
    };
    localState.hereMessages.push(message);
    hereChatListeners.get(chatKey(seriesId, event.occurrence_date))?.forEach((listener) => listener(message));
    return message;
  }

  const { data, error } = await supabase
    .from('here_messages')
    .insert({ event_id: seriesId, occurrence_date: event.occurrence_date, user_id: userId, body: text })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const profiles = await fetchProfilesByUserId([userId]);
  return mapMessageRow(data as Record<string, unknown>, profiles);
}

export function subscribeToHereMessages(event: SpaceEvent, date: string, onMessage: MessageListener): () => void {
  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId)) {
    const key = chatKey(seriesId, date);
    const listeners = hereChatListeners.get(key) || new Set<MessageListener>();
    listeners.add(onMessage);
    hereChatListeners.set(key, listeners);
    return () => { listeners.delete(onMessage); };
  }

  const channel = supabase
    .channel(`here-chat-${seriesId}-${date}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'here_messages', filter: `event_id=eq.${seriesId}` },
      async (payload: { new: Record<string, unknown> }) => {
        if (String(payload.new.occurrence_date) !== date) return;
        const profiles = await fetchProfilesByUserId([String(payload.new.user_id)]);
        onMessage(mapMessageRow(payload.new, profiles));
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

function localMessageableIds(userId: string) {
  seedDemoGroups();
  seedDemoHosted();
  const ids = new Set<string>();
  localState.following.forEach((id) => {
    if (localState.followers.has(id)) ids.add(id);
  });
  const myGroups = new Set(localState.groupMembers.filter((member) => member.user_id === userId).map((member) => member.group_id));
  localState.groupMembers.forEach((member) => {
    if (myGroups.has(member.group_id)) ids.add(member.user_id);
  });
  [...localState.eventInvites, ...localState.groupInvites].forEach((invite) => {
    if (invite.invitee_user_id === userId) ids.add(invite.invited_by);
    if (invite.invited_by === userId) ids.add(invite.invitee_user_id);
  });
  const myEvents = new Set<string>();
  (localState.hostedEvents || []).forEach((event) => {
    if (event.host_user_id === userId) myEvents.add(event.id);
  });
  localState.rsvps.forEach((rsvp) => {
    if (rsvp.user_id === userId && rsvp.status === 'going') myEvents.add(rsvp.event_id);
  });
  localState.checkins.forEach((checkin) => {
    if (checkin.user_id === userId) myEvents.add(checkin.event_id);
  });
  (localState.hostedEvents || []).forEach((event) => {
    if (myEvents.has(event.id) && event.host_user_id) ids.add(event.host_user_id);
  });
  localState.rsvps.forEach((rsvp) => {
    if (myEvents.has(rsvp.event_id) && rsvp.status === 'going') ids.add(rsvp.user_id);
  });
  localState.checkins.forEach((checkin) => {
    if (myEvents.has(checkin.event_id)) ids.add(checkin.user_id);
  });
  localState.directMessages.forEach((message) => {
    if (message.sender_id === userId) ids.add(message.recipient_id);
    if (message.recipient_id === userId) ids.add(message.sender_id);
  });
  ids.delete(userId);
  return ids;
}

export async function listMessageablePeople(userId: string): Promise<Profile[]> {
  if (!canUseUserScopedRemote(userId)) {
    return Array.from(localMessageableIds(userId))
      .map((id) => findLocalProfile(id))
      .filter((profile): profile is Profile => Boolean(profile))
      .sort((first, second) => getDisplayName(first).localeCompare(getDisplayName(second)));
  }

  const { data, error } = await supabase.rpc('list_messageable_people');
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set(((data || []) as { user_id: string }[]).map((row) => row.user_id).filter((id) => id && id !== userId)));
  const profiles = await fetchProfilesByUserId(ids);
  return ids
    .map((id) => profiles[id])
    .filter((profile): profile is Profile => Boolean(profile))
    .sort((first, second) => getDisplayName(first).localeCompare(getDisplayName(second)));
}

function otherPerson(message: DirectMessage, userId: string) {
  return message.sender_id === userId ? message.recipient_id : message.sender_id;
}

export async function listDirectThreads(userId: string): Promise<DirectThread[]> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    const mine = localState.directMessages.filter((message) => message.sender_id === userId || message.recipient_id === userId);
    const byUser = new Map<string, DirectMessage>();
    mine.forEach((message) => {
      const other = otherPerson(message, userId);
      const current = byUser.get(other);
      if (!current || message.created_at > current.created_at) byUser.set(other, message);
    });
    return Array.from(byUser.entries())
      .map(([other, last]) => ({ user_id: other, profile: findLocalProfile(other), last_message: { ...last, profile: findLocalProfile(last.sender_id) } }))
      .sort((first, second) => second.last_message.created_at.localeCompare(first.last_message.created_at));
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  const profiles = await fetchProfilesByUserId(rows.flatMap((row) => [String(row.sender_id), String(row.recipient_id)]));
  const byUser = new Map<string, DirectMessage>();
  rows.forEach((row) => {
    const message: DirectMessage = {
      id: String(row.id),
      sender_id: String(row.sender_id),
      recipient_id: String(row.recipient_id),
      body: String(row.body || ''),
      created_at: String(row.created_at),
      profile: profiles[String(row.sender_id)],
    };
    const other = otherPerson(message, userId);
    if (!byUser.has(other)) byUser.set(other, message);
  });
  return Array.from(byUser.entries()).map(([other, last]) => ({
    user_id: other,
    profile: profiles[other],
    last_message: last,
  }));
}

export async function listDirectMessages(userId: string, otherUserId: string): Promise<DirectMessage[]> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    return localState.directMessages
      .filter((message) =>
        (message.sender_id === userId && message.recipient_id === otherUserId)
        || (message.sender_id === otherUserId && message.recipient_id === userId))
      .sort((first, second) => first.created_at.localeCompare(second.created_at))
      .map((message) => ({ ...message, profile: findLocalProfile(message.sender_id) }));
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  const profiles = await fetchProfilesByUserId(rows.map((row) => String(row.sender_id)));
  return rows.map((row) => ({
    id: String(row.id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    body: String(row.body || ''),
    created_at: String(row.created_at),
    profile: profiles[String(row.sender_id)],
  }));
}

export async function sendDirectMessage(userId: string, otherUserId: string, body: string): Promise<DirectMessage> {
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (text.length > MAX_EVENT_MESSAGE_LENGTH) throw new Error(`Keep it under ${MAX_EVENT_MESSAGE_LENGTH} characters.`);
  if (otherUserId === userId) throw new Error('You cannot message yourself.');
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error('Sign in to send a message');
  if (!canUseUserScopedRemote(userId) && !localMessageableIds(userId).has(otherUserId)) {
    throw new Error('You can message people you share a hangout, group, invite, or mutual follow with.');
  }

  if (canUseUserScopedRemote(userId)) {
    const { data: allowed, error: accessError } = await supabase.rpc('can_message_user', { other_user: otherUserId });
    if (accessError) throw new Error(accessError.message);
    if (!allowed) throw new Error('You can message people you share a hangout, group, invite, or mutual follow with.');
  }

  if (!canUseUserScopedRemote(userId)) {
    const message: DirectMessage = {
      id: createId('dm'),
      sender_id: userId,
      recipient_id: otherUserId,
      body: text,
      created_at: toIso(),
      profile: findLocalProfile(userId),
    };
    localState.directMessages.push(message);
    return message;
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: userId, recipient_id: otherUserId, body: text })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const profiles = await fetchProfilesByUserId([userId]);
  return {
    id: String(data.id),
    sender_id: userId,
    recipient_id: otherUserId,
    body: text,
    created_at: String(data.created_at),
    profile: profiles[userId],
  };
}

export async function listMyChats(userId: string): Promise<ChatThread[]> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoHosted();
    const events = getLocalHosted(userId).filter((event) => !event.cancelled_at);
    const threads = events.flatMap((event) => chatDatesFor(event, userId, localState.rsvps.filter((rsvp) => rsvp.status === 'going')).flatMap((date) => {
      const going = localState.rsvps.some((rsvp) => rsvp.event_id === eventSeriesId(event) && rsvp.occurrence_date === date && rsvp.user_id === userId && rsvp.status === 'going');
      const threaded = withChatAccess(event, userId, date, going);
      if (!canUseEventChat(threaded, userId)) return [];
      return [{
        event: threaded,
        occurrence_date: date,
        last_message: latestMessage(localState.messages, eventSeriesId(event), date),
      }];
    }));
    const hereThreads = events.flatMap((event) => {
      const date = event.event_date;
      if (!date) return [];
      const here = localState.checkins.some((checkin) => checkin.event_id === eventSeriesId(event) && checkin.occurrence_date === date && checkin.user_id === userId);
      const threaded = { ...event, occurrence_date: date, viewer_here: here };
      if (!canUseHereChat(threaded, userId)) return [];
      return [{
        event: threaded,
        occurrence_date: date,
        kind: 'here' as const,
        last_message: latestMessage(localState.hereMessages, eventSeriesId(event), date),
      }];
    });
    return [...hereThreads, ...threads].sort((first, second) => (second.last_message?.created_at || second.occurrence_date).localeCompare(first.last_message?.created_at || first.occurrence_date));
  }

  const since = new Date();
  since.setDate(since.getDate() - 1);
  const sinceKey = toDateKey(since);
  const [hostedResult, rsvpResult] = await Promise.all([
    supabase.from('space_events').select('*, spaces!inner(*)').eq('host_user_id', userId).is('cancelled_at', null),
    supabase.from('event_rsvps').select('event_id, occurrence_date').eq('user_id', userId).eq('status', 'going').gte('occurrence_date', sinceKey),
  ]);
  if (hostedResult.error) throw new Error(hostedResult.error.message);
  if (rsvpResult.error) throw new Error(rsvpResult.error.message);

  const hostedRows = (hostedResult.data || []) as Record<string, unknown>[];
  const rsvps = (rsvpResult.data || []) as { event_id: string; occurrence_date: string }[];
  const known = new Set(hostedRows.map((row) => String(row.id)));
  const missing = Array.from(new Set(rsvps.map((rsvp) => rsvp.event_id).filter((id) => !known.has(id))));
  let extraRows: Record<string, unknown>[] = [];
  if (missing.length > 0) {
    const extra = await supabase.from('space_events').select('*, spaces!inner(*)').in('id', missing).is('cancelled_at', null);
    if (extra.error) throw new Error(extra.error.message);
    extraRows = (extra.data || []) as Record<string, unknown>[];
  }

  const rows = [...hostedRows, ...extraRows];
  const profiles = await fetchProfilesByUserId(rows.map((row) => String(row.host_user_id || '')).filter(isUuid));
  const events = rows.map((row) => {
    const stored = mapStoredEventRow(row);
    const hostId = stored.host_user_id;
    return rowToSpaceEvent(stored, mapSpaceRow(row.spaces as Record<string, unknown>), hostId ? profiles[hostId] : undefined);
  });

  const threads = events.flatMap((event) => chatDatesFor(event, userId, rsvps).flatMap((date) => {
    const series = eventSeriesId(event);
    const going = rsvps.some((rsvp) => (rsvp.event_id === event.id || rsvp.event_id === series) && rsvp.occurrence_date === date);
    const threaded = withChatAccess(event, userId, date, going);
    if (!canUseEventChat(threaded, userId)) return [];
    return [{ event: threaded, occurrence_date: date }];
  }));
  const seen = new Set<string>();
  const unique: ChatThread[] = threads.filter((thread) => {
    const key = `${eventSeriesId(thread.event)}|${thread.occurrence_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const checkinResult = await supabase.from('event_checkins').select('event_id, occurrence_date').eq('user_id', userId).gte('occurrence_date', sinceKey);
  if (!checkinResult.error) {
    const checkins = (checkinResult.data || []) as { event_id: string; occurrence_date: string }[];
    checkins.forEach((checkin) => {
      const event = events.find((item) => item.id === checkin.event_id || eventSeriesId(item) === checkin.event_id);
      if (!event) return;
      const threaded = { ...event, occurrence_date: checkin.occurrence_date, viewer_here: true };
      if (!canUseHereChat(threaded, userId)) return;
      const key = `here|${eventSeriesId(event)}|${checkin.occurrence_date}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ event: threaded, occurrence_date: checkin.occurrence_date, kind: 'here' });
    });
  }

  if (unique.length === 0) return [];

  const goingIds = Array.from(new Set(unique.filter((thread) => thread.kind !== 'here').map((thread) => eventSeriesId(thread.event))));
  const messageResult = goingIds.length === 0
    ? { data: [], error: null }
    : await supabase
    .from('event_messages')
    .select('*')
    .in('event_id', goingIds)
    .gte('occurrence_date', sinceKey)
    .order('created_at', { ascending: false })
    .limit(400);
  if (messageResult.error) throw new Error(messageResult.error.message);
  const messageRows = (messageResult.data || []) as Record<string, unknown>[];
  const messageProfiles = await fetchProfilesByUserId(messageRows.map((row) => String(row.user_id)));
  const messages = messageRows.map((row) => mapMessageRow(row, messageProfiles));
  const hereIds = Array.from(new Set(unique.filter((thread) => thread.kind === 'here').map((thread) => eventSeriesId(thread.event))));
  let hereRows: Record<string, unknown>[] = [];
  if (hereIds.length > 0) {
    const hereResult = await supabase.from('here_messages').select('*').in('event_id', hereIds).gte('occurrence_date', sinceKey).order('created_at', { ascending: false }).limit(200);
    if (!hereResult.error) hereRows = (hereResult.data || []) as Record<string, unknown>[];
  }
  const hereProfiles = await fetchProfilesByUserId(hereRows.map((row) => String(row.user_id)));
  const hereMessages = hereRows.map((row) => mapMessageRow(row, hereProfiles));

  return unique
    .map((thread) => ({
      ...thread,
      last_message: latestMessage(thread.kind === 'here' ? hereMessages : messages, eventSeriesId(thread.event), thread.occurrence_date),
    }))
    .sort((first, second) => (second.last_message?.created_at || second.occurrence_date).localeCompare(first.last_message?.created_at || first.occurrence_date));
}

export async function listEventMessages(event: SpaceEvent, date: string): Promise<EventMessage[]> {
  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId)) {
    if (!isChatOpen(date)) return [];
    return byCreatedAtDesc(localState.messages.filter((message) => message.event_id === seriesId && message.occurrence_date === date))
      .reverse()
      .map((message) => ({ ...message, profile: findLocalProfile(message.user_id) }));
  }

  const { data, error } = await supabase
    .from('event_messages')
    .select('*')
    .eq('event_id', seriesId)
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

  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId) || !canUseUserScopedRemote(userId)) {
    const message: EventMessage = {
      id: createId('message'),
      event_id: seriesId,
      occurrence_date: event.occurrence_date,
      user_id: userId,
      body: text,
      created_at: toIso(),
      profile: findLocalProfile(userId),
    };
    localState.messages.push(message);
    localChatListeners.get(chatKey(seriesId, event.occurrence_date))?.forEach((listener) => listener(message));
    return message;
  }

  const { data, error } = await supabase
    .from('event_messages')
    .insert({ event_id: seriesId, occurrence_date: event.occurrence_date, user_id: userId, body: text })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const profiles = await fetchProfilesByUserId([userId]);
  return mapMessageRow(data as Record<string, unknown>, profiles);
}

/** Calls `onMessage` for every new message in the chat. Returns an unsubscribe function. */
export function subscribeToEventMessages(event: SpaceEvent, date: string, onMessage: MessageListener): () => void {
  const seriesId = eventSeriesId(event);
  if (isLocalEventId(seriesId)) {
    const key = chatKey(seriesId, date);
    const listeners = localChatListeners.get(key) || new Set<MessageListener>();
    listeners.add(onMessage);
    localChatListeners.set(key, listeners);
    return () => {
      listeners.delete(onMessage);
    };
  }

  const channel = supabase
    .channel(`event-chat-${seriesId}-${date}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${seriesId}` },
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

let seedingGroups = false;

function seedDemoGroups() {
  if (localState.groups || seedingGroups) return;
  seedingGroups = true;
  try {
    seedDemoHosted();
    const timestamp = toIso();
    const cafeId = '00000000-0000-0000-0000-000000000101';
    localState.groups = [
      {
        id: 'group-company',
        name: 'Company hangout',
        description: 'The team, off the clock.',
        visibility: 'private',
        invite_token: 'demo-company-invite',
        created_by: demoCurrentUserId,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: 'group-arlington',
        name: 'Arlington girls',
        description: 'What is happening around Arlington.',
        visibility: 'public',
        invite_token: 'demo-arlington-invite',
        created_by: 'user-nina',
        created_at: timestamp,
        updated_at: timestamp,
      },
    ];
    localState.groupMembers.push(
      { group_id: 'group-company', user_id: demoCurrentUserId, role: 'owner', created_at: timestamp },
      { group_id: 'group-company', user_id: 'user-mike', role: 'member', created_at: timestamp },
      { group_id: 'group-arlington', user_id: 'user-nina', role: 'owner', created_at: timestamp },
    );
    if (!localState.eventGroups.some((link) => link.event_id === DEMO_COFFEE_EVENT && link.group_id === 'group-company')) {
      localState.eventGroups.push({ event_id: DEMO_COFFEE_EVENT, group_id: 'group-company' });
    }
    if (localState.spaces.some((space) => space.id === cafeId)) {
      localState.groupSpots.push({ group_id: 'group-company', space_id: cafeId, added_by: demoCurrentUserId, created_at: timestamp });
    }
    localState.groupInvites.push({
      target_id: 'group-arlington',
      invitee_user_id: demoCurrentUserId,
      invited_by: 'user-nina',
      status: 'pending',
      created_at: timestamp,
    });
  } finally {
    seedingGroups = false;
  }
}

function hasGroupEventAccess(eventId: string, viewerId?: string) {
  if (!viewerId) return false;
  seedDemoGroups();
  const invited = localState.eventInvites.some((invite) =>
    invite.target_id === eventId
    && invite.invitee_user_id === viewerId
    && (invite.status === 'pending' || invite.status === 'accepted')
  );
  if (invited) return true;
  const groupIds = new Set(localState.eventGroups.filter((link) => link.event_id === eventId).map((link) => link.group_id));
  return localState.groupMembers.some((member) => member.user_id === viewerId && groupIds.has(member.group_id));
}

function presentGroup(stored: StoredGroup, viewerId?: string): Group {
  const members = localState.groupMembers.filter((member) => member.group_id === stored.id);
  const viewer = viewerId ? members.find((member) => member.user_id === viewerId) : undefined;
  const invite = viewerId
    ? localState.groupInvites.find((item) => item.target_id === stored.id && item.invitee_user_id === viewerId)
    : undefined;
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    visibility: stored.visibility,
    invite_token: viewer ? stored.invite_token : undefined,
    created_by: stored.created_by,
    created_at: stored.created_at,
    updated_at: stored.updated_at,
    member_count: members.length,
    viewer_role: viewer?.role,
    invite_status: invite?.status,
  };
}

function canSeeLocalGroup(stored: StoredGroup, viewerId?: string, token?: string) {
  if (stored.visibility === 'public') return true;
  if (viewerId && localState.groupMembers.some((member) => member.group_id === stored.id && member.user_id === viewerId)) return true;
  if (viewerId && localState.groupInvites.some((invite) =>
    invite.target_id === stored.id
    && invite.invitee_user_id === viewerId
    && (invite.status === 'pending' || invite.status === 'accepted')
  )) return true;
  return Boolean(token && token === stored.invite_token);
}

function mapFetchedGroup(payload: Record<string, unknown> | null): Group | null {
  const row = payload?.group as Record<string, unknown> | undefined;
  if (!row?.id) return null;
  const role = payload?.viewer_role;
  const status = payload?.invite_status;
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) || undefined,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    invite_token: (row.invite_token as string | null) || undefined,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    member_count: Number(payload?.member_count || 0),
    viewer_role: role === 'owner' || role === 'member' ? role : undefined,
    invite_status: status === 'pending' || status === 'accepted' || status === 'declined' ? status : undefined,
  };
}

function groupFromRow(row: Record<string, unknown>, viewerId: string, members: { group_id: string; user_id: string; role: string }[]): Group {
  const mine = members.filter((member) => member.group_id === String(row.id));
  const viewer = mine.find((member) => member.user_id === viewerId);
  const role = viewer?.role;
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) || undefined,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    invite_token: viewer ? ((row.invite_token as string | null) || undefined) : undefined,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    member_count: mine.length,
    viewer_role: role === 'owner' || role === 'member' ? role : undefined,
  };
}

async function memberRowsFor(groupIds: string[]) {
  if (!supabase || groupIds.length === 0) return [];
  const { data, error } = await supabase.from('group_members').select('group_id, user_id, role').in('group_id', groupIds);
  if (error) throw new Error(error.message);
  return (data || []) as { group_id: string; user_id: string; role: string }[];
}

function requireGroupUser(userId: string, message: string) {
  if (isSupabaseConfigured && supabase && !isUuid(userId)) throw new Error(message);
}

function assertLocalFollow(userId: string, inviteeId: string) {
  if (inviteeId === userId) throw new Error('You can only invite someone else');
  if (!localState.following.has(inviteeId)) throw new Error('You can only invite people you follow');
}

function upsertLocalInvite(bucket: LocalInvite[], targetId: string, inviteeId: string, invitedBy: string) {
  const existing = bucket.find((invite) => invite.target_id === targetId && invite.invitee_user_id === inviteeId);
  if (!existing) {
    bucket.push({
      target_id: targetId,
      invitee_user_id: inviteeId,
      invited_by: invitedBy,
      status: 'pending',
      created_at: toIso(),
    });
    return;
  }
  if (existing.status === 'declined') {
    existing.status = 'pending';
    existing.invited_by = invitedBy;
    existing.created_at = toIso();
  }
}

export async function listMyGroups(userId: string): Promise<Group[]> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoGroups();
    return (localState.groups || [])
      .filter((group) => localState.groupMembers.some((member) => member.group_id === group.id && member.user_id === userId))
      .map((group) => presentGroup(group, userId));
  }

  const { data, error } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const ids = ((data || []) as { group_id: string }[]).map((row) => row.group_id);
  if (ids.length === 0) return [];
  const [{ data: rows, error: groupError }, members] = await Promise.all([
    supabase.from('groups').select('*').in('id', ids),
    memberRowsFor(ids),
  ]);
  if (groupError) throw new Error(groupError.message);
  return ((rows || []) as Record<string, unknown>[]).map((row) => groupFromRow(row, userId, members));
}

export async function listPublicGroups(viewerId = demoCurrentUserId): Promise<Group[]> {
  if (!canUseUserScopedRemote(viewerId)) {
    seedDemoGroups();
    return (localState.groups || [])
      .filter((group) => group.visibility === 'public')
      .map((group) => presentGroup(group, viewerId));
  }

  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  const members = await memberRowsFor(rows.map((row) => String(row.id)));
  return rows.map((row) => groupFromRow(row, viewerId, members));
}

export async function getGroup(groupId: string, viewerId?: string, token?: string): Promise<Group | null> {
  if (!isUuid(groupId) || !canUseUserScopedRemote(viewerId || '')) {
    seedDemoGroups();
    const stored = localState.groups?.find((group) => group.id === groupId);
    if (!stored || !canSeeLocalGroup(stored, viewerId, token)) return null;
    return presentGroup(stored, viewerId);
  }

  const { data, error } = await supabase.rpc('fetch_group', { target_id: groupId, token: token || null });
  if (error) throw new Error(error.message);
  return mapFetchedGroup((data || null) as Record<string, unknown> | null);
}

export async function getGroupDetail(groupId: string, viewerId: string, token?: string): Promise<GroupDetail | null> {
  const group = await getGroup(groupId, viewerId, token);
  if (!group) return null;
  const contentVisible = group.visibility === 'public' || Boolean(group.viewer_role);
  if (!contentVisible) {
    return { group, members: [], events: [], spots: [], feed: [], content_visible: false };
  }

  if (!isUuid(groupId) || !canUseUserScopedRemote(viewerId)) {
    seedDemoGroups();
    const members = localMembers(groupId);
    const memberIds = members.map((member) => member.user_id);
    const feed = (await listRecentActivity({ currentUserId: viewerId, authorIds: memberIds })).slice(0, 40);
    const linkedIds = new Set(localState.eventGroups.filter((link) => link.group_id === groupId).map((link) => link.event_id));
    const events = getLocalHosted(viewerId)
      .filter((event) => linkedIds.has(event.id) && !event.cancelled_at)
      .filter((event) => event.visibility !== 'private' || Boolean(group.viewer_role))
      .sort((first, second) => (first.event_date || '').localeCompare(second.event_date || ''));
    const spots = collectSpots(groupId, feed, events);
    return { group, members, events, spots, feed, content_visible: true };
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('group_id, user_id, role, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (memberError) throw new Error(memberError.message);
  const memberRecords = (memberRows || []) as { group_id: string; user_id: string; role: GroupRole; created_at: string }[];
  const profiles = await fetchProfilesByUserId(memberRecords.map((member) => member.user_id));
  const members: GroupMember[] = memberRecords.map((member) => ({
    ...member,
    role: member.role === 'owner' ? 'owner' : 'member',
    profile: profiles[member.user_id] || placeholderProfile(member.user_id, member.created_at),
  }));

  const { data: linkRows, error: linkError } = await supabase
    .from('event_groups')
    .select('space_events!inner(*, spaces!inner(*))')
    .eq('group_id', groupId);
  if (linkError) throw new Error(linkError.message);
  const eventRows = ((linkRows || []) as Record<string, unknown>[])
    .map((row) => row.space_events as Record<string, unknown> | null)
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const hostProfiles = await fetchProfilesByUserId(eventRows.map((row) => String(row.host_user_id || '')).filter(isUuid));
  const mappedEvents = eventRows.map((row) => {
    const stored = mapStoredEventRow(row);
    const hostId = stored.host_user_id;
    return rowToSpaceEvent(stored, mapSpaceRow(row.spaces as Record<string, unknown>), hostId ? hostProfiles[hostId] : undefined);
  }).filter((event) => !event.cancelled_at);
  const presence = await loadPresence(mappedEvents.map((event) => eventSeriesId(event)));
  const events = mappedEvents
    .map((event) => applyPresence(event, event.event_date, presence, viewerId))
    .sort((first, second) => (first.event_date || '').localeCompare(second.event_date || ''));

  const feed = await listRecentActivity({
    currentUserId: viewerId,
    authorIds: members.map((member) => member.user_id),
  });

  const { data: spotRows, error: spotError } = await supabase
    .from('group_spots')
    .select('space_id, spaces(*)')
    .eq('group_id', groupId);
  if (spotError) throw new Error(spotError.message);
  const saved = ((spotRows || []) as Record<string, unknown>[])
    .map((row) => row.spaces as Record<string, unknown> | null)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => mapSpaceRow(row));
  const spots = mergeSpots(saved, feed, events);
  return { group, members, events, spots, feed, content_visible: true };
}

function localMembers(groupId: string): GroupMember[] {
  return localState.groupMembers
    .filter((member) => member.group_id === groupId)
    .map((member) => ({
      ...member,
      profile: findLocalProfile(member.user_id) || placeholderProfile(member.user_id, member.created_at),
    }));
}

function collectSpots(groupId: string, feed: FeedActivity[], events: SpaceEvent[]) {
  const saved = localState.groupSpots
    .filter((spot) => spot.group_id === groupId)
    .map((spot) => localState.spaces.find((space) => space.id === spot.space_id))
    .filter((space): space is SpaceWithAttributes => Boolean(space));
  return mergeSpots(saved, feed, events);
}

function mergeSpots(saved: SpaceWithAttributes[], feed: FeedActivity[], events: SpaceEvent[]) {
  const byId = new Map<string, SpaceWithAttributes>();
  saved.forEach((space) => byId.set(space.id, space));
  feed.forEach((item) => {
    if (!byId.has(item.space.id)) byId.set(item.space.id, item.space);
  });
  events.forEach((event) => {
    if (!byId.has(event.space.id)) byId.set(event.space.id, event.space);
  });
  return Array.from(byId.values());
}

export async function createGroup(userId: string, input: CreateGroupInput): Promise<Group> {
  const name = input.name.trim();
  const description = input.description?.trim();
  if (!name || name.length > 60) throw new Error('Give it a name, up to 60 characters.');
  if (description && description.length > 280) throw new Error('Keep the description under 280 characters.');
  requireGroupUser(userId, 'Sign in to create a group');

  if (!canUseUserScopedRemote(userId)) {
    seedDemoGroups();
    const timestamp = toIso();
    const stored: StoredGroup = {
      id: createId('group'),
      name,
      description: description || undefined,
      visibility: input.visibility,
      invite_token: createToken(),
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    localState.groups?.push(stored);
    localState.groupMembers.push({ group_id: stored.id, user_id: userId, role: 'owner', created_at: timestamp });
    return presentGroup(stored, userId);
  }

  const { data, error } = await supabase.rpc('create_group', {
    group_name: name,
    group_description: description || '',
    group_visibility: input.visibility,
  });
  if (error) throw new Error(error.message);
  const group = mapFetchedGroup(data as Record<string, unknown>);
  if (!group) throw new Error('Could not create the group');
  return group;
}

export async function joinGroup(userId: string, groupId: string, token?: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to join a group');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    seedDemoGroups();
    const stored = localState.groups?.find((group) => group.id === groupId);
    if (!stored) throw new Error('Group not found');
    const invite = localState.groupInvites.find((item) => item.target_id === groupId && item.invitee_user_id === userId);
    const already = localState.groupMembers.some((member) => member.group_id === groupId && member.user_id === userId);
    if (!already) {
      const allowed = stored.visibility === 'public'
        || Boolean(token && token === stored.invite_token)
        || invite?.status === 'accepted';
      if (!allowed) throw new Error('You need an invite to join');
      localState.groupMembers.push({ group_id: groupId, user_id: userId, role: 'member', created_at: toIso() });
    }
    if (invite && invite.status === 'pending') invite.status = 'accepted';
    return;
  }

  const { error } = await supabase.rpc('join_group', { target_id: groupId, token: token || null });
  if (error) throw new Error(error.message);
}

export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to leave a group');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    seedDemoGroups();
    const membership = localState.groupMembers.find((member) => member.group_id === groupId && member.user_id === userId);
    if (!membership) return;
    const others = localState.groupMembers
      .filter((member) => member.group_id === groupId && member.user_id !== userId)
      .sort((first, second) => first.created_at.localeCompare(second.created_at) || first.user_id.localeCompare(second.user_id));
    if (membership.role === 'owner' && others.length === 0) {
      localState.groups = (localState.groups || []).filter((group) => group.id !== groupId);
      localState.groupMembers = localState.groupMembers.filter((member) => member.group_id !== groupId);
      localState.eventGroups = localState.eventGroups.filter((link) => link.group_id !== groupId);
      localState.groupSpots = localState.groupSpots.filter((spot) => spot.group_id !== groupId);
      localState.groupInvites = localState.groupInvites.filter((invite) => invite.target_id !== groupId);
      return;
    }
    if (membership.role === 'owner' && others[0]) others[0].role = 'owner';
    localState.groupMembers = localState.groupMembers.filter((member) => !(member.group_id === groupId && member.user_id === userId));
    return;
  }

  const { error } = await supabase.rpc('leave_group', { target_id: groupId });
  if (error) throw new Error(error.message);
}

export async function removeGroupMember(userId: string, groupId: string, memberId: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to manage this group');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    seedDemoGroups();
    const viewer = localState.groupMembers.find((member) => member.group_id === groupId && member.user_id === userId);
    if (!viewer || viewer.role !== 'owner') throw new Error('Only the owner can remove members');
    if (memberId === userId) throw new Error('Leave the group to remove yourself');
    localState.groupMembers = localState.groupMembers.filter((member) => !(member.group_id === groupId && member.user_id === memberId && member.role !== 'owner'));
    return;
  }

  const { error } = await supabase.rpc('remove_group_member', { target_id: groupId, member_id: memberId });
  if (error) throw new Error(error.message);
}

export async function saveGroupSpot(userId: string, groupId: string, spaceId: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to save a spot');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    seedDemoGroups();
    const member = localState.groupMembers.some((item) => item.group_id === groupId && item.user_id === userId);
    if (!member) throw new Error('Join the group to save a spot');
    if (!localState.groupSpots.some((spot) => spot.group_id === groupId && spot.space_id === spaceId)) {
      localState.groupSpots.push({ group_id: groupId, space_id: spaceId, added_by: userId, created_at: toIso() });
    }
    return;
  }

  const { error } = await supabase.from('group_spots').insert({ group_id: groupId, space_id: spaceId, added_by: userId });
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function listOutgoingInvites(kind: 'event' | 'group', targetId: string, userId: string): Promise<Record<string, InviteStatus>> {
  const localBucket = kind === 'event' ? localState.eventInvites : localState.groupInvites;
  const fromLocal = () => {
    if (kind === 'group') seedDemoGroups();
    const statuses: Record<string, InviteStatus> = {};
    localBucket
      .filter((invite) => invite.target_id === targetId)
      .forEach((invite) => { statuses[invite.invitee_user_id] = invite.status; });
    return statuses;
  };

  if (!canUseUserScopedRemote(userId) || !isUuid(targetId)) return fromLocal();

  const table = kind === 'event' ? 'event_invites' : 'group_invites';
  const column = kind === 'event' ? 'event_id' : 'group_id';
  const { data, error } = await supabase.from(table).select('invitee_user_id, status').eq(column, targetId);
  if (error) throw new Error(error.message);
  const statuses: Record<string, InviteStatus> = {};
  ((data || []) as { invitee_user_id: string; status: InviteStatus }[]).forEach((row) => {
    statuses[row.invitee_user_id] = row.status;
  });
  return statuses;
}

export async function sendEventInvite(userId: string, eventId: string, inviteeId: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to invite someone');
  if (!canUseUserScopedRemote(userId) || !isUuid(eventId)) {
    seedDemoHosted();
    const event = localState.hostedEvents?.find((item) => item.id === eventId);
    if (!event || event.host_user_id !== userId) throw new Error('Only the host can invite people');
    assertLocalFollow(userId, inviteeId);
    upsertLocalInvite(localState.eventInvites, eventId, inviteeId, userId);
    return;
  }

  const { error } = await supabase.rpc('invite_to_event', { target_id: eventId, invitee: inviteeId });
  if (error) throw new Error(error.message);
}

export async function sendGroupInvite(userId: string, groupId: string, inviteeId: string): Promise<void> {
  requireGroupUser(userId, 'Sign in to invite someone');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    seedDemoGroups();
    const member = localState.groupMembers.some((item) => item.group_id === groupId && item.user_id === userId);
    if (!member) throw new Error('Only members can invite people');
    if (localState.groupMembers.some((item) => item.group_id === groupId && item.user_id === inviteeId)) {
      throw new Error('They are already in the group');
    }
    assertLocalFollow(userId, inviteeId);
    upsertLocalInvite(localState.groupInvites, groupId, inviteeId, userId);
    return;
  }

  const { error } = await supabase.rpc('invite_to_group', { target_id: groupId, invitee: inviteeId });
  if (error) throw new Error(error.message);
}

export async function respondToEventInvite(userId: string, eventId: string, status: 'accepted' | 'declined'): Promise<void> {
  requireGroupUser(userId, 'Sign in to respond');
  if (!canUseUserScopedRemote(userId) || !isUuid(eventId)) {
    const invite = localState.eventInvites.find((item) => item.target_id === eventId && item.invitee_user_id === userId && item.status === 'pending');
    if (!invite) throw new Error('Invite not found');
    invite.status = status;
    return;
  }

  const { error } = await supabase.rpc('respond_event_invite', { target_id: eventId, next_status: status });
  if (error) throw new Error(error.message);
}

export async function respondToGroupInvite(userId: string, groupId: string, status: 'accepted' | 'declined'): Promise<void> {
  requireGroupUser(userId, 'Sign in to respond');
  if (!canUseUserScopedRemote(userId) || !isUuid(groupId)) {
    const invite = localState.groupInvites.find((item) => item.target_id === groupId && item.invitee_user_id === userId && item.status === 'pending');
    if (!invite) throw new Error('Invite not found');
    invite.status = status;
    if (status === 'accepted') await joinGroup(userId, groupId);
    return;
  }

  const { error } = await supabase.rpc('respond_group_invite', { target_id: groupId, next_status: status });
  if (error) throw new Error(error.message);
}

export async function listIncomingInvites(userId: string): Promise<IncomingInvite[]> {
  if (!canUseUserScopedRemote(userId)) {
    seedDemoGroups();
    const invites: IncomingInvite[] = [];
    for (const invite of localState.eventInvites.filter((item) => item.invitee_user_id === userId && item.status === 'pending')) {
      const event = await getEvent(invite.target_id, userId);
      if (!event) continue;
      invites.push({
        kind: 'event',
        status: invite.status,
        created_at: invite.created_at,
        invited_by: findLocalProfile(invite.invited_by),
        event,
      });
    }
    for (const invite of localState.groupInvites.filter((item) => item.invitee_user_id === userId && item.status === 'pending')) {
      const group = await getGroup(invite.target_id, userId);
      if (!group) continue;
      invites.push({
        kind: 'group',
        status: invite.status,
        created_at: invite.created_at,
        invited_by: findLocalProfile(invite.invited_by),
        group,
      });
    }
    return invites.sort((first, second) => second.created_at.localeCompare(first.created_at));
  }

  const [eventResult, groupResult] = await Promise.all([
    supabase.from('event_invites').select('event_id, invited_by, status, created_at').eq('invitee_user_id', userId).eq('status', 'pending'),
    supabase.from('group_invites').select('group_id, invited_by, status, created_at').eq('invitee_user_id', userId).eq('status', 'pending'),
  ]);
  if (eventResult.error) throw new Error(eventResult.error.message);
  if (groupResult.error) throw new Error(groupResult.error.message);

  const eventRows = (eventResult.data || []) as { event_id: string; invited_by: string; status: InviteStatus; created_at: string }[];
  const groupRows = (groupResult.data || []) as { group_id: string; invited_by: string; status: InviteStatus; created_at: string }[];
  const profiles = await fetchProfilesByUserId([...eventRows.map((row) => row.invited_by), ...groupRows.map((row) => row.invited_by)]);
  const invites: IncomingInvite[] = [];

  for (const row of eventRows) {
    const event = await getEvent(row.event_id, userId);
    if (!event) continue;
    invites.push({
      kind: 'event',
      status: row.status,
      created_at: row.created_at,
      invited_by: profiles[row.invited_by],
      event,
    });
  }
  for (const row of groupRows) {
    const group = await getGroup(row.group_id, userId);
    if (!group) continue;
    invites.push({
      kind: 'group',
      status: row.status,
      created_at: row.created_at,
      invited_by: profiles[row.invited_by],
      group,
    });
  }
  return invites.sort((first, second) => second.created_at.localeCompare(first.created_at));
}
