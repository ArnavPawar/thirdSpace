import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MapPin, MessageCircle, UserCheck, UserPlus, UserX } from 'lucide-react-native';
import FeedCard from '@/components/FeedCard';
import { Avatar, EmptyState, VibeTitleChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getPublicProfile, listRecentActivity, toggleFollow } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { FeedActivity, ProfileWithStats } from '@/types/space';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [reviews, setReviews] = useState<FeedActivity[]>([]);
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
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 justify-center px-5">
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-6">
            <View className="bg-white rounded-3xl border border-slate-200 p-5">
              <View className="flex-row items-center">
                <Avatar name={name} size={72} />
                <View className="flex-1 ml-4">
                  <Text className="text-xl font-extrabold text-ink">{name}</Text>
                  {profile.username && <Text className="text-slate-500">@{profile.username}</Text>}
                  {profile.location && (
                    <View className="flex-row items-center mt-1">
                      <MapPin size={12} color={colors.subtle} />
                      <Text className="text-[13px] text-slate-400 ml-1">{profile.location}</Text>
                    </View>
                  )}
                </View>
              </View>

              {profile.vibe_title && (
                <View className="mt-4">
                  <VibeTitleChip title={profile.vibe_title} size="md" />
                </View>
              )}

              {profile.bio && <Text className="text-[15px] text-slate-700 leading-[21px] mt-3">{profile.bio}</Text>}

              <TouchableOpacity
                onPress={handleToggleFollow}
                activeOpacity={0.8}
                className={`mt-4 h-11 rounded-2xl flex-row items-center justify-center ${profile.is_following ? 'bg-slate-100' : 'bg-primary'}`}
              >
                {profile.is_following ? <UserCheck size={16} color={colors.muted} /> : <UserPlus size={16} color="white" />}
                <Text className={`font-bold ml-2 ${profile.is_following ? 'text-slate-600' : 'text-white'}`}>
                  {profile.is_following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>

              <View className="flex-row mt-5 pt-4 border-t border-slate-100">
                {[
                  { label: 'Spots', value: profile.stats.spaces_rated },
                  { label: 'Reviews', value: profile.stats.reviews_written },
                  { label: 'Followers', value: profile.stats.followers },
                  { label: 'Following', value: profile.stats.following },
                ].map((stat) => (
                  <View key={stat.label} className="flex-1 items-center">
                    <Text className="text-xl font-extrabold text-ink">{stat.value}</Text>
                    <Text className="text-xs text-slate-500 mt-0.5">{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row items-center mt-6">
              <Text className="text-[17px] font-bold text-ink flex-1">Reviews</Text>
              <Text className="text-sm text-slate-400">{reviews.length}</Text>
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
    </SafeAreaView>
  );
}
