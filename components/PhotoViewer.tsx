import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import type { ReviewPhoto } from '@/types/space';

interface PhotoViewerProps {
  photos: ReviewPhoto[];
  initialIndex: number | null;
  onClose: () => void;
  onOpenReview?: (ratingId: string) => void;
}

export default function PhotoViewer({ photos, initialIndex, onClose, onOpenReview }: PhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex ?? 0);
  const isOpen = initialIndex !== null && photos.length > 0;

  useEffect(() => {
    if (initialIndex !== null) setIndex(initialIndex);
  }, [initialIndex]);

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <Modal visible={isOpen} animationType="fade" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        {isOpen && (
          <FlatList
            data={photos}
            keyExtractor={(photo) => photo.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex ?? 0}
            getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={{ width, height }} className="items-center justify-center">
                <Image source={{ uri: item.url }} style={{ width, height }} contentFit="contain" transition={150} />
              </View>
            )}
          />
        )}

        <SafeAreaView edges={['top', 'bottom']} pointerEvents="box-none" className="absolute inset-0 justify-between">
          <View className="flex-row items-center justify-between px-4 pt-2" pointerEvents="box-none">
            <Text className="text-white/80 font-semibold">
              {photos.length > 0 ? `${index + 1} of ${photos.length}` : ''}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close photos"
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-white/15 items-center justify-center"
            >
              <X size={20} color="white" />
            </TouchableOpacity>
          </View>

          {current && (
            <View className="mx-4 mb-3 bg-black/60 rounded-2xl px-4 py-3 flex-row items-center">
              <View className="flex-1">
                <Text className="text-white font-semibold">
                  {getDisplayName(current.profile)}
                </Text>
                <Text className="text-white/60 text-xs mt-0.5">
                  {current.comment_id ? 'In a comment' : 'In a review'} · {formatTimeAgo(current.created_at)}
                </Text>
              </View>
              {current.rating_id && onOpenReview && (
                <TouchableOpacity
                  onPress={() => onOpenReview(current.rating_id!)}
                  activeOpacity={0.7}
                  className="px-3 h-9 rounded-full bg-white items-center justify-center"
                >
                  <Text className="text-ink font-semibold text-sm">See review</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
