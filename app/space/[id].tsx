import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Clock, ExternalLink, Heart, KeyRound, Lock, MapPin, MessageCircle, Navigation, Phone, Plus, Share2 } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import FeedCard from '@/components/FeedCard';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoViewer from '@/components/PhotoViewer';
import { CategoryIcon, EmptyState, OpenStatusBadge, ScorePill } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getSpaceDetails, listSpacePhotos, toggleFavorite } from '@/lib/data';
import { openDirections, openExternalUrl, shareSpace } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { ReviewPhoto, SpaceDetails } from '@/types/space';

const GALLERY_COLUMNS = 4;
const GALLERY_GAP = 8;
const GALLERY_HORIZONTAL_INSET = 16 * 2 + 20 * 2;

export default function SpaceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const reviewsOffset = useRef(0);
  const reviewOffsets = useRef<Record<string, number>>({});
  const [space, setSpace] = useState<SpaceDetails | null>(null);
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSpace = useCallback(async () => {
    try {
      if (!id) return;
      const [details, spacePhotos] = await Promise.all([getSpaceDetails(id, userId), listSpacePhotos(id)]);
      setSpace(details);
      setPhotos(details ? spacePhotos : []);
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
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 justify-center px-5">
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}>
        <View className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
          <View style={{ backgroundColor: meta.tint }} className="px-5 pt-5 pb-4">
            <View className="flex-row items-start">
              <CategoryIcon category={space.category} size={56} />
              <View className="flex-1 ml-4">
                <Text style={{ color: meta.color }} className="text-xs font-bold uppercase tracking-wider">{meta.blurb}</Text>
                <Text className="text-2xl font-extrabold text-ink mt-1">{space.name}</Text>
                {space.primary_purpose && <Text className="text-slate-600 mt-0.5">Best for {space.primary_purpose.toLowerCase()}</Text>}
              </View>
              {space.attributes && (
                <View className="items-center ml-2">
                  <ScorePill score={space.attributes.overall_score} />
                  <Text className="text-[10px] text-slate-500 mt-1">{space.attributes.total_ratings} ratings</Text>
                </View>
              )}
            </View>
          </View>

          <View className="px-5 py-4">
            <View className="flex-row items-start">
              <MapPin size={15} color={colors.subtle} />
              <Text className="text-sm text-slate-600 ml-2 flex-1">{space.address}</Text>
            </View>
            {space.hours && (
              <View className="flex-row items-start mt-2">
                <Clock size={15} color={colors.subtle} />
                <View className="ml-2 flex-1">
                  <OpenStatusBadge hours={space.hours} />
                  <Text className="text-sm text-slate-600 mt-0.5">{space.hours}</Text>
                </View>
              </View>
            )}
            {space.description && <Text className="text-[15px] text-slate-700 leading-[22px] mt-3">{space.description}</Text>}
          </View>

          <View className="flex-row border-t border-slate-100 px-2 py-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <TouchableOpacity key={action.key} onPress={action.onPress} activeOpacity={0.7} className="flex-1 items-center py-2">
                  <Icon
                    size={20}
                    color={action.active ? colors.like : colors.body}
                    fill={action.active ? colors.like : 'transparent'}
                  />
                  <Text className={`text-xs font-semibold mt-1 ${action.active ? 'text-rose-600' : 'text-slate-600'}`}>{action.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {space.is_secret && (
          <View className="mt-3 bg-secret/5 border border-secret/20 rounded-2xl p-4 flex-row items-center">
            <KeyRound size={18} color={colors.secret} />
            <Text className="text-[13px] text-slate-700 ml-2.5 flex-1 leading-[18px]">
              {isOwner
                ? "This is your secret spot. It's hidden from the map and feed. Approve requests from the Secret tab on your profile."
                : 'Secret spot. You were let in, so keep it on the down-low.'}
            </Text>
          </View>
        )}

        {photos.length > 0 && (
          <View className="mt-3 bg-white rounded-3xl border border-slate-200 p-5">
            <View className="flex-row items-center mb-3">
              <Text className="text-[17px] font-bold text-ink flex-1">Photos</Text>
              <TouchableOpacity onPress={() => setViewerIndex(0)} activeOpacity={0.7} hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">See all {photos.length}</Text>
              </TouchableOpacity>
            </View>
            <PhotoGrid
              photos={photos}
              size={thumbnailSize}
              maxVisible={GALLERY_COLUMNS * 2}
              onPressPhoto={setViewerIndex}
            />
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.push({ pathname: '/rank', params: { spaceId: space.id } } as never)}
          activeOpacity={0.85}
          className="mt-3 bg-primary rounded-2xl h-[52px] flex-row items-center justify-center"
        >
          <Plus size={18} color="white" />
          <Text className="text-white font-bold text-base ml-2">Rate this spot</Text>
        </TouchableOpacity>

        {space.attributes && (
          <View className="mt-3 bg-white rounded-3xl border border-slate-200 p-5">
            <Text className="text-[17px] font-bold text-ink mb-4">The vibe</Text>
            <AttributeBars category={space.attributes.category} scores={space.attributes.attribute_scores} columns={1} />
          </View>
        )}

        <View className="flex-row items-center mt-6 mb-3">
          <Text className="text-[17px] font-bold text-ink flex-1">Reviews</Text>
          <Text className="text-sm text-slate-400">{space.reviews.length}</Text>
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
