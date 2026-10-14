import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  History,
  Lock,
  MapPin,
  MapPinCheck,
  MessageCircle,
  MessageSquareQuote,
  Share2,
  Users,
} from 'lucide-react-native';
import { EventPoster, ThemePicker } from '@/components/EventPoster';
import GoingFaces from '@/components/GoingFaces';
import InviteSheet from '@/components/InviteSheet';
import PeopleListSheet from '@/components/PeopleListSheet';
import { Avatar, CategoryIcon, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  cancelHostedEvent,
  canUseEventChat,
  getEvent,
  listEventMentions,
  listOutgoingInvites,
  listSocialProfiles,
  sendEventInvite,
  setEventCheckin,
  setEventRsvp,
  updateHostedEventTheme,
} from '@/lib/data';
import {
  formatEventWhen,
  getChatClosesAt,
  getEventPhase,
  isChatOpen,
  isHostedEvent,
  nextOccurrenceAfter,
  parseDateKey,
  type EventPhase,
} from '@/lib/events';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import { copyInviteLink, eventHref, eventShareUrl, openDirectMessage, openEventChat, openExternalUrl, openHereChat, openProfile, requireSignedIn, shareEvent } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { EventMention, EventTheme, InviteStatus, Profile, RsvpStatus, SpaceEvent } from '@/types/space';

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

function usePhase(event: SpaceEvent | null): EventPhase {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return event?.occurrence_date ? getEventPhase(event, event.occurrence_date, now) : 'upcoming';
}

function viewerRecapLine(event: SpaceEvent, isHost: boolean) {
  if (event.viewer_here) return { text: 'You were there', tone: 'success' as const };
  if (isHost) return { text: 'You hosted this one', tone: 'neutral' as const };
  if (event.viewer_going) return { text: 'You said you were going', tone: 'neutral' as const };
  if (event.viewer_rsvp === 'not_going') return { text: "You couldn't make it", tone: 'neutral' as const };
  return undefined;
}

function RecapStat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 bg-slate-50 rounded-2xl px-4 py-3">
      <Text className="text-[24px] font-extrabold text-ink">{value}</Text>
      <Text className="text-[13px] text-slate-500">{label}</Text>
    </View>
  );
}

