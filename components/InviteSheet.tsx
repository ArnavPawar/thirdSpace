import React from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Copy, Share2, X } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { colors } from '@/lib/theme';
import type { InviteStatus, Profile } from '@/types/space';

export default function InviteSheet({
  visible,
  title,
  url,
  people,
  invited,
  loading,
  onClose,
  onCopy,
  onShare,
  onInvite,
}: {
  visible: boolean;
  title: string;
  url?: string;
  people: Profile[];
  invited: Record<string, InviteStatus>;
  loading?: boolean;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
  onInvite: (userId: string) => void;
}) {
  const { userId } = useAuth();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <View className="flex-1 pr-3">
            <Text className="text-[22px] font-extrabold text-ink">{title}</Text>
            <Text className="text-[14px] text-slate-500 mt-1">Copy a link, or invite someone you follow.</Text>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close invites" className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center">
            <X size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-2 px-5 mb-4">
          <TouchableOpacity onPress={onCopy} disabled={!url} className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center">
            <Copy size={16} color={colors.ink} />
            <Text className="font-semibold text-ink ml-2">Copy link</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} disabled={!url} className="flex-1 h-12 rounded-2xl bg-primary flex-row items-center justify-center">
            <Share2 size={16} color="white" />
            <Text className="font-semibold text-white ml-2">Share</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
            {people.length === 0 ? (
              <View className="bg-white border border-slate-200 rounded-3xl px-5 py-8">
                <Text className="text-center font-bold text-ink">No one to invite yet</Text>
                <Text className="text-center text-slate-500 mt-1.5">Follow people from the feed, then they show up here.</Text>
              </View>
            ) : people.map((person) => {
              const status = invited[person.user_id];
              const already = status === 'pending' || status === 'accepted';
              return (
                <View key={person.user_id} className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2">
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      openProfile(person.user_id, userId);
                    }}
                    accessibilityLabel={`View ${getDisplayName(person)}'s profile`}
                    className="flex-row items-center flex-1"
                  >
                    <Avatar name={getDisplayName(person)} size={40} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-ink">{getDisplayName(person)}</Text>
                      {person.username && <Text className="text-[13px] text-slate-500">@{person.username}</Text>}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={already}
                    onPress={() => onInvite(person.user_id)}
                    className={`h-9 px-3 rounded-full flex-row items-center ${already ? 'bg-slate-100' : 'bg-primary'}`}
                  >
                    {already && <Check size={14} color={colors.muted} />}
                    <Text className={`font-semibold text-[13px] ${already ? 'text-slate-600 ml-1' : 'text-white'}`}>
                      {already ? 'Invited' : 'Invite'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
