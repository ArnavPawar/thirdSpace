import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Clock, ExternalLink, Heart, KeyRound, Lock, MapPin, MessageCircle, Navigation, Phone, Plus, Share2 } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import EventCard from '@/components/EventCard';
import FeedCard from '@/components/FeedCard';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoViewer from '@/components/PhotoViewer';
import { CategoryIcon, EmptyState, OpenStatusBadge, PrimaryButton, ScorePill, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getSpaceDetails, listSpaceEvents, listSpacePhotos, toggleFavorite } from '@/lib/data';
import { toDateKey } from '@/lib/events';
import { openDirections, openExternalUrl, shareSpace } from '@/lib/links';
import { CATEGORY_META, useColors } from '@/lib/theme';
import type { ReviewPhoto, SpaceDetails, SpaceEvent } from '@/types/space';

const GALLERY_COLUMNS = 4;
const GALLERY_GAP = 8;
const GALLERY_HORIZONTAL_INSET = 16 * 2;

export default function SpaceDetailsScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const reviewsOffset = useRef(0);
  const reviewOffsets = useRef<Record<string, number>>({});
  const [space, setSpace] = useState<SpaceDetails | null>(null);
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<SpaceEvent[]>([]);

  const loadSpace = useCallback(async () => {
    try {
      if (!id) return;
      const [details, spacePhotos, spaceEvents] = await Promise.all([
        getSpaceDetails(id, userId),
        listSpacePhotos(id),
        listSpaceEvents(id, userId),
      ]);
      setSpace(details);
      setPhotos(details ? spacePhotos : []);
      setUpcoming(spaceEvents);
    } catch {
      Alert.alert('Space Error', 'Could not load this space.');
    } finally {
      setIsLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      loadSpace();
    }, [loadSpace])
  );

  const handleFavorite = async () => {
    if (!space) return;
    setSpace({ ...space, current_user_favorited: !space.current_user_favorited });
    try {
      await toggleFavorite(userId, space);
    } catch {
      setSpace({ ...space });
      Alert.alert('Save Error', 'Could not update saved spots.');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas justify-center px-5">
        <EmptyState
          icon={Lock}
          title="Spot unavailable"
          body="This spot may have been removed, or it's a secret spot you haven't unlocked yet."
          actionLabel="Back to map"
          onAction={() => router.replace('/map' as never)}
        />
      </SafeAreaView>
    );
  }

  const meta = CATEGORY_META[space.category];
  const isOwner = space.is_secret && space.created_by === userId;
  const actions = [
    { key: 'directions', label: 'Directions', icon: Navigation, onPress: () => openDirections(space) },
    {
      key: 'save',
      label: space.current_user_favorited ? 'Saved' : 'Save',
      icon: Heart,
      onPress: handleFavorite,
      active: space.current_user_favorited,
    },
    ...(space.is_secret ? [] : [{ key: 'share', label: 'Share', icon: Share2, onPress: () => shareSpace(space) }]),
    ...(space.website ? [{ key: 'web', label: 'Website', icon: ExternalLink, onPress: () => openExternalUrl(space.website) }] : []),
    ...(space.phone ? [{ key: 'call', label: 'Call', icon: Phone, onPress: () => openExternalUrl(`tel:${space.phone}`) }] : []),
  ];
  const thumbnailSize = Math.floor(
    (Math.min(width, 640) - GALLERY_HORIZONTAL_INSET - GALLERY_GAP * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS
  );

  const openReview = (ratingId: string) => {
    setViewerIndex(null);
    const offset = reviewOffsets.current[ratingId];
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: reviewsOffset.current + offset - 8, animated: true });
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}>
        <View className="px-1 pt-1">
          <View className="flex-row items-start justify-between">
            <CategoryIcon category={space.category} size={52} />
            {space.attributes && (
              <View className="items-end">
                <ScorePill score={space.attributes.overall_score} />
                <Text className="text-[12px] text-muted mt-1">
                  {space.attributes.total_ratings} {space.attributes.total_ratings === 1 ? 'rating' : 'ratings'}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-[26px] font-bold text-ink tracking-tight mt-3">{space.name}</Text>
          <Text className="text-[15px] text-muted mt-0.5">
            {meta.blurb}
            {space.primary_purpose ? ` · Best for ${space.primary_purpose.toLowerCase()}` : ''}
          </Text>

          <View className="flex-row items-start mt-3">
            <View className="mt-0.5">
              <MapPin size={14} color={colors.subtle} />
            </View>
            <Text className="text-[14px] text-body ml-2 flex-1 leading-5">{space.address}</Text>
          </View>
          {space.hours && (
            <View className="flex-row items-start mt-2">
              <View className="mt-0.5">
                <Clock size={14} color={colors.subtle} />
              </View>
              <View className="ml-2 flex-1">
                <OpenStatusBadge hours={space.hours} />
                <Text className="text-[13px] text-muted mt-0.5 leading-[18px]">{space.hours}</Text>
              </View>
            </View>
          )}
          {space.description && <Text className="text-[15px] text-body leading-[22px] mt-3">{space.description}</Text>}
        </View>

        <View className="flex-row gap-2 mt-5">
          {actions.map((action) => {
            const Icon = action.icon;
            const tint = action.active ? colors.like : colors.ink;
            return (
              <TouchableOpacity
                key={action.key}
                onPress={action.onPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                className="flex-1 bg-surface rounded-xl items-center justify-center py-2.5"
              >
                <Icon size={18} color={tint} fill={action.active ? colors.like : 'transparent'} />
                <Text style={{ color: tint }} className="text-[12px] font-medium mt-1">{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-3 gap-2">
          <PrimaryButton
            label="Rate this spot"
            icon={Plus}
            onPress={() => router.push({ pathname: '/rank', params: { spaceId: space.id } } as never)}
          />
          <PrimaryButton
            label="Host an event here"
            icon={CalendarDays}
            tone="neutral"
            onPress={() => router.push({ pathname: '/event/new', params: { spaceId: space.id } } as never)}
          />
        </View>

        {space.is_secret && (
          <View className="mt-4 bg-secret-soft rounded-2xl p-4 flex-row items-center">
            <KeyRound size={18} color={colors.secret} />
            <Text className="text-[13px] text-body ml-3 flex-1 leading-[18px]">
              {isOwner
                ? "This is your secret spot. It's hidden from the map and feed. Approve requests from the Secret tab on your profile."
                : 'Secret spot. You were let in, so keep it on the down-low.'}
            </Text>
          </View>
        )}

        {photos.length > 0 && (
          <View className="mt-7">
            <SectionTitle title="Photos" action={`See all ${photos.length}`} onAction={() => setViewerIndex(0)} />
            <PhotoGrid
              photos={photos}
              size={thumbnailSize}
              maxVisible={GALLERY_COLUMNS * 2}
              onPressPhoto={setViewerIndex}
            />
          </View>
        )}

        {upcoming.length > 0 && (
          <View className="mt-7">
            <SectionTitle title="Coming up" />
            <View className="gap-3">
              {upcoming.map((event) => (
                <EventCard
                  key={event.id}
                  occurrence={{ key: event.id, date: event.occurrence_date || toDateKey(new Date()), event, mention_count: event.mention_count || 1 }}
                  showRecurrence={event.kind === 'weekly'}
                />
              ))}
            </View>
          </View>
        )}

        {space.attributes && (
          <View className="mt-7">
            <SectionTitle title="The vibe" />
            <View className="bg-surface rounded-2xl p-4">
              <AttributeBars category={space.attributes.category} scores={space.attributes.attribute_scores} columns={1} />
            </View>
          </View>
        )}

        <View className="flex-row items-baseline mt-7 mb-3">
          <Text className="text-[18px] font-semibold text-ink flex-1">Reviews</Text>
          <Text className="text-[15px] text-muted">{space.reviews.length}</Text>
        </View>
        {space.reviews.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No reviews yet"
            body="Be the first to share what this spot is like."
          />
        ) : (
          <View className="gap-3" onLayout={(event) => { reviewsOffset.current = event.nativeEvent.layout.y; }}>
            {space.reviews.map((review) => (
              <View key={review.id} onLayout={(event) => { reviewOffsets.current[review.id] = event.nativeEvent.layout.y; }}>
                <FeedCard item={review} showSpace={false} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PhotoViewer
        photos={photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onOpenReview={openReview}
      />
    </SafeAreaView>
  );
}
