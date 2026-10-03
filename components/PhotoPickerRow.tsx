import React from 'react';
import { Alert, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { MAX_PHOTOS_PER_POST, type LocalPhoto } from '@/types/space';

const toLocalPhotos = (result: ImagePicker.ImagePickerResult): LocalPhoto[] =>
  result.canceled ? [] : result.assets.map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height }));

async function chooseFromLibrary(limit: number): Promise<LocalPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });
  return toLocalPhotos(result).slice(0, limit);
}

async function takePhoto(): Promise<LocalPhoto[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
    return [];
  }
  return toLocalPhotos(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
}

/** Asks for up to `limit` photos from the camera or library. Web only has the library. */
export function pickPhotos(limit: number): Promise<LocalPhoto[]> {
  if (limit <= 0) return Promise.resolve([]);
  if (Platform.OS === 'web') return chooseFromLibrary(limit);

  return new Promise((resolve) => {
    const settle = (picker: () => Promise<LocalPhoto[]>) => () => {
      picker().then(resolve).catch(() => resolve([]));
    };
    Alert.alert('Add photos', undefined, [
      { text: 'Take photo', onPress: settle(takePhoto) },
      { text: 'Choose from library', onPress: settle(() => chooseFromLibrary(limit)) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve([]) },
    ], { cancelable: true, onDismiss: () => resolve([]) });
  });
}

interface PhotoThumbnailsProps {
  photos: LocalPhoto[];
  onRemove: (index: number) => void;
  size?: number;
  disabled?: boolean;
}

export function PhotoThumbnails({ photos, onRemove, size = 72, disabled }: PhotoThumbnailsProps) {
  return (
    <>
      {photos.map((photo, index) => (
        <View key={photo.uri} style={{ width: size, height: size }} className="rounded-xl overflow-hidden bg-slate-100">
          <Image source={{ uri: photo.uri }} style={{ width: size, height: size }} contentFit="cover" />
          {!disabled && (
            <TouchableOpacity
              onPress={() => onRemove(index)}
              accessibilityLabel="Remove photo"
              hitSlop={8}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 items-center justify-center"
            >
              <X size={12} color="white" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </>
  );
}

interface PhotoPickerRowProps {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
  max?: number;
  disabled?: boolean;
}

export default function PhotoPickerRow({ photos, onChange, max = MAX_PHOTOS_PER_POST, disabled }: PhotoPickerRowProps) {
  const remaining = max - photos.length;

  const handleAdd = async () => {
    const picked = await pickPhotos(remaining);
    if (picked.length > 0) onChange([...photos, ...picked].slice(0, max));
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      <PhotoThumbnails
        photos={photos}
        disabled={disabled}
        onRemove={(index) => onChange(photos.filter((_, photoIndex) => photoIndex !== index))}
      />
      {remaining > 0 && !disabled && (
        <TouchableOpacity
          onPress={handleAdd}
          accessibilityLabel="Add photos"
          activeOpacity={0.7}
          className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-slate-300 bg-white items-center justify-center"
        >
          <ImagePlus size={22} color={colors.muted} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
