import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Check, ExternalLink, Lock, MapPin, Share2, Users } from 'lucide-react-native';
import { EventPoster, ThemePicker } from '@/components/EventPoster';
import GoingFaces from '@/components/GoingFaces';
import { CategoryIcon, EmptyState, PrimaryButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cancelHostedEvent, getEvent, setEventRsvp, updateHostedEventTheme } from '@/lib/data';
import { formatEventWhen, isHostedEvent } from '@/lib/events';
import { getDisplayName } from '@/lib/format';
import { eventHref, openExternalUrl, openProfile, requireSignedIn, shareEvent } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { EventTheme, RsvpStatus, SpaceEvent } from '@/types/space';

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id: string; token?: string | string[] }>();
  const eventId = firstParam(params.id) || '';
  const token = firstParam(params.token);
  const { user, userId } = useAuth();
  const [event, setEvent] = useState<SpaceEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setEvent(await getEvent(eventId, userId, token));
    } catch {
      Alert.alert('Event', 'Could not load this hangout.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, token, userId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const rsvp = async (status: RsvpStatus) => {
    if (!event) return;
    if (!requireSignedIn(Boolean(user), eventHref(event.id, token), 'Sign in to RSVP. We will bring you back to this hangout.')) return;
    setIsSaving(true);
    try {
      await setEventRsvp(userId, event.id, event.viewer_rsvp === status ? null : status, token);
      setEvent(await getEvent(event.id, userId, token));
    } catch (error) {
      Alert.alert('RSVP', error instanceof Error ? error.message : 'Could not update your RSVP.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = () => {
    if (!event) return;
    Alert.alert('Cancel this hangout?', 'It will drop off the calendar and map.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel hangout',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelHostedEvent(userId, event.id);
            router.back();
          } catch (error) {
            Alert.alert('Could not cancel', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 justify-center px-5">
        <EmptyState
          icon={Lock}
          title="This hangout is not available"
          body="It may be private, cancelled, or the link is missing its invite."
          actionLabel={user ? undefined : 'Sign in'}
          onAction={user ? undefined : () => router.push({ pathname: '/auth', params: { next: eventHref(eventId, token) } } as never)}
        />
      </SafeAreaView>
    );
  }

  const hosted = isHostedEvent(event);
  const meta = CATEGORY_META[event.space.category];
  const hostId = event.host_user_id || event.profile?.user_id;
  const hostName = getDisplayName(event.profile);
  const isHost = hosted && event.host_user_id === userId;
  const atCap = Boolean(event.capacity && event.going_count >= event.capacity);
  const isFull = atCap && !event.allow_over_capacity && !event.viewer_going;
  const headcount = event.capacity ? `${event.going_count} / ${event.capacity} going` : `${event.going_count} going`;
  const capNote = event.capacity
    ? atCap
      ? event.allow_over_capacity ? 'Cap reached. The host is letting extras in.' : 'Full. Spots open up if someone drops.'
      : `${event.capacity - event.going_count} spots left`
    : undefined;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
          {hosted ? (
            <View className="p-2 pb-0">
              <EventPoster
                title={event.title}
                when={formatEventWhen(event)}
                place={event.space.name}
                visibility={event.visibility}
                theme={event.theme}
                cancelled={Boolean(event.cancelled_at)}
              />
            </View>
          ) : (
            <View style={{ backgroundColor: meta.tint }} className="px-5 pt-5 pb-4">
              <View style={{ backgroundColor: meta.color }} className="self-start rounded-full px-2.5 py-1">
                <Text className="text-white text-[11px] font-bold uppercase">Mentioned</Text>
              </View>
              <Text className="text-[28px] font-extrabold text-ink mt-3">{event.title}</Text>
              <Text className="text-slate-600 mt-1">{formatEventWhen(event)}</Text>
            </View>
          )}

          <View className="px-5 py-4 gap-3">
            <TouchableOpacity onPress={() => router.push(`/space/${event.space.id}` as never)} className="flex-row items-center" activeOpacity={0.7}>
              <CategoryIcon category={event.space.category} size={40} />
              <View className="flex-1 ml-3">
                <Text className="font-bold text-ink" numberOfLines={1}>{event.space.name}</Text>
                <Text className="text-[13px] text-slate-500" numberOfLines={2}>{event.space.address}</Text>
              </View>
              <MapPin size={16} color={colors.subtle} />
            </TouchableOpacity>

            {hostId && (
              <TouchableOpacity onPress={() => openProfile(hostId, userId)} className="flex-row items-center" activeOpacity={0.7}>
                <Text className="text-slate-500">{hosted ? 'Hosted by' : 'Mentioned by'}</Text>
                <Text className="font-bold text-ink ml-1">{hostName}</Text>
              </TouchableOpacity>
            )}

            {hosted && event.description && (
              <Text className="text-[15px] text-slate-700 leading-[22px]">{event.description}</Text>
            )}
            {!hosted && (
              <Text className="text-[15px] text-slate-600 italic leading-[22px]">“{event.snippet}”</Text>
            )}
          </View>
        </View>

        {isHost && !event.cancelled_at && (
          <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-3">
            <Text className="text-[15px] font-bold text-ink mb-3">Look</Text>
            <ThemePicker
              value={event.theme}
              onChange={async (next: EventTheme) => {
                const previous = event.theme;
                setEvent({ ...event, theme: next });
                try {
                  await updateHostedEventTheme(userId, event.id, next);
                } catch (error) {
                  setEvent({ ...event, theme: previous });
                  Alert.alert('Look', error instanceof Error ? error.message : 'Could not save the theme.');
                }
              }}
            />
          </View>
        )}

        {hosted && !event.cancelled_at && (
          <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-3">
            <View className="flex-row items-center">
              <Users size={16} color={colors.primary} />
              <Text className="text-[17px] font-bold text-ink ml-2 flex-1">{headcount}</Text>
            </View>
            {capNote && <Text className={`text-[13px] mt-1 ${atCap ? 'text-amber-700' : 'text-slate-500'}`}>{capNote}</Text>}
            {event.going.length > 0 ? (
              <View className="mt-3">
                <GoingFaces people={event.going} currentUserId={userId} size={36} />
              </View>
            ) : (
              <Text className="text-slate-500 mt-2">No one has RSVPed yet. Be the first.</Text>
            )}
            <View className="flex-row gap-2 mt-4">
              <TouchableOpacity
                onPress={() => rsvp('going')}
                disabled={isSaving || isFull}
                activeOpacity={0.85}
                style={{ backgroundColor: event.viewer_rsvp === 'going' ? colors.success : isFull ? colors.border : colors.primary }}
                className="flex-1 h-[52px] rounded-2xl flex-row items-center justify-center"
              >
                {event.viewer_rsvp === 'going' && <Check size={18} color="white" />}
                <Text className={`font-bold text-base ml-1.5 ${isFull ? 'text-slate-400' : 'text-white'}`}>
                  {event.viewer_rsvp === 'going' ? 'Going' : isFull ? 'Full' : "I'm in"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => rsvp('not_going')}
                disabled={isSaving}
                activeOpacity={0.85}
                className={`flex-1 h-[52px] rounded-2xl flex-row items-center justify-center border ${
                  event.viewer_rsvp === 'not_going' ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <Text className={`font-bold text-base ${event.viewer_rsvp === 'not_going' ? 'text-white' : 'text-ink'}`}>
                  Can&apos;t go
                </Text>
              </TouchableOpacity>
            </View>
            {event.viewer_rsvp && (
              <Text className="text-[12px] text-slate-400 text-center mt-2">Tap your answer again to clear it.</Text>
            )}
          </View>
        )}

        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            onPress={() => shareEvent(event)}
            className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center"
          >
            <Share2 size={16} color={colors.ink} />
            <Text className="font-semibold text-ink ml-2">{event.visibility === 'private' ? 'Share invite' : 'Share'}</Text>
          </TouchableOpacity>
          {event.link_url && (
            <TouchableOpacity
              onPress={() => openExternalUrl(event.link_url)}
              className="flex-1 h-12 rounded-2xl bg-primary flex-row items-center justify-center"
            >
              <ExternalLink size={16} color="white" />
              <Text className="font-semibold text-white ml-2" numberOfLines={1}>{linkLabel(event.link_url)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {!hosted && (
          <View className="flex-row items-center mt-4 px-1">
            <CalendarDays size={14} color={colors.subtle} />
            <Text className="text-[13px] text-slate-500 ml-2 flex-1">Mentioned in reviews. This one is not a hosted RSVP.</Text>
          </View>
        )}

        {isHost && !event.cancelled_at && (
          <TouchableOpacity onPress={cancel} className="mt-6 items-center">
            <Text className="text-rose-600 font-semibold">Cancel hangout</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
