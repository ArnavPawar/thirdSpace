import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import type { ReviewPhoto } from '@/types/space';

interface PhotoGridProps {
  photos: ReviewPhoto[];
  onPressPhoto: (index: number) => void;
  size?: number;
  maxVisible?: number;
}

export default function PhotoGrid({ photos, onPressPhoto, size = 88, maxVisible = 4 }: PhotoGridProps) {
  if (photos.length === 0) return null;

  const visible = photos.slice(0, maxVisible);
  const hiddenCount = photos.length - visible.length;

  return (
    <View className="flex-row flex-wrap gap-2">
      {visible.map((photo, index) => {
        const showOverflow = hiddenCount > 0 && index === visible.length - 1;
        return (
          <TouchableOpacity
            key={photo.id}
            onPress={() => onPressPhoto(index)}
            activeOpacity={0.85}
            accessibilityLabel={showOverflow ? `View all ${photos.length} photos` : 'View photo'}
            style={{ width: size, height: size }}
            className="rounded-xl overflow-hidden bg-slate-100"
          >
            <Image source={{ uri: photo.url }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
            {showOverflow && (
              <View className="absolute inset-0 bg-black/50 items-center justify-center">
                <Text className="text-white font-bold text-base">+{hiddenCount + 1}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
