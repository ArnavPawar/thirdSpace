import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, X } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { colors } from '@/lib/theme';
import type { Profile } from '@/types/space';

export default function PeopleListSheet({
  visible,
  title,
  people,
  currentUserId,
  onClose,
  actionLabel,
  actionHint,
  onAction,
  onMessage,
}: {
  visible: boolean;
  title: string;
  people: Profile[];
  currentUserId: string;
  onClose: () => void;
  actionLabel?: string;
  actionHint?: string;
  onAction?: () => void;
  onMessage?: (person: Profile) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <Text className="text-[22px] font-extrabold text-ink flex-1 pr-3">{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close"
            className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center"
          >
            <X size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
        {onAction && actionLabel && (
          <View className="px-5 mb-3">
            <TouchableOpacity onPress={onAction} className="h-12 rounded-2xl bg-primary items-center justify-center">
              <Text className="font-semibold text-white">{actionLabel}</Text>
            </TouchableOpacity>
            {actionHint ? <Text className="text-[12px] text-slate-500 text-center mt-2">{actionHint}</Text> : null}
          </View>
        )}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          {people.length === 0 ? (
            <Text className="text-slate-500">No one yet.</Text>
          ) : people.map((person) => {
            const name = getDisplayName(person);
            return (
              <View key={person.user_id} className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2">
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    openProfile(person.user_id, currentUserId);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${name}'s profile`}
                  className="flex-row items-center flex-1"
                >
                  <Avatar name={name} size={44} />
                  <View className="ml-3 flex-1">
                    <Text className="font-bold text-ink">{name}</Text>
                    {person.username ? <Text className="text-[13px] text-slate-500">@{person.username}</Text> : null}
                  </View>
                </TouchableOpacity>
                {onMessage && person.user_id !== currentUserId && (
                  <TouchableOpacity
                    onPress={() => onMessage(person)}
                    accessibilityLabel={`Message ${name}`}
                    className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center ml-2"
                  >
                    <MessageCircle size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
