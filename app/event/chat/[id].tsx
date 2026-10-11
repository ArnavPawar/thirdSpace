import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Lock, Send } from 'lucide-react-native';
import { Avatar, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canUseEventChat, getEvent, listEventMessages, sendEventMessage, subscribeToEventMessages } from '@/lib/data';
import { formatEventWhen, getChatClosesAt } from '@/lib/events';
import { getDisplayName } from '@/lib/format';
import { openEvent } from '@/lib/links';
import { colors } from '@/lib/theme';
import { MAX_EVENT_MESSAGE_LENGTH, type EventMessage, type SpaceEvent } from '@/types/space';

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const HEADER_HEIGHT = 44;

const formatMessageTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function mergeMessage(messages: EventMessage[], next: EventMessage) {
  if (messages.some((message) => message.id === next.id)) return messages;
  return [...messages, next].sort((first, second) => first.created_at.localeCompare(second.created_at));
}

export default function EventChatScreen() {
  const params = useLocalSearchParams<{ id: string; token?: string | string[]; date?: string | string[] }>();
  const eventId = firstParam(params.id) || '';
  const token = firstParam(params.token);
  const date = firstParam(params.date);
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [event, setEvent] = useState<SpaceEvent | null>(null);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<EventMessage>>(null);

  const occurrence = event?.occurrence_date;
  const canChat = Boolean(event && canUseEventChat(event, userId));

  const load = useCallback(async () => {
    try {
      const loaded = await getEvent(eventId, userId, token, date);
      setEvent(loaded);
      if (loaded?.occurrence_date && canUseEventChat(loaded, userId)) {
        setMessages(await listEventMessages(loaded, loaded.occurrence_date));
      }
    } catch (error) {
      Alert.alert('Group chat', error instanceof Error ? error.message : 'Could not load the chat.');
    } finally {
      setIsLoading(false);
    }
  }, [date, eventId, token, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!event || !occurrence || !canChat) return undefined;
    return subscribeToEventMessages(event, occurrence, (message) => {
      setMessages((current) => mergeMessage(current, message));
    });
  }, [canChat, event, occurrence]);

  const send = async () => {
    if (!event || !draft.trim()) return;
    setIsSending(true);
    try {
      const message = await sendEventMessage(userId, event, draft);
      setDraft('');
      setMessages((current) => mergeMessage(current, message));
    } catch (error) {
      Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!event || !occurrence || !canChat) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 justify-center px-5">
        <EmptyState
          icon={Lock}
          title="This chat is for people going"
          body="RSVP to the hangout to join. Chats disappear the day after the event."
          actionLabel={event ? 'Back to the hangout' : undefined}
          onAction={event ? () => router.back() : undefined}
        />
      </SafeAreaView>
    );
  }

  const closesAt = getChatClosesAt(occurrence).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: event.title }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
        className="flex-1"
      >
        <TouchableOpacity
          onPress={() => openEvent(event.id, token, occurrence)}
          activeOpacity={0.8}
          className="mx-4 mt-2 mb-1 bg-white rounded-2xl border border-slate-200 px-4 py-3"
        >
          <Text className="font-bold text-ink" numberOfLines={1}>{event.space.name}</Text>
          <Text className="text-[12px] text-slate-500 mt-0.5" numberOfLines={1}>
            {formatEventWhen({ ...event, kind: 'one_time' }, occurrence)} · {event.going_count} going
          </Text>
          <Text className="text-[12px] text-slate-400 mt-1">This chat disappears on {closesAt}.</Text>
        </TouchableOpacity>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={(
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-slate-500 text-center">No messages yet. Say hi and figure out the plan.</Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const mine = item.user_id === userId;
            const name = getDisplayName(item.profile);
            const sameAuthorAsPrevious = index > 0 && messages[index - 1].user_id === item.user_id;
            return (
              <View className={`flex-row ${mine ? 'justify-end' : 'justify-start'} ${sameAuthorAsPrevious ? 'mt-1' : 'mt-3'}`}>
                {!mine && (
                  <View className="w-8 mr-2 justify-end">
                    {!sameAuthorAsPrevious && <Avatar name={name} size={28} />}
                  </View>
                )}
                <View className="max-w-[75%]">
                  {!mine && !sameAuthorAsPrevious && (
                    <Text className="text-[12px] font-semibold text-slate-500 mb-1 ml-1">
                      {item.user_id === event.host_user_id ? `${name} · Host` : name}
                    </Text>
                  )}
                  <View
                    style={{ backgroundColor: mine ? colors.primary : colors.surface }}
                    className={`rounded-2xl px-3.5 py-2.5 ${mine ? '' : 'border border-slate-200'}`}
                  >
                    <Text className={`text-[15px] leading-[20px] ${mine ? 'text-white' : 'text-ink'}`}>{item.body}</Text>
                  </View>
                  <Text className={`text-[11px] text-slate-400 mt-1 ${mine ? 'text-right mr-1' : 'ml-1'}`}>
                    {formatMessageTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View className="flex-row items-end px-3 pt-2 pb-3 border-t border-slate-200 bg-white">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the group"
            placeholderTextColor={colors.subtle}
            multiline
            maxLength={MAX_EVENT_MESSAGE_LENGTH}
            className="flex-1 min-h-[44px] max-h-[120px] bg-slate-100 rounded-2xl px-4 py-3 text-[15px] text-ink"
          />
          <TouchableOpacity
            onPress={send}
            disabled={isSending || !draft.trim()}
            activeOpacity={0.85}
            accessibilityLabel="Send message"
            style={{ backgroundColor: draft.trim() ? colors.primary : colors.border }}
            className="w-11 h-11 rounded-full items-center justify-center ml-2"
          >
            {isSending ? <ActivityIndicator color="white" /> : <Send size={18} color="white" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
