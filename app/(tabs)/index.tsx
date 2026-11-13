import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Globe, MessageCircle, UserCheck, UsersRound } from 'lucide-react-native';
import FeedCard from '@/components/FeedCard';
import { EmptyState, IconButton, ScreenHeader, SegmentedControl } from '@/components/ui';
import { listRecentActivity, toggleFollow } from '@/lib/data';
import { useAuth } from '@/lib/auth';
import { usePreferences } from '@/lib/preferences';
import { useColors } from '@/lib/theme';
import type { FeedActivity } from '@/types/space';

type FeedScope = 'public' | 'following';

export default function FeedScreen() {
  const colors = useColors();
  const { userId } = useAuth();
  const { preferences, isLoaded } = usePreferences();
  const [activity, setActivity] = useState<FeedActivity[]>([]);
  const [feedScope, setFeedScope] = useState<FeedScope>(preferences.defaultFeed);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isLoaded) setFeedScope(preferences.defaultFeed);
  }, [isLoaded, preferences.defaultFeed]);

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await listRecentActivity({ currentUserId: userId, scope: feedScope }));
    } catch {
      Alert.alert('Feed Error', 'Could not load recent reviews.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [feedScope, userId]);

  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActivity();
  }, [loadActivity]);

  const handleToggleFollow = async (targetUserId: string) => {
    try {
      const isFollowing = await toggleFollow(userId, targetUserId);
      setActivity((items) => items.map((item) =>
        item.user_id === targetUserId ? { ...item, is_following: isFollowing } : item
      ));
    } catch {
      Alert.alert('Follow Error', 'Could not update follow state.');
    }
  };

  const changeScope = (scope: FeedScope) => {
    if (scope === feedScope) return;
    setIsLoading(true);
    setFeedScope(scope);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <FlatList
        data={isLoading ? [] : activity}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="pb-4">
            <ScreenHeader
              title="Feed"
              subtitle="Fresh takes on spots around you"
              right={(
                <View className="flex-row gap-2">
                  <IconButton icon={UsersRound} onPress={() => router.push('/groups' as never)} accessibilityLabel="Groups" />
                  <IconButton icon={MessageCircle} onPress={() => router.push('/chats' as never)} accessibilityLabel="Chats" />
                </View>
              )}
            />
            <SegmentedControl
              style={{ marginHorizontal: 16 }}
              value={feedScope}
              onChange={changeScope}
              options={[
                { value: 'public', label: 'Public', icon: Globe },
                { value: 'following', label: 'Following', icon: UserCheck },
              ]}
            />
          </View>
        }
        renderItem={({ item }) => (
          <View className="px-4">
            <FeedCard item={item} onToggleFollow={handleToggleFollow} />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : (
            <View className="px-4">
              {feedScope === 'following' ? (
                <EmptyState
                  icon={UserCheck}
                  title="Nobody here yet"
                  body="Follow people from the Public feed and their reviews will show up here."
                  actionLabel="Browse Public"
                  onAction={() => changeScope('public')}
                />
              ) : (
                <EmptyState
                  icon={Globe}
                  title="No reviews yet"
                  body="Be the first to put a spot on the map."
                  actionLabel="Rate a spot"
                  onAction={() => router.push('/rank' as never)}
                />
              )}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
