import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Globe, Plus, Users } from 'lucide-react-native';
import FeedCard from '@/components/FeedCard';
import { EmptyState, IconButton, ScreenHeader, SegmentedControl } from '@/components/ui';
import { listRecentActivity, toggleFollow } from '@/lib/data';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import type { FeedActivity } from '@/types/space';

type FeedScope = 'public' | 'following';

export default function FeedScreen() {
  const { userId } = useAuth();
  const [activity, setActivity] = useState<FeedActivity[]>([]);
  const [feedScope, setFeedScope] = useState<FeedScope>('public');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <FlatList
        data={isLoading ? [] : activity}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="pb-4">
            <ScreenHeader
              title="Feed"
              subtitle="Fresh takes on spots around you"
              right={<IconButton icon={Plus} onPress={() => router.push('/rank' as never)} accessibilityLabel="Rate a spot" />}
            />
            <SegmentedControl
              style={{ marginHorizontal: 20 }}
              value={feedScope}
              onChange={changeScope}
              options={[
                { value: 'public', label: 'Public', icon: Globe },
                { value: 'following', label: 'Following', icon: Users },
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
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View className="px-4">
              {feedScope === 'following' ? (
                <EmptyState
                  icon={Users}
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
