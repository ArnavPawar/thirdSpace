import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Check, Copy, Share2, UsersRound } from 'lucide-react-native';
import { EmptyState, PersonRow, PillButton, Sheet } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { useColors } from '@/lib/theme';
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
  const colors = useColors();
  const { userId } = useAuth();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle="Copy a link, or invite someone you follow.">
      <View className="flex-row gap-2 mb-5">
        <TouchableOpacity
          onPress={onCopy}
          disabled={!url}
          activeOpacity={0.7}
          className="flex-1 h-12 rounded-xl bg-surface flex-row items-center justify-center"
        >
          <Copy size={16} color={colors.ink} />
          <Text className="font-semibold text-ink ml-2 text-[15px]">Copy link</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onShare}
          disabled={!url}
          activeOpacity={0.8}
          className="flex-1 h-12 rounded-xl bg-primary flex-row items-center justify-center"
        >
          <Share2 size={16} color={colors.onPrimary} />
          <Text className="font-semibold text-white ml-2 text-[15px]">Share</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} />
      ) : people.length === 0 ? (
        <EmptyState icon={UsersRound} title="No one to invite yet" body="Follow people from the feed, then they show up here." />
      ) : (
        <>
          <Text className="text-[13px] font-medium text-muted px-1 mb-1.5">People you follow</Text>
          <View className="bg-surface rounded-2xl px-4 py-1">
            {people.map((person, index) => {
              const status = invited[person.user_id];
              const already = status === 'pending' || status === 'accepted';
              return (
                <View key={person.user_id}>
                  {index > 0 && <View className="h-px bg-line-soft ml-[56px]" />}
                  <PersonRow
                    name={getDisplayName(person)}
                    avatarUrl={person.avatar_url}
                    subtitle={person.username ? `@${person.username}` : undefined}
                    onPress={() => {
                      onClose();
                      openProfile(person.user_id, userId);
                    }}
                    right={(
                      <PillButton
                        label={already ? 'Invited' : 'Invite'}
                        icon={already ? Check : undefined}
                        active={already}
                        disabled={already}
                        onPress={() => onInvite(person.user_id)}
                      />
                    )}
                  />
                </View>
              );
            })}
          </View>
        </>
      )}
    </Sheet>
  );
}
