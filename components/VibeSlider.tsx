import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface VibeSliderProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  description?: string;
  disabled?: boolean;
}

export default function VibeSlider({ 
  label, 
  value, 
  onValueChange, 
  description, 
  disabled = false 
}: VibeSliderProps) {
  const values = [1, 2, 3, 4, 5];

  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-lg font-semibold text-gray-800">{label}</Text>
        <Text className="text-sm font-medium text-primary">{value}/5</Text>
      </View>
      
      {description && (
        <Text className="text-sm text-gray-600 mb-3">{description}</Text>
      )}
      
      <View className="flex-row justify-between items-center">
        {values.map((rating) => (
          <TouchableOpacity
            key={rating}
            onPress={() => !disabled && onValueChange(rating)}
            disabled={disabled}
            className={`
              w-12 h-12 rounded-full border-2 items-center justify-center
              ${value === rating 
                ? 'bg-primary border-primary' 
                : 'bg-white border-gray-300'
              }
              ${disabled ? 'opacity-50' : 'active:scale-95'}
            `}
          >
            <Text 
              className={`
                font-bold text-base
                ${value === rating ? 'text-white' : 'text-gray-700'}
              `}
            >
              {rating}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View className="flex-row justify-between mt-2 px-1">
        <Text className="text-xs text-gray-500">Poor</Text>
        <Text className="text-xs text-gray-500">Excellent</Text>
      </View>
    </View>
  );
}