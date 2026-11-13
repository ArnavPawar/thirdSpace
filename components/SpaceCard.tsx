import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import { CategoryIcon, ScorePill } from '@/components/ui';
import { formatDistance } from '@/lib/format';
import { CATEGORY_META, useColors } from '@/lib/theme';
import type { SpaceWithAttributes } from '@/types/space';

interface SpaceCardProps {
  space: SpaceWithAttributes;
  onPress?: () => void;
  showDistance?: boolean;
  compact?: boolean;
  bordered?: boolean;
  accessory?: React.ReactNode;
}

export default function SpaceCard({
  space,
  onPress,
  showDistance = false,
  compact = false,
  bordered = true,
  accessory,
}: SpaceCardProps) {
  const colors = useColors();
  const { attributes } = space;
  const purpose = space.primary_purpose || attributes?.primary_purpose;
  const distance = showDistance ? formatDistance(space.distance) : null;
  const meta = [CATEGORY_META[space.category].short, purpose, distance].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`${bordered ? 'bg-surface rounded-2xl' : ''} ${compact ? 'p-3' : 'p-4'}`}
    >
      <View className="flex-row items-center">
        <CategoryIcon category={space.category} size={compact ? 40 : 44} />
        <View className="flex-1 mx-3">
          <View className="flex-row items-center">
            <Text className={`font-semibold text-ink flex-shrink ${compact ? 'text-[15px]' : 'text-[16px]'}`} numberOfLines={1}>
              {space.name}
            </Text>
            {space.is_secret && (
              <View className="ml-1.5">
                <KeyRound size={13} color={colors.secret} />
              </View>
            )}
          </View>
          <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{meta}</Text>
          {!compact && (
            <Text className="text-[13px] text-subtle mt-0.5" numberOfLines={1}>{space.address}</Text>
          )}
        </View>
        {accessory ?? (attributes ? (
          <View className="items-end">
            <ScorePill score={attributes.overall_score} size={compact ? 'sm' : 'md'} />
            <Text className="text-[11px] text-subtle mt-1">
              {attributes.total_ratings} {attributes.total_ratings === 1 ? 'rating' : 'ratings'}
            </Text>
          </View>
        ) : null)}
      </View>

      {attributes && !compact && (
        <View className="mt-3.5 pt-3.5 border-t border-line-soft">
          <AttributeBars category={attributes.category} scores={attributes.attribute_scores} />
        </View>
      )}
    </TouchableOpacity>
  );
}
