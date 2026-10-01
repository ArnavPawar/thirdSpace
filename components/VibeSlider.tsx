import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

interface VibeSliderProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  description?: string;
  disabled?: boolean;
  color?: string;
}

const VALUE_LABELS = ['Poor', 'Meh', 'Okay', 'Good', 'Great'];

export default function VibeSlider({
  label,
  value,
  onValueChange,
  description,
  disabled = false,
  color = colors.primary,
}: VibeSliderProps) {
  return (
    <View className="mb-5">
      <View className="flex-row justify-between items-baseline">
        <Text className="text-[15px] font-bold text-ink">{label}</Text>
        <Text style={{ color }} className="text-sm font-bold">{VALUE_LABELS[value - 1]}</Text>
      </View>
      {description && <Text className="text-[13px] text-slate-500 mt-0.5 mb-2.5">{description}</Text>}

      <View className="flex-row gap-1.5">
        {[1, 2, 3, 4, 5].map((rating) => {
          const isFilled = rating <= value;
          return (
            <Pressable
              key={rating}
              onPress={() => !disabled && onValueChange(rating)}
              disabled={disabled}
              accessibilityLabel={`${label} ${rating} of 5`}
              style={{ backgroundColor: isFilled ? color : '#f1f5f9' }}
              className="flex-1 h-10 rounded-xl items-center justify-center"
            >
              <Text className={`font-bold ${isFilled ? 'text-white' : 'text-slate-400'}`}>{rating}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
