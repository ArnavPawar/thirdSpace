import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MapPin, MessageCircle, UserCheck, UserPlus, UserX } from 'lucide-react-native';
import FeedCard from '@/components/FeedCard';
import LeaderboardSheet from '@/components/LeaderboardSheet';
import ProfileStatsCard from '@/components/ProfileStatsCard';
import { Avatar, EmptyState, PrimaryButton, VibeTitleChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getPublicProfile, listRecentActivity, toggleFollow } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { useColors } from '@/lib/theme';
import type { FeedActivity, LeaderboardKind, ProfileWithStats } from '@/types/space';

export default function UserProfileScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [reviews, setReviews] = useState<FeedActivity[]>([]);
  const [boardKind, setBoardKind] = useState<LeaderboardKind | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [nextProfile, nextReviews] = await Promise.all([
        getPublicProfile(id, userId),
        listRecentActivity({ currentUserId: userId, authorId: id }),
      ]);
      setProfile(nextProfile);
      setReviews(nextReviews);
    } catch {
      Alert.alert('Profile Error', 'Could not load this profile.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleFollow = async () => {
    if (!profile) return;
    const previous = profile;
    const isFollowing = !profile.is_following;
    setProfile({
      ...profile,
      is_following: isFollowing,
      stats: { ...profile.stats, followers: Math.max(0, profile.stats.followers + (isFollowing ? 1 : -1)) },
    });
    try {
      await toggleFollow(userId, profile.user_id);
    } catch {
      setProfile(previous);
      Alert.alert('Follow Error', 'Could not update follow state.');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas justify-center px-5">
        <EmptyState
          icon={UserX}
          title="Profile unavailable"
          body="This person may have deleted their account."
          actionLabel="Back to feed"
          onAction={() => router.replace('/' as never)}
        />
      </SafeAreaView>
    );
  }

  const name = getDisplayName(profile);
  const firstName = name.split(' ')[0];

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-3">
            <View className="items-center pt-2 px-1">
              <Avatar name={name} uri={profile.avatar_url} size={88} />
              <Text className="text-[24px] font-bold text-ink tracking-tight mt-3 text-center">{name}</Text>
              {profile.username && <Text className="text-[15px] text-muted mt-0.5">@{profile.username}</Text>}
              {profile.location && (
                <View className="flex-row items-center mt-1.5">
                  <MapPin size={13} color={colors.muted} />
                  <Text className="text-[13px] text-muted ml-1">{profile.location}</Text>
                </View>
              )}

              {profile.vibe_title && (
                <View className="mt-3">
                  <VibeTitleChip title={profile.vibe_title} size="md" />
                </View>
              )}

              {profile.bio && (
                <Text className="text-[15px] text-body leading-[22px] mt-3 text-center max-w-[340px]">{profile.bio}</Text>
              )}
            </View>

            <View className="flex-row mt-5">
              {[
                { label: 'Spots', value: profile.stats.spaces_rated },
                { label: 'Reviews', value: profile.stats.reviews_written },
                { label: 'Followers', value: profile.stats.followers },
                { label: 'Following', value: profile.stats.following },
              ].map((stat) => (
                <View key={stat.label} className="flex-1 items-center">
                  <Text className="text-[17px] font-semibold text-ink">{stat.value}</Text>
                  <Text className="text-[13px] text-muted mt-0.5">{stat.label}</Text>
                </View>
              ))}
            </View>

            <View className="mt-5">
              <PrimaryButton
                label={profile.is_following ? 'Following' : 'Follow'}
                icon={profile.is_following ? UserCheck : UserPlus}
                tone={profile.is_following ? 'neutral' : 'primary'}
                size="md"
                onPress={handleToggleFollow}
              />
            </View>

            <View className="mt-5">
              <ProfileStatsCard stats={profile.stats} onOpenBoard={setBoardKind} />
            </View>

            <View className="flex-row items-baseline mt-8">
              <Text className="text-[18px] font-semibold text-ink flex-1">Reviews</Text>
              <Text className="text-[15px] text-muted">{reviews.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <FeedCard item={item} linkAuthor={false} />}
        ListEmptyComponent={
          <EmptyState
            icon={MessageCircle}
            title="No reviews yet"
            body={`When ${firstName} rates a spot, it'll show up here.`}
          />
        }
      />

      <LeaderboardSheet
        kind={boardKind}
        onChangeKind={setBoardKind}
        onClose={() => setBoardKind(null)}
        ownerId={profile.user_id}
        ownerFirstName={firstName}
        viewerId={userId}
      />
    </SafeAreaView>
  );
}
