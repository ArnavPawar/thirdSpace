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
import { ArrowUp, ChevronRight, Clock, Lock, MessageCircle } from 'lucide-react-native';
import { Avatar, CategoryIcon, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canUseEventChat, canUseHereChat, getEvent, listEventMessages, listHereMessages, sendEventMessage, sendHereMessage, subscribeToEventMessages, subscribeToHereMessages } from '@/lib/data';
import { formatEventWhen, getChatClosesAt, getEventPhase } from '@/lib/events';
import { getDisplayName } from '@/lib/format';
import { openEvent, openProfile } from '@/lib/links';
import { useColors, useColorSchemeName } from '@/lib/theme';
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
  const colors = useColors();
  const scheme = useColorSchemeName();
  const params = useLocalSearchParams<{ id: string; token?: string | string[]; date?: string | string[]; kind?: string | string[] }>();
  const eventId = firstParam(params.id) || '';
  const token = firstParam(params.token);
  const date = firstParam(params.date);
  const hereChat = firstParam(params.kind) === 'here';
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [event, setEvent] = useState<SpaceEvent | null>(null);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<EventMessage>>(null);

  const occurrence = event?.occurrence_date;
  const canChat = Boolean(event && (hereChat ? canUseHereChat(event, userId) : canUseEventChat(event, userId)));

  const load = useCallback(async () => {
    try {
      const loaded = await getEvent(eventId, userId, token, date);
      setEvent(loaded);
      const allowed = loaded?.occurrence_date && (hereChat ? canUseHereChat(loaded, userId) : canUseEventChat(loaded, userId));
      if (loaded?.occurrence_date && allowed) {
        setMessages(hereChat ? await listHereMessages(loaded, loaded.occurrence_date) : await listEventMessages(loaded, loaded.occurrence_date));
      } else {
        setMessages([]);
      }
    } catch (error) {
      Alert.alert('Group chat', error instanceof Error ? error.message : 'Could not load the chat.');
    } finally {
      setIsLoading(false);
    }
  }, [date, eventId, hereChat, token, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!event || !occurrence || !canChat) return undefined;
    const subscribe = hereChat ? subscribeToHereMessages : subscribeToEventMessages;
    return subscribe(event, occurrence, (message) => {
      setMessages((current) => mergeMessage(current, message));
    });
  }, [canChat, event, hereChat, occurrence]);

  const send = async () => {
    if (!event || !draft.trim()) return;
    setIsSending(true);
    try {
      const message = hereChat ? await sendHereMessage(userId, event, draft) : await sendEventMessage(userId, event, draft);
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
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!event || !occurrence || !canChat) {
    const ended = Boolean(event && occurrence && hereChat && getEventPhase(event, occurrence) !== 'live');
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas justify-center px-5">
        <EmptyState
          icon={Lock}
          title={ended ? 'This chat is gone' : hereChat ? 'Check in to join' : 'This chat is for people going'}
          body={ended
            ? 'The here chat deletes when the hangout ends.'
            : hereChat
              ? 'Tap I\'m here on the hangout. Only people who are there can talk, and the chat disappears when it ends.'
              : 'RSVP to the hangout to join. Chats disappear the day after the event.'}
          actionLabel={event ? 'Back to the hangout' : undefined}
          onAction={event ? () => router.back() : undefined}
        />
      </SafeAreaView>
    );
  }

  const closesAt = getChatClosesAt(occurrence).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <Stack.Screen options={{ title: event.title }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
        className="flex-1"
      >
        <TouchableOpacity
          onPress={() => openEvent(event.id, token, occurrence)}
          activeOpacity={0.7}
          className="mx-4 mt-2 mb-1 bg-surface rounded-2xl px-3.5 py-3 flex-row items-center"
        >
          <CategoryIcon category={event.space.category} size={40} />
          <View className="flex-1 mx-3">
            <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>{event.space.name}</Text>
            <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>
              {formatEventWhen({ ...event, kind: 'one_time' }, occurrence)} · {event.going_count} going
            </Text>
            <View className="flex-row items-center mt-1">
              <Clock size={12} color={colors.subtle} />
              <Text className="text-[12px] text-subtle ml-1 flex-1" numberOfLines={2}>
                {hereChat ? 'Only people checked in. This chat deletes when the hangout ends.' : `This chat disappears on ${closesAt}.`}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.faint} />
        </TouchableOpacity>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={(
            <View className="flex-1 items-center justify-center py-16 px-6">
              <View className="w-12 h-12 rounded-full bg-surface items-center justify-center mb-3">
                <MessageCircle size={22} color={colors.muted} />
              </View>
              <Text className="text-[15px] text-muted text-center leading-5">No messages yet. Say hi and figure out the plan.</Text>
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
                    {!sameAuthorAsPrevious && (
                      <TouchableOpacity
                        onPress={() => openProfile(item.user_id, userId)}
                        accessibilityLabel={`View ${name}'s profile`}
                      >
                        <Avatar name={name} uri={item.profile?.avatar_url} size={28} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View className="max-w-[75%]">
                  {!mine && !sameAuthorAsPrevious && (
                    <TouchableOpacity onPress={() => openProfile(item.user_id, userId)} accessibilityLabel={`View ${name}'s profile`}>
                      <Text className="text-[12px] font-medium text-muted mb-1 ml-3">
                        {item.user_id === event.host_user_id ? `${name} · Host` : name}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <View className={`rounded-2xl px-3.5 py-2 ${mine ? 'bg-primary' : 'bg-surface'}`}>
                    <Text className={`text-[15px] leading-[21px] ${mine ? 'text-white' : 'text-ink'}`}>{item.body}</Text>
                  </View>
                  <Text className={`text-[11px] text-subtle mt-1 ${mine ? 'text-right mr-3' : 'ml-3'}`}>
                    {formatMessageTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View className="px-3 pt-2 pb-2 bg-surface border-t border-line-soft">
          <View className="flex-row items-end bg-fill rounded-[22px] pl-4 pr-1.5 py-1.5 min-h-[44px]">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={hereChat ? 'Message everyone here' : 'Message the group'}
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              multiline
              maxLength={MAX_EVENT_MESSAGE_LENGTH}
              className="flex-1 max-h-[120px] py-1.5 mr-2 text-[15px] text-ink"
            />
            <TouchableOpacity
              onPress={send}
              disabled={isSending || !draft.trim()}
              activeOpacity={0.8}
              accessibilityLabel="Send message"
              style={{ backgroundColor: draft.trim() ? colors.primary : 'transparent' }}
              className="w-8 h-8 rounded-full items-center justify-center"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <ArrowUp size={16} color={draft.trim() ? colors.onPrimary : colors.faint} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
