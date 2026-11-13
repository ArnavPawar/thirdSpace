import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/lib/theme';

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
  color,
}: VibeSliderProps) {
  const colors = useColors();
  const tone = color ?? colors.primary;
  return (
    <View className="mb-5">
      <View className="flex-row justify-between items-baseline">
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        <Text style={{ color: tone }} className="text-[14px] font-semibold">{VALUE_LABELS[value - 1]}</Text>
      </View>
      {description && <Text className="text-[13px] text-muted mt-0.5">{description}</Text>}

      <View className="flex-row gap-1.5 mt-2.5">
        {[1, 2, 3, 4, 5].map((rating) => {
          const isFilled = rating <= value;
          return (
            <Pressable
              key={rating}
              onPress={() => !disabled && onValueChange(rating)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: rating === value }}
              accessibilityLabel={`${label} ${rating} of 5`}
              style={{ backgroundColor: isFilled ? tone : colors.fill }}
              className="flex-1 h-10 rounded-lg items-center justify-center"
            >
              <Text style={{ color: isFilled ? '#ffffff' : colors.subtle }} className="font-semibold text-[15px]">{rating}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
