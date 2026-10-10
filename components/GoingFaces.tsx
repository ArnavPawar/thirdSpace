import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '@/components/ui';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import type { Profile } from '@/types/space';

export default function GoingFaces({
  people,
  currentUserId,
  size = 28,
}: {
  people: Profile[];
  currentUserId: string;
  size?: number;
}) {
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
            style={{ marginLeft: index === 0 ? 0 : -8 }}
            accessibilityRole="button"
            accessibilityLabel={`View ${name}'s profile`}
          >
            <Avatar name={name} size={size} ringColor="#ffffff" />
          </TouchableOpacity>
        );
      })}
      {people.length > shown.length && (
        <Text className="text-[12px] font-semibold text-slate-500 ml-2">+{people.length - shown.length}</Text>
      )}
    </View>
  );
}
