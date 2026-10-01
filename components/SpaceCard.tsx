import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { KeyRound, MapPin } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import { CategoryIcon, ScorePill } from '@/components/ui';
import { formatDistance } from '@/lib/format';
import { CATEGORY_META, colors } from '@/lib/theme';
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
  const { attributes } = space;
  const purpose = space.primary_purpose || attributes?.primary_purpose;
  const distance = showDistance ? formatDistance(space.distance) : null;
  const meta = [CATEGORY_META[space.category].short, purpose, distance].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.75}
      className={`bg-white rounded-2xl ${bordered ? 'border border-slate-200' : ''} ${compact ? 'p-3' : 'p-4'}`}
    >
      <View className="flex-row items-center">
        <CategoryIcon category={space.category} size={compact ? 40 : 48} />
        <View className="flex-1 mx-3">
          <View className="flex-row items-center">
            <Text className={`font-bold text-ink flex-shrink ${compact ? 'text-[15px]' : 'text-[17px]'}`} numberOfLines={1}>
              {space.name}
            </Text>
            {space.is_secret && (
              <View className="ml-1.5">
                <KeyRound size={13} color={colors.secret} />
              </View>
            )}
          </View>
          <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>{meta}</Text>
          {!compact && (
            <View className="flex-row items-center mt-1">
              <MapPin size={12} color={colors.subtle} />
              <Text className="text-xs text-slate-400 flex-1 ml-1" numberOfLines={1}>{space.address}</Text>
            </View>
          )}
        </View>
        {accessory ?? (attributes ? (
          <View className="items-center">
            <ScorePill score={attributes.overall_score} size={compact ? 'sm' : 'md'} />
            <Text className="text-[10px] text-slate-400 mt-1">
              {attributes.total_ratings} {attributes.total_ratings === 1 ? 'rating' : 'ratings'}
            </Text>
          </View>
        ) : null)}
      </View>

      {attributes && !compact && (
        <View className="mt-4 pt-3 border-t border-slate-100">
          <AttributeBars category={attributes.category} scores={attributes.attribute_scores} />
        </View>
      )}
    </TouchableOpacity>
  );
}
