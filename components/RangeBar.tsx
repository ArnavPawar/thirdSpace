import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors } from '@/lib/theme';

export const RANGE_STOPS = [1, 3, 5, 10, 25] as const;
export type RangeMiles = (typeof RANGE_STOPS)[number];

interface RangeBarProps {
  value: RangeMiles;
  onChange: (value: RangeMiles) => void;
  eventCount?: number;
}

export default function RangeBar({ value, onChange, eventCount }: RangeBarProps) {
  const selectedIndex = RANGE_STOPS.indexOf(value);

  return (
    <View className="bg-white rounded-3xl border border-slate-200 px-4 pt-3.5 pb-3">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <MapPin size={15} color={colors.primary} />
          <Text className="text-[15px] font-bold text-ink ml-1.5">Within {value} mi</Text>
        </View>
        {eventCount !== undefined && (
          <Text className="text-[13px] font-semibold text-slate-500">
            {eventCount === 1 ? '1 event' : `${eventCount} events`} this month
          </Text>
        )}
      </View>

      <View className="flex-row gap-1.5">
        {RANGE_STOPS.map((stop, index) => {
          const isFilled = index <= selectedIndex;
          const isSelected = index === selectedIndex;
          return (
            <Pressable
              key={stop}
              onPress={() => onChange(stop)}
              accessibilityRole="button"
              accessibilityLabel={`Show events within ${stop} miles`}
              accessibilityState={{ selected: isSelected }}
              hitSlop={{ top: 10, bottom: 10 }}
              className="flex-1 items-center"
            >
              <View
                style={{ backgroundColor: isFilled ? colors.primary : '#e2e8f0', opacity: isFilled && !isSelected ? 0.55 : 1 }}
                className="h-2 w-full rounded-full"
              />
              <Text
                style={{ color: isSelected ? colors.primary : colors.subtle }}
                className="text-[12px] font-bold mt-1.5"
              >
                {stop} mi
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
