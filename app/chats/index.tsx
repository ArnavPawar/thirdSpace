import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MessageCircle, Plus, UsersRound } from 'lucide-react-native';
import { Avatar, EmptyState, Sheet } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDirectThreads, listMessageablePeople, listMyChats } from '@/lib/data';
import { formatEventWhen } from '@/lib/events';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import { openDirectMessage, openEventChat, openHereChat } from '@/lib/links';
import { useColors } from '@/lib/theme';
import type { ChatThread, DirectThread, Profile } from '@/types/space';

function SectionLabel({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 mb-1.5">
      <Text className="text-[13px] font-medium text-muted">{label}</Text>
      {right}
    </View>
  );
}

function Separator() {
  return <View className="h-px bg-line-soft ml-[76px]" />;
}

export default function ChatsScreen() {
  const colors = useColors();
  const { userId } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [direct, setDirect] = useState<DirectThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chats, messages] = await Promise.all([
        listMyChats(userId),
        listDirectThreads(userId).catch(() => [] as DirectThread[]),
      ]);
      setThreads(chats);
      setDirect(messages);
    } catch {
      Alert.alert('Chats', 'Could not load your chats.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPeople = async () => {
    setShowPeople(true);
    setPeopleLoading(true);
    try {
      setPeople(await listMessageablePeople(userId));
    } catch (error) {
      Alert.alert('New message', error instanceof Error ? error.message : 'Could not load people you can message.');
      setPeople([]);
    } finally {
      setPeopleLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.muted} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 32 }} />
        ) : (
          <>
            <SectionLabel label="Group chats" />
            {threads.length === 0 ? (
              <Text className="text-[14px] text-muted px-4 mb-6 leading-5">
                Hangout chats show up here when you are going, hosting, or checked in.
              </Text>
            ) : (
              <View className="bg-surface rounded-2xl overflow-hidden mb-6">
                {threads.map((thread, index) => {
                  const open = thread.kind === 'here' ? openHereChat : openEventChat;
                  return (
                    <View key={`${thread.kind || 'going'}|${thread.event.id}|${thread.occurrence_date}`}>
                      {index > 0 && <Separator />}
                      <TouchableOpacity
                        onPress={() => open(
                          thread.event.id,
                          thread.event.visibility === 'private' ? thread.event.invite_token : undefined,
                          thread.occurrence_date,
                        )}
                        activeOpacity={0.6}
                        className="flex-row items-center px-4 py-3"
                      >
                        <View className="w-12 h-12 rounded-full bg-fill items-center justify-center">
                          <UsersRound size={20} color={colors.body} />
                        </View>
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center">
                            <Text className="flex-1 text-[16px] font-semibold text-ink" numberOfLines={1}>{thread.event.title}</Text>
                            {thread.last_message && (
                              <Text className="text-[13px] text-subtle ml-2">{formatTimeAgo(thread.last_message.created_at)}</Text>
                            )}
                          </View>
                          <Text className="text-[14px] text-muted mt-0.5" numberOfLines={1}>
                            {thread.last_message
                              ? `${getDisplayName(thread.last_message.profile)}: ${thread.last_message.body}`
                              : 'No messages yet'}
                          </Text>
                          <Text className="text-[13px] text-subtle mt-0.5" numberOfLines={1}>
                            {thread.kind === 'here' ? 'Here now · deletes when it ends · ' : ''}
                            {thread.event.space.name} · {formatEventWhen(thread.event, thread.occurrence_date)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <SectionLabel
              label="Messages"
              right={(
                <TouchableOpacity onPress={openPeople} hitSlop={8} className="flex-row items-center" accessibilityLabel="New message">
                  <Plus size={16} color={colors.primary} />
                  <Text className="text-[15px] text-primary font-medium ml-1">New</Text>
                </TouchableOpacity>
              )}
            />
            {direct.length === 0 ? (
              <Text className="text-[14px] text-muted px-4 leading-5">
                Message someone you share a hangout, group, invite, or mutual follow with.
              </Text>
            ) : (
              <View className="bg-surface rounded-2xl overflow-hidden">
                {direct.map((thread, index) => (
                  <View key={thread.user_id}>
                    {index > 0 && <Separator />}
                    <TouchableOpacity
                      onPress={() => openDirectMessage(thread.user_id)}
                      activeOpacity={0.6}
                      className="flex-row items-center px-4 py-3"
                    >
                      <Avatar name={getDisplayName(thread.profile)} uri={thread.profile?.avatar_url} size={48} />
                      <View className="flex-1 ml-3">
                        <View className="flex-row items-center">
                          <Text className="flex-1 text-[16px] font-semibold text-ink" numberOfLines={1}>{getDisplayName(thread.profile)}</Text>
                          <Text className="text-[13px] text-subtle ml-2">{formatTimeAgo(thread.last_message.created_at)}</Text>
                        </View>
                        <Text className="text-[14px] text-muted mt-0.5" numberOfLines={1}>{thread.last_message.body}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={showPeople}
        onClose={() => setShowPeople(false)}
        title="New message"
        subtitle="People you share a hangout, group, invite, or mutual follow with."
      >
        {peopleLoading ? (
          <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} />
        ) : people.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No one to message yet" body="Share a hangout, join a group, send an invite, or follow each other." />
        ) : (
          <View className="bg-surface rounded-2xl overflow-hidden">
            {people.map((person, index) => (
              <View key={person.user_id}>
                {index > 0 && <View className="h-px bg-line-soft ml-[72px]" />}
                <TouchableOpacity
                  onPress={() => {
                    setShowPeople(false);
                    openDirectMessage(person.user_id);
                  }}
                  activeOpacity={0.6}
                  className="flex-row items-center px-4 py-2.5"
                >
                  <Avatar name={getDisplayName(person)} uri={person.avatar_url} size={44} />
                  <View className="ml-3 flex-1">
                    <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{getDisplayName(person)}</Text>
                    {person.username ? <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>@{person.username}</Text> : null}
                  </View>
                  <MessageCircle size={18} color={colors.subtle} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