// Stands in for the RSVP buttons once an event is over, so it's clear why they're gone and what to do next.
function EventRecap({
  event,
  userId,
  isHost,
  onOpenDate,
  onOpenPeople,
}: {
  event: SpaceEvent;
  userId: string;
  isHost: boolean;
  onOpenDate: (date: string) => void;
  onOpenPeople: () => void;
}) {
  const occurrence = event.occurrence_date || event.event_date;
  const when = occurrence ? formatEventWhen({ ...event, kind: 'one_time' }, occurrence) : undefined;
  const next = occurrence ? nextOccurrenceAfter(event, occurrence) : undefined;
  const viewerLine = viewerRecapLine(event, isHost);
  const crowd = event.here.length > 0 ? event.here : event.going;

  return (
    <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-3">
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-2xl bg-slate-100 items-center justify-center">
          <History size={20} color={colors.muted} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[17px] font-bold text-ink">This one has ended</Text>
          {when && <Text className="text-[13px] text-slate-500 mt-0.5">It happened {when}.</Text>}
        </View>
      </View>

      {viewerLine && (
        <View
          className={`self-start flex-row items-center rounded-full px-3 py-1.5 mt-4 ${
            viewerLine.tone === 'success' ? 'bg-emerald-50' : 'bg-slate-100'
          }`}
        >
          {viewerLine.tone === 'success' && <Check size={14} color={colors.success} />}
          <Text className={`text-[13px] font-semibold ml-1 ${viewerLine.tone === 'success' ? 'text-emerald-700' : 'text-slate-600'}`}>
            {viewerLine.text}
          </Text>
        </View>
      )}

      <View className="flex-row gap-2 mt-4">
        <RecapStat value={event.going_count} label="said they were going" />
        <RecapStat value={event.here_count} label="checked in" />
      </View>

      {crowd.length > 0 && (
        <TouchableOpacity
          onPress={onOpenPeople}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={event.here.length > 0 ? 'See who showed up' : 'See who was going'}
          className="mt-4"
        >
          <View className="flex-row items-center mb-2">
            <Text className="text-[12px] font-semibold text-slate-400 uppercase flex-1">
              {event.here.length > 0 ? 'Who showed up' : 'Who was going'}
            </Text>
            <ChevronRight size={16} color={colors.subtle} />
          </View>
          <GoingFaces people={crowd} currentUserId={userId} size={32} />
        </TouchableOpacity>
      )}

      <Text className="text-[13px] text-slate-500 mt-4 leading-[18px]">
        RSVPs and check-ins close once an event wraps up.
      </Text>

      {next ? (
        <TouchableOpacity
          onPress={() => onOpenDate(next)}
          activeOpacity={0.85}
          className="h-[52px] rounded-2xl bg-primary flex-row items-center justify-center mt-4"
        >
          <Text className="font-bold text-base text-white">
            RSVP for {parseDateKey(next).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          <ArrowRight size={18} color="white" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      ) : isHost ? (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/event/new', params: { spaceId: event.space.id } } as never)}
          activeOpacity={0.85}
          className="h-[52px] rounded-2xl bg-primary flex-row items-center justify-center mt-4"
        >
          <CalendarDays size={18} color="white" />
          <Text className="font-bold text-base text-white ml-2">Host another one here</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => router.push('/calendar' as never)}
          activeOpacity={0.85}
          className="h-[52px] rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center mt-4"
        >
          <CalendarDays size={18} color={colors.primary} />
          <Text className="font-bold text-base text-ink ml-2">See what&apos;s coming up</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const MENTIONS_PREVIEW = 3;

function EventMentions({ mentions, spaceName, userId }: { mentions: EventMention[]; spaceName: string; userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, MENTIONS_PREVIEW);
  const hidden = mentions.length - visible.length;

  return (
    <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-3">
      <View className="flex-row items-center mb-1">
        <MessageSquareQuote size={18} color={colors.primary} />
        <Text className="text-[17px] font-bold text-ink ml-2 flex-1">What people are saying</Text>
        <Text className="text-[13px] font-semibold text-slate-400">{mentions.length} mentions</Text>
      </View>

      {visible.map((mention, index) => {
        const fromPlace = mention.source_type === 'space';
        const name = fromPlace ? spaceName : getDisplayName(mention.profile);
        const authorId = mention.profile?.user_id;
        return (
          <View key={mention.id} className={`py-3 ${index > 0 ? 'border-t border-slate-100' : ''}`}>
            <TouchableOpacity
              disabled={!authorId}
              onPress={() => authorId && openProfile(authorId, userId)}
              activeOpacity={0.7}
              className="flex-row items-center"
            >
              <Avatar name={name} size={28} />
              <View className="flex-1 ml-2.5">
                <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
                  {fromPlace ? 'From the place description' : name}
                </Text>
                <Text className="text-[12px] text-slate-400">
                  {formatTimeAgo(mention.source_created_at)}
                  {` · says ${formatEventWhen(mention)}`}
                </Text>
              </View>
            </TouchableOpacity>
            <Text className="text-[15px] text-slate-600 italic leading-[22px] mt-2">“{mention.snippet}”</Text>
            {mention.link_url && (
              <TouchableOpacity onPress={() => openExternalUrl(mention.link_url)} className="flex-row items-center mt-1.5" activeOpacity={0.7}>
                <ExternalLink size={12} color={colors.primary} />
                <Text className="text-[13px] font-semibold text-primary ml-1">{linkLabel(mention.link_url)}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {mentions.length > MENTIONS_PREVIEW && (
        <TouchableOpacity onPress={() => setExpanded((value) => !value)} className="pt-2 items-center" activeOpacity={0.7}>
          <Text className="text-primary font-semibold">{expanded ? 'Show fewer' : `Show ${hidden} more`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id: string; token?: string | string[]; date?: string | string[]; invite?: string | string[] }>();
  const eventId = firstParam(params.id) || '';
  const token = firstParam(params.token);
  const date = firstParam(params.date);
  const inviteParam = firstParam(params.invite);
  const { user, userId } = useAuth();
  const [event, setEvent] = useState<SpaceEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mentions, setMentions] = useState<EventMention[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showGoing, setShowGoing] = useState(false);
  const [showHere, setShowHere] = useState(false);
  const [invitePeople, setInvitePeople] = useState<Profile[]>([]);
  const [invited, setInvited] = useState<Record<string, InviteStatus>>({});
  const [inviteLoading, setInviteLoading] = useState(false);
  const openedInvite = useRef(false);
  const phase = usePhase(event);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const loaded = await getEvent(eventId, userId, token, date);
      setEvent(loaded);
      setMentions(loaded ? await listEventMentions(loaded) : []);
    } catch {
      Alert.alert('Event', 'Could not load this hangout.');
    } finally {
      setIsLoading(false);
    }
  }, [date, eventId, token, userId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const nextHref = event ? eventHref(event.id, token, event.occurrence_date) : eventHref(eventId, token, date);

  const savePresence = async (title: string, change: () => Promise<void>) => {
    if (!event) return;
    setIsSaving(true);
    try {
      await change();
      setEvent(await getEvent(event.id, userId, token, event.occurrence_date));
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const rsvp = (status: RsvpStatus) => {
    if (!event) return;
    if (!requireSignedIn(Boolean(user), nextHref, 'Sign in to RSVP. We will bring you back to this hangout.')) return;
    savePresence('RSVP', () =>
      setEventRsvp(userId, event.id, event.viewer_rsvp === status ? null : status, token, event.occurrence_date));
  };

  const toggleHere = () => {
    if (!event) return;
    if (!requireSignedIn(Boolean(user), nextHref, 'Sign in to check in. We will bring you back to this hangout.')) return;
    savePresence("I'm here", () => setEventCheckin(userId, event.id, !event.viewer_here, token, event.occurrence_date));
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

  const openInvites = async () => {
    if (!event) return;
    setShowInvite(true);
    setInviteLoading(true);
    try {
      const [following, statuses] = await Promise.all([
        listSocialProfiles('following', userId),
        listOutgoingInvites('event', event.id, userId),
      ]);
      setInvitePeople(following);
      setInvited(statuses);
    } catch (error) {
      Alert.alert('Invites', error instanceof Error ? error.message : 'Could not load people you follow.');
    } finally {
      setInviteLoading(false);
    }
  };

  const invitePerson = async (inviteeId: string) => {
    if (!event) return;
    setInvited((current) => ({ ...current, [inviteeId]: 'pending' }));
    try {
      await sendEventInvite(userId, event.id, inviteeId);
    } catch (error) {
      setInvited((current) => {
        const next = { ...current };
        delete next[inviteeId];
        return next;
      });
      Alert.alert('Invite', error instanceof Error ? error.message : 'Could not send that invite.');
    }
  };

  useEffect(() => {
    if (inviteParam !== '1' || !event || event.host_user_id !== userId || openedInvite.current) return;
    openedInvite.current = true;
    router.setParams({ invite: '' });
    openInvites();
  }, [event, inviteParam, userId]);

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
  const ended = phase === 'ended';
  const headcount = event.capacity ? `${event.going_count} / ${event.capacity} going` : `${event.going_count} going`;
  const capNote = event.capacity
    ? atCap
      ? event.allow_over_capacity ? 'Cap reached. The host is letting extras in.' : 'Full. Spots open up if someone drops.'
      : `${event.capacity - event.going_count} spots open`
    : undefined;
  const chatAvailable = canUseEventChat(event, userId);
  const chatCanOpenLater = !chatAvailable && !ended && Boolean(event.occurrence_date && isChatOpen(event.occurrence_date));
  const chatClosed = ended && !chatAvailable && !event.cancelled_at && (event.viewer_going || isHost);
  const chatClosesLabel = event.occurrence_date
    ? getChatClosesAt(event.occurrence_date).toLocaleDateString(undefined, { weekday: 'long' })
    : undefined;
  const mentionCount = Math.max(event.mention_count || 1, mentions.length);
  const showMentions = !hosted && mentions.length > 1;

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
                ended={ended}
              />
            </View>
          ) : (
            <View style={{ backgroundColor: meta.tint }} className="px-5 pt-5 pb-4">
              <View className="flex-row items-center">
                <View style={{ backgroundColor: meta.color }} className="rounded-full px-2.5 py-1">
                  <Text className="text-white text-[11px] font-bold uppercase">Mentioned</Text>
                </View>
                {ended && (
                  <View className="rounded-full px-2.5 py-1 ml-2 bg-slate-700">
                    <Text className="text-white text-[11px] font-bold uppercase">Ended</Text>
                  </View>
                )}
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
                {!hosted && mentionCount > 1 && (
                  <Text className="text-slate-500"> and {mentionCount - 1} {mentionCount === 2 ? 'other' : 'others'}</Text>
                )}
              </TouchableOpacity>
            )}

            {hosted && event.description && (
              <Text className="text-[15px] text-slate-700 leading-[22px]">{event.description}</Text>
            )}
            {!hosted && !showMentions && (
              <Text className="text-[15px] text-slate-600 italic leading-[22px]">“{event.snippet}”</Text>
            )}
          </View>
        </View>

        {isHost && !event.cancelled_at && !ended && (
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

        {!event.cancelled_at && phase === 'live' && (
          <View style={{ borderColor: colors.success }} className="bg-white rounded-3xl border p-5 mt-3">
            <TouchableOpacity
              onPress={() => event.here.length > 0 && setShowHere(true)}
              disabled={event.here.length === 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`See who is here, ${event.here_count} here now`}
              className="flex-row items-center"
            >
              <View className="flex-row items-center bg-emerald-50 rounded-full px-2.5 py-1 mr-2">
                <View style={{ backgroundColor: colors.success }} className="w-2 h-2 rounded-full" />
                <Text className="text-[11px] font-bold text-emerald-700 uppercase ml-1.5">Live</Text>
              </View>
              <Text className="text-[17px] font-bold text-ink flex-1">{event.here_count} here now</Text>
              {event.here.length > 0 && <ChevronRight size={18} color={colors.subtle} />}
            </TouchableOpacity>
            {event.here.length > 0 ? (
              <View className="mt-3">
                <GoingFaces people={event.here} currentUserId={userId} size={36} />
              </View>
            ) : (
              <Text className="text-slate-500 mt-2">No one has checked in yet.</Text>
            )}
            <TouchableOpacity
              onPress={toggleHere}
              disabled={isSaving}
              activeOpacity={0.85}
              style={{ backgroundColor: event.viewer_here ? colors.success : colors.ink }}
              className="h-[52px] rounded-2xl flex-row items-center justify-center mt-4"
              accessibilityState={{ selected: event.viewer_here }}
            >
              {event.viewer_here ? <Check size={18} color="white" /> : <MapPinCheck size={18} color="white" />}
              <Text className="font-bold text-base text-white ml-1.5">{event.viewer_here ? "You're here" : "I'm here"}</Text>
            </TouchableOpacity>
            <Text className="text-[12px] text-slate-400 text-center mt-2">
              {event.viewer_here ? 'Tap again if you checked in by mistake.' : 'Let people know you made it.'}
            </Text>
          </View>
        )}

        {!event.cancelled_at && ended && (
          <EventRecap
            event={event}
            userId={userId}
            isHost={isHost}
            onOpenDate={(next) => router.setParams({ date: next })}
            onOpenPeople={() => {
              if (event.here.length > 0) setShowHere(true);
              else setShowGoing(true);
            }}
          />
        )}

        {!event.cancelled_at && !ended && (
          <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-3">
            <TouchableOpacity
              onPress={() => event.going.length > 0 && setShowGoing(true)}
              disabled={event.going.length === 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`See who is going, ${headcount}`}
              className="flex-row items-center"
            >
              <Users size={16} color={colors.primary} />
              <Text className="text-[17px] font-bold text-ink ml-2 flex-1">{headcount}</Text>
              {event.going.length > 0 && <ChevronRight size={18} color={colors.subtle} />}
            </TouchableOpacity>
            {event.kind === 'weekly' && event.occurrence_date && (
              <Text className="text-[13px] text-slate-500 mt-1">For {formatEventWhen({ ...event, kind: 'one_time' }, event.occurrence_date)}</Text>
            )}
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

        {chatAvailable && (
          <TouchableOpacity
            onPress={() => openEventChat(event.id, token, event.occurrence_date)}
            activeOpacity={0.85}
            className="bg-white rounded-3xl border border-slate-200 p-5 mt-3 flex-row items-center"
          >
            <View style={{ backgroundColor: colors.primarySoft }} className="w-10 h-10 rounded-2xl items-center justify-center">
              <MessageCircle size={20} color={colors.primary} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-[16px] font-bold text-ink">Group chat</Text>
              <Text className="text-[13px] text-slate-500 mt-0.5">
                {ended && chatClosesLabel
                  ? `Still open for follow-ups. Disappears ${chatClosesLabel}.`
                  : 'With everyone going. Disappears the day after.'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        )}
        {chatCanOpenLater && (
          <View className="flex-row items-center mt-3 px-1">
            <Lock size={14} color={colors.subtle} />
            <Text className="text-[13px] text-slate-500 ml-2 flex-1">Tap &quot;I&apos;m in&quot; to join the group chat with everyone going.</Text>
          </View>
        )}
        {chatClosed && (
          <View className="flex-row items-center mt-3 px-1">
            <MessageCircle size={14} color={colors.subtle} />
            <Text className="text-[13px] text-slate-500 ml-2 flex-1">The group chat for this one has disappeared.</Text>
          </View>
        )}

        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            onPress={() => copyInviteLink(eventShareUrl(event))}
            className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center"
          >
            <Copy size={16} color={colors.ink} />
            <Text className="font-semibold text-ink ml-2">Copy link</Text>
          </TouchableOpacity>
          {isHost && (
            <TouchableOpacity
              onPress={openInvites}
              className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center"
            >
              <Users size={16} color={colors.ink} />
              <Text className="font-semibold text-ink ml-2">Invite</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => shareEvent(event)}
            className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center"
          >
            <Share2 size={16} color={colors.ink} />
            <Text className="font-semibold text-ink ml-2">Share</Text>
          </TouchableOpacity>
        </View>
        {event.link_url && (
          <View className="mt-2">
            <TouchableOpacity
              onPress={() => openExternalUrl(event.link_url)}
              className="flex-1 h-12 rounded-2xl bg-primary flex-row items-center justify-center"
            >
              <ExternalLink size={16} color="white" />
              <Text className="font-semibold text-white ml-2" numberOfLines={1}>{linkLabel(event.link_url)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {showMentions && <EventMentions mentions={mentions} spaceName={event.space.name} userId={userId} />}

        {!hosted && (
          <View className="flex-row items-center mt-4 px-1">
            <CalendarDays size={14} color={colors.subtle} />
            <Text className="text-[13px] text-slate-500 ml-2 flex-1">Mentioned in reviews. Headcounts are 3rdSpace people, not the venue&apos;s list.</Text>
          </View>
        )}

        {isHost && !event.cancelled_at && !ended && (
          <TouchableOpacity onPress={cancel} className="mt-6 items-center">
            <Text className="text-rose-600 font-semibold">Cancel hangout</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <PeopleListSheet
        visible={showGoing}
        title={headcount}
        people={event.going}
        currentUserId={userId}
        onClose={() => setShowGoing(false)}
        onMessage={(person) => {
          setShowGoing(false);
          openDirectMessage(person.user_id);
        }}
      />
      <PeopleListSheet
        visible={showHere}
        title={ended ? `${event.here_count} checked in` : `${event.here_count} here now`}
        people={event.here}
        currentUserId={userId}
        onClose={() => setShowHere(false)}
        actionLabel={phase === 'live' ? 'Chat with everyone here' : undefined}
        actionHint="Only people who checked in. This chat deletes when the hangout ends."
        onAction={phase === 'live' ? () => {
          setShowHere(false);
          if (!event.viewer_here) {
            Alert.alert('Check in first', 'Tap I\'m here to join the chat with everyone who is there.');
            return;
          }
          openHereChat(event.id, token, event.occurrence_date);
        } : undefined}
        onMessage={(person) => {
          setShowHere(false);
          openDirectMessage(person.user_id);
        }}
      />
      {isHost && (
        <InviteSheet
          visible={showInvite}
          title="Invite people"
          url={eventShareUrl(event)}
          people={invitePeople}
          invited={invited}
          loading={inviteLoading}
          onClose={() => setShowInvite(false)}
          onCopy={() => copyInviteLink(eventShareUrl(event))}
          onShare={() => shareEvent(event)}
          onInvite={invitePerson}
        />
      )}
    </SafeAreaView>
  );
}
