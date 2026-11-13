import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Globe, Lock, Plus, UsersRound } from 'lucide-react-native';
import { Avatar, EmptyState, GroupLabel } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyGroups, listPublicGroups } from '@/lib/data';
import { useColors } from '@/lib/theme';
import type { Group } from '@/types/space';

function GroupRow({ group, onPress }: { group: Group; onPress: () => void }) {
  const colors = useColors();
  const Icon = group.visibility === 'private' ? Lock : Globe;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} className="px-4 py-3 flex-row items-center">
      <Avatar name={group.name} size={44} />
      <View className="flex-1 ml-3 mr-2">
        <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{group.name}</Text>
        <View className="flex-row items-center mt-0.5">
          <Icon size={12} color={colors.muted} />
          <Text className="text-[13px] text-muted ml-1" numberOfLines={1}>
            {group.visibility === 'private' ? 'Private' : 'Public'} · {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
        {group.description ? <Text className="text-[14px] text-body mt-1 leading-5" numberOfLines={2}>{group.description}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.faint} />
    </TouchableOpacity>
  );
}

function GroupList({ groups }: { groups: Group[] }) {
  return (
    <View className="bg-surface rounded-2xl overflow-hidden">
      {groups.map((group, index) => (
        <View key={group.id}>
          {index > 0 && <View className="h-px bg-line-soft ml-[72px]" />}
          <GroupRow group={group} onPress={() => router.push(`/groups/${group.id}` as never)} />
        </View>
      ))}
    </View>
  );
}

export default function GroupsScreen() {
  const colors = useColors();
  const { userId } = useAuth();
  const [mine, setMine] = useState<Group[]>([]);
  const [discover, setDiscover] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [joined, publics] = await Promise.all([
        listMyGroups(userId),
        listPublicGroups(userId).catch(() => [] as Group[]),
      ]);
      const joinedIds = new Set(joined.map((group) => group.id));
      setMine(joined);
      setDiscover(publics.filter((group) => !joinedIds.has(group.id)));
    } catch {
      Alert.alert('Groups', 'Could not load your groups.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View className="flex-row items-center justify-between mb-6 px-1">
          <Text className="text-[15px] text-muted flex-1 pr-4 leading-5">A shared map and feed for the people you actually hang out with.</Text>
          <TouchableOpacity
            onPress={() => router.push('/groups/new' as never)}
            accessibilityLabel="Create a group"
            accessibilityRole="button"
            activeOpacity={0.8}
            className="h-9 pl-3 pr-3.5 rounded-full bg-primary flex-row items-center"
          >
            <Plus size={16} color={colors.onPrimary} />
            <Text className="text-[14px] font-semibold text-white ml-1">New</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 32 }} />
        ) : (
          <>
            <GroupLabel>Your groups</GroupLabel>
            {mine.length === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="No groups yet"
                body="Start a private crew, or join a public one below."
                actionLabel="Create a group"
                onAction={() => router.push('/groups/new' as never)}
              />
            ) : (
              <GroupList groups={mine} />
            )}

            <View className="mt-7">
              <GroupLabel>Discover</GroupLabel>
              {discover.length === 0 ? (
                <Text className="text-[15px] text-muted px-4">No public groups to join right now.</Text>
              ) : (
                <GroupList groups={discover} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
