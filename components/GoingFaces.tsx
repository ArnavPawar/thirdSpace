import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '@/components/ui';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { useColors } from '@/lib/theme';
import type { Profile } from '@/types/space';

export default function GoingFaces({
  people,
  currentUserId,
  size = 28,
  ringColor,
}: {
  people: Profile[];
  currentUserId: string;
  size?: number;
  /** Should match whatever the faces sit on so the overlap reads cleanly. */
  ringColor?: string;
}) {
  const colors = useColors();
  const shown = people.slice(0, 5);
  if (shown.length === 0) return null;

  return (
    <View className="flex-row items-center">
      {shown.map((person, index) => {
        const name = getDisplayName(person);
        return (
          <TouchableOpacity
            key={person.user_id}
            onPress={() => openProfile(person.user_id, currentUserId)}
            style={{ marginLeft: index === 0 ? 0 : -8, zIndex: shown.length - index }}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile`}
          >
            <Avatar name={name} uri={person.avatar_url} size={size} ringColor={ringColor ?? colors.surface} />
          </TouchableOpacity>
        );
      })}
      {people.length > shown.length && (
        <Text className="text-[12px] font-medium text-muted ml-2">+{people.length - shown.length}</Text>
      )}
    </View>
  );
}
