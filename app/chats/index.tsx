import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MessageCircle, Plus, X } from 'lucide-react-native';
import { Avatar, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDirectThreads, listMessageablePeople, listMyChats } from '@/lib/data';
import { formatEventWhen } from '@/lib/events';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import { openDirectMessage, openEventChat, openHereChat } from '@/lib/links';
import { colors } from '@/lib/theme';
import type { ChatThread, DirectThread, Profile } from '@/types/space';

function SectionLabel({ label }: { label: string }) {
  return <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">{label}</Text>;
}

export default function ChatsScreen() {
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <SectionLabel label="Group messages" />
            {threads.length === 0 ? (
              <Text className="text-[14px] text-slate-500 mb-6">Hangout chats show up here when you are going, hosting, or checked in.</Text>
            ) : threads.map((thread) => {
              const open = thread.kind === 'here' ? openHereChat : openEventChat;
              return (
                <TouchableOpacity
                  key={`${thread.kind || 'going'}|${thread.event.id}|${thread.occurrence_date}`}
                  onPress={() => open(
                    thread.event.id,
                    thread.event.visibility === 'private' ? thread.event.invite_token : undefined,
                    thread.occurrence_date,
                  )}
                  activeOpacity={0.8}
                  className="bg-white border border-slate-200 rounded-3xl px-4 py-4 mb-3"
                >
                  <View className="flex-row items-center">
                    <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
                      <MessageCircle size={18} color={colors.primary} />
                    </View>
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-center">
                        <Text className="flex-1 text-[16px] font-bold text-ink" numberOfLines={1}>{thread.event.title}</Text>
                        {thread.last_message && (
                          <Text className="text-[12px] text-slate-400 ml-2">{formatTimeAgo(thread.last_message.created_at)}</Text>
                        )}
                      </View>
                      <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>
                        {thread.kind === 'here' ? 'Here now · deletes when it ends · ' : ''}
                        {thread.event.space.name} · {formatEventWhen(thread.event, thread.occurrence_date)}
                      </Text>
                      <Text className="text-[14px] text-slate-600 mt-1" numberOfLines={2}>
                        {thread.last_message
                          ? `${getDisplayName(thread.last_message.profile)}: ${thread.last_message.body}`
                          : 'No messages yet'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View className="flex-row items-center justify-between mt-4 mb-2">
              <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">Private messages</Text>
              <TouchableOpacity onPress={openPeople} className="flex-row items-center" accessibilityLabel="New message">
                <Plus size={16} color={colors.primary} />
                <Text className="text-primary font-semibold ml-1">New</Text>
              </TouchableOpacity>
            </View>
            {direct.length === 0 ? (
              <Text className="text-[14px] text-slate-500">Message someone you share a hangout, group, invite, or mutual follow with.</Text>
            ) : direct.map((thread) => (
              <TouchableOpacity
                key={thread.user_id}
                onPress={() => openDirectMessage(thread.user_id)}
                activeOpacity={0.8}
                className="bg-white border border-slate-200 rounded-3xl px-4 py-4 mb-3 flex-row items-center"
              >
                <Avatar name={getDisplayName(thread.profile)} size={44} />
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-[16px] font-bold text-ink" numberOfLines={1}>{getDisplayName(thread.profile)}</Text>
                    <Text className="text-[12px] text-slate-400 ml-2">{formatTimeAgo(thread.last_message.created_at)}</Text>
                  </View>
                  <Text className="text-[14px] text-slate-600 mt-1" numberOfLines={2}>{thread.last_message.body}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={showPeople} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPeople(false)}>
        <SafeAreaView className="flex-1 bg-slate-50">
          <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
            <View className="flex-1 pr-3">
              <Text className="text-[22px] font-extrabold text-ink">New message</Text>
              <Text className="text-[13px] text-slate-500 mt-1">People you share a hangout, group, invite, or mutual follow with.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowPeople(false)} accessibilityLabel="Close" className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center">
              <X size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>
          {peopleLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
              {people.length === 0 ? (
                <EmptyState icon={MessageCircle} title="No one to message yet" body="Share a hangout, join a group, send an invite, or follow each other." />
              ) : people.map((person) => (
                <TouchableOpacity
                  key={person.user_id}
                  onPress={() => {
                    setShowPeople(false);
                    openDirectMessage(person.user_id);
                  }}
                  className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2"
                >
                  <Avatar name={getDisplayName(person)} size={44} />
                  <View className="ml-3 flex-1">
                    <Text className="font-bold text-ink">{getDisplayName(person)}</Text>
                    {person.username ? <Text className="text-[13px] text-slate-500">@{person.username}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
