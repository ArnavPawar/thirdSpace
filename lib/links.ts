import { Alert, Linking, Platform, Share } from 'react-native';
import type { SpaceWithAttributes } from '@/types/space';

export function getDirectionsUrl(space: SpaceWithAttributes) {
  const label = encodeURIComponent(space.name);
  const coordinate = `${space.latitude},${space.longitude}`;

  if (Platform.OS === 'ios') {
    return `http://maps.apple.com/?ll=${coordinate}&q=${label}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${coordinate}&query_place_id=${label}`;
}

export async function openDirections(space: SpaceWithAttributes) {
  const url = getDirectionsUrl(space);
  const canOpen = await Linking.canOpenURL(url);

  if (!canOpen) {
    Alert.alert('Directions Unavailable', 'Could not open a maps app on this device.');
    return;
  }

  await Linking.openURL(url);
}

export async function openExternalUrl(url?: string) {
  if (!url) return;

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('Link Unavailable', 'Could not open this link.');
    return;
  }

  await Linking.openURL(url);
}

export async function shareSpace(space: SpaceWithAttributes) {
  await Share.share({
    title: space.name,
    message: `${space.name}\n${space.address}\n${getDirectionsUrl(space)}`,
  });
}
