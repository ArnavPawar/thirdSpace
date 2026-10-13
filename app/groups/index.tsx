import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Globe, Lock, Plus, Users } from 'lucide-react-native';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyGroups, listPublicGroups } from '@/lib/data';
import { colors } from '@/lib/theme';
import type { Group } from '@/types/space';

function GroupRow({ group, onPress }: { group: Group; onPress: () => void }) {
  const Icon = group.visibility === 'private' ? Lock : Globe;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} className="bg-white border border-slate-200 rounded-3xl px-4 py-4 mb-3 flex-row items-center">
      <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
        <Icon size={18} color={colors.primary} />
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-[16px] font-bold text-ink">{group.name}</Text>
        <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>
          {group.visibility === 'private' ? 'Private' : 'Public'} · {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
        </Text>
        {group.description ? <Text className="text-[13px] text-slate-600 mt-1" numberOfLines={2}>{group.description}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.subtle} />
    </TouchableOpacity>
  );
}

export default function GroupsScreen() {
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-[15px] text-slate-500 flex-1 pr-3">A shared map and feed for the people you actually hang out with.</Text>
          <TouchableOpacity
            onPress={() => router.push('/groups/new' as never)}
            accessibilityLabel="Create a group"
            className="w-11 h-11 rounded-full bg-primary items-center justify-center"
          >
            <Plus size={20} color="white" />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">Yours</Text>
            {mine.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No groups yet"
                body="Start a private crew, or join a public one below."
                actionLabel="Create a group"
                onAction={() => router.push('/groups/new' as never)}
              />
            ) : mine.map((group) => (
              <GroupRow key={group.id} group={group} onPress={() => router.push(`/groups/${group.id}` as never)} />
            ))}

            <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">Discover</Text>
            {discover.length === 0 ? (
              <Text className="text-[14px] text-slate-500">No public groups to join right now.</Text>
            ) : discover.map((group) => (
              <GroupRow key={group.id} group={group} onPress={() => router.push(`/groups/${group.id}` as never)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
