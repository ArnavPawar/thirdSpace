import { Alert, Linking, Platform, Share } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { SpaceEvent, SpaceWithAttributes } from '@/types/space';

export function openProfile(profileUserId: string, currentUserId: string) {
  router.push((profileUserId === currentUserId ? '/profile' : `/user/${profileUserId}`) as never);
}

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

export function eventHref(eventId: string, token?: string) {
  return token ? `/event/${eventId}?token=${encodeURIComponent(token)}` : `/event/${eventId}`;
}

export function openEvent(eventId: string, token?: string) {
  router.push({
    pathname: '/event/[id]',
    params: token ? { id: eventId, token } : { id: eventId },
  } as never);
}

export function eventShareUrl(event: Pick<SpaceEvent, 'id' | 'visibility' | 'invite_token'>) {
  const token = event.visibility === 'private' ? event.invite_token : undefined;
  return ExpoLinking.createURL(`event/${event.id}`, token ? { queryParams: { token } } : undefined);
}

export async function shareEvent(event: Pick<SpaceEvent, 'id' | 'title' | 'visibility' | 'invite_token'> & { space: { name: string } }) {
  const url = eventShareUrl(event);
  await Share.share({
    title: event.title,
    message: `${event.title} at ${event.space.name}\n${url}`,
  });
}

export function requireSignedIn(hasUser: boolean, next: string, message: string) {
  if (!isSupabaseConfigured || hasUser) return true;
  Alert.alert('Sign in', message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Sign in', onPress: () => router.push({ pathname: '/auth', params: { next } } as never) },
  ]);
  return false;
}
