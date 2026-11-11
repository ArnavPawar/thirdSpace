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
import { Stack, useLocalSearchParams } from 'expo-router';
import { Send } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getPublicProfile, listDirectMessages, sendDirectMessage } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { colors } from '@/lib/theme';
import { MAX_EVENT_MESSAGE_LENGTH, type DirectMessage, type Profile } from '@/types/space';

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
const HEADER_HEIGHT = 44;
const formatMessageTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function DirectMessageScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const otherUserId = firstParam(params.id) || '';
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [person, setPerson] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList<DirectMessage>>(null);

  const load = useCallback(async () => {
    try {
      const [profile, thread] = await Promise.all([
        getPublicProfile(otherUserId, userId),
        listDirectMessages(userId, otherUserId),
      ]);
      const fromThread = thread.find((message) => message.sender_id === otherUserId)?.profile;
      setPerson(profile || fromThread || null);
      setMessages(thread);
    } catch (error) {
      Alert.alert('Message', error instanceof Error ? error.message : 'Could not load this conversation.');
    } finally {
      setIsLoading(false);
    }
  }, [otherUserId, userId]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!draft.trim()) return;
    setIsSending(true);
    try {
      const message = await sendDirectMessage(userId, otherUserId, draft);
      setDraft('');
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch (error) {
      Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const name = getDisplayName(person || undefined);

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: name }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
        className="flex-1"
      >
        <TouchableOpacity
          onPress={() => openProfile(otherUserId, userId)}
          className="mx-4 mt-2 mb-1 bg-white rounded-2xl border border-slate-200 px-4 py-3 flex-row items-center"
        >
          <Avatar name={name} size={36} />
          <View className="ml-3 flex-1">
            <Text className="font-bold text-ink">{name}</Text>
            <Text className="text-[12px] text-slate-500">Private message. Only the two of you can see this.</Text>
          </View>
        </TouchableOpacity>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={(
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-slate-500 text-center">No messages yet.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <View className={`flex-row ${mine ? 'justify-end' : 'justify-start'} mt-2`}>
                <View className="max-w-[75%]">
                  <View
                    style={{ backgroundColor: mine ? colors.primary : colors.surface }}
                    className={`rounded-2xl px-3.5 py-2.5 ${mine ? '' : 'border border-slate-200'}`}
                  >
                    <Text className={`text-[15px] leading-[20px] ${mine ? 'text-white' : 'text-ink'}`}>{item.body}</Text>
                  </View>
                  <Text className={`text-[11px] text-slate-400 mt-1 ${mine ? 'text-right' : ''}`}>
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
            placeholder={`Message ${name}`}
            placeholderTextColor={colors.subtle}
            multiline
            maxLength={MAX_EVENT_MESSAGE_LENGTH}
            className="flex-1 min-h-[44px] max-h-[120px] bg-slate-100 rounded-2xl px-4 py-3 text-[15px] text-ink"
          />
          <TouchableOpacity
            onPress={send}
            disabled={isSending || !draft.trim()}
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
