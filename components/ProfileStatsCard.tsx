import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, PartyPopper, Trophy, type LucideIcon } from 'lucide-react-native';
import { cityLabel } from '@/lib/cities';
import { useColors, withAlpha } from '@/lib/theme';
import { SPACE_CATEGORIES, type LeaderboardKind, type LeaderboardPosition, type ProfileStats } from '@/types/space';

export const LEADERBOARDS: Record<LeaderboardKind, { label: string; icon: LucideIcon }> = {
  rankers: { label: 'Spots ranked', icon: Trophy },
  hosts: { label: 'Hangouts hosted', icon: PartyPopper },
};

export function rankTitle(position: LeaderboardPosition) {
  return position.scope === 'city' && position.city
    ? `#${position.rank} in ${cityLabel(position.city)}`
    : `#${position.rank} among friends`;
}

/** What someone has done and where they rank, without saying which hangouts or spots. */
export default function ProfileStatsCard({
  stats,
  onOpenBoard,
}: {
  stats: ProfileStats;
  onOpenBoard: (kind: LeaderboardKind) => void;
}) {
  const colors = useColors();
  const ranked = (Object.keys(LEADERBOARDS) as LeaderboardKind[]).filter((kind) => stats.ranks[kind]);
  const tiles = [
    { label: 'Hosted', value: stats.hosted },
    { label: 'Went to', value: stats.attended },
    { label: 'Guests', value: stats.guests },
    { label: 'Likes', value: stats.likes_received },
    { label: stats.cities_explored === 1 ? 'City' : 'Cities', value: stats.cities_explored },
    { label: 'Spot types', value: `${stats.categories_explored}/${SPACE_CATEGORIES.length}` },
  ];

  return (
    <View className="bg-surface rounded-2xl overflow-hidden">
      {ranked.map((kind) => {
        const position = stats.ranks[kind]!;
        const { label, icon: Icon } = LEADERBOARDS[kind];
        const tone = position.rank === 1 ? colors.warning : colors.primary;
        return (
          <View key={kind}>
            <TouchableOpacity
              onPress={() => onOpenBoard(kind)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${rankTitle(position)} for ${label.toLowerCase()}. See the leaderboard`}
              className="flex-row items-center px-4 py-3"
            >
              <View style={{ backgroundColor: withAlpha(tone, 0.14) }} className="w-10 h-10 rounded-xl items-center justify-center">
                <Icon size={19} color={tone} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-[16px] font-semibold text-ink">{rankTitle(position)}</Text>
                <Text className="text-[13px] text-muted mt-0.5">{label} · out of {position.total}</Text>
              </View>
              <ChevronRight size={16} color={colors.faint} />
            </TouchableOpacity>
            <View className="h-px bg-line-soft ml-4" />
          </View>
        );
      })}
      <View className="flex-row flex-wrap py-2">
        {tiles.map((tile) => (
          <View key={tile.label} className="w-1/3 items-center py-2.5">
            <Text className="text-[20px] font-bold text-ink tracking-tight">{tile.value}</Text>
            <Text className="text-[12px] text-muted mt-0.5">{tile.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
