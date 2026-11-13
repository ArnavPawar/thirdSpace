import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { PersonRow, PrimaryButton, Sheet } from '@/components/ui';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { useColors } from '@/lib/theme';
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
  const colors = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {onAction && actionLabel && (
        <View className="mb-4">
          <PrimaryButton label={actionLabel} onPress={onAction} icon={MessageCircle} />
          {actionHint ? <Text className="text-[13px] text-muted text-center mt-2">{actionHint}</Text> : null}
        </View>
      )}
      {people.length === 0 ? (
        <Text className="text-[15px] text-muted">No one yet.</Text>
      ) : (
        <View className="bg-surface rounded-2xl px-4 py-1">
          {people.map((person, index) => {
            const name = getDisplayName(person);
            return (
              <View key={person.user_id}>
                {index > 0 && <View className="h-px bg-line-soft ml-[56px]" />}
                <PersonRow
                  name={name}
                  avatarUrl={person.avatar_url}
                  subtitle={person.username ? `@${person.username}` : undefined}
                  onPress={() => {
                    onClose();
                    openProfile(person.user_id, currentUserId);
                  }}
                  right={onMessage && person.user_id !== currentUserId ? (
                    <TouchableOpacity
                      onPress={() => onMessage(person)}
                      accessibilityLabel={`Message ${name}`}
                      className="w-9 h-9 rounded-full bg-fill items-center justify-center ml-2"
                    >
                      <MessageCircle size={17} color={colors.ink} />
                    </TouchableOpacity>
                  ) : undefined}
                />
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
