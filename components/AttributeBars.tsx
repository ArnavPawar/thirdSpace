import React from 'react';
import { Text, View } from 'react-native';
import { CATEGORY_CONFIG, type AttributeScores, type SpaceCategory } from '@/types/space';
import { CATEGORY_META } from '@/lib/theme';

export default function AttributeBars({
  category,
  scores,
  columns = 2,
}: {
  category: SpaceCategory;
  scores: AttributeScores;
  columns?: 1 | 2;
}) {
  const color = CATEGORY_META[category].color;
  const items = CATEGORY_CONFIG[category].attributes.flatMap((attribute) => {
    const value = scores[attribute.key];
    return typeof value === 'number' ? [{ key: attribute.key, label: attribute.label, value }] : [];
  });

  if (items.length === 0) return null;

  return (
    <View className="flex-row flex-wrap -mx-2">
      {items.map((item) => (
        <View key={item.key} style={{ width: columns === 2 ? '50%' : '100%' }} className="px-2 mb-2.5">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-slate-500 flex-1" numberOfLines={1}>{item.label}</Text>
            <Text className="text-xs font-bold text-slate-700 ml-2">{Number(item.value.toFixed(1))}</Text>
          </View>
          <View className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <View style={{ width: `${(item.value / 5) * 100}%`, backgroundColor: color }} className="h-1.5 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}
