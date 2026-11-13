import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  History,
  Lock,
  MapPinCheck,
  MessageCircle,
  Plus,
  Share2,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { EventPoster, ThemePicker } from '@/components/EventPoster';
import GoingFaces from '@/components/GoingFaces';
import InviteSheet from '@/components/InviteSheet';
import PeopleListSheet from '@/components/PeopleListSheet';
import { Avatar, CategoryIcon, EmptyState, PrimaryButton } from '@/components/ui';
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
import { CATEGORY_META, useColors } from '@/lib/theme';
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
    <View className="flex-1 bg-fill rounded-xl px-4 py-3">
      <Text className="text-[22px] font-bold text-ink tracking-tight">{value}</Text>
      <Text className="text-[13px] text-muted mt-0.5">{label}</Text>
    </View>
  );
}

function ShareAction({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      className="flex-1 h-[60px] rounded-2xl bg-surface items-center justify-center"
    >
      <Icon size={18} color={colors.ink} />
      <Text className="text-[13px] font-medium text-ink mt-1">{label}</Text>
    </TouchableOpacity>
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
  const colors = useColors();
  const occurrence = event.occurrence_date || event.event_date;
  const when = occurrence ? formatEventWhen({ ...event, kind: 'one_time' }, occurrence) : undefined;
  const next = occurrence ? nextOccurrenceAfter(event, occurrence) : undefined;
  const viewerLine = viewerRecapLine(event, isHost);
  const crowd = event.here.length > 0 ? event.here : event.going;

  return (
    <View className="bg-surface rounded-2xl p-4 mt-3">
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-fill items-center justify-center">
          <History size={20} color={colors.muted} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[17px] font-semibold text-ink">This one has ended</Text>
          {when && <Text className="text-[13px] text-muted mt-0.5">It happened {when}.</Text>}
        </View>
      </View>

      {viewerLine && (
        <View
          className={`self-start flex-row items-center rounded-full px-3 py-1.5 mt-4 ${
            viewerLine.tone === 'success' ? 'bg-success-soft' : 'bg-fill'
          }`}
        >
          {viewerLine.tone === 'success' && <Check size={14} color={colors.success} />}
          <Text className={`text-[13px] font-medium ${viewerLine.tone === 'success' ? 'text-success ml-1' : 'text-body'}`}>
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
            <Text className="text-[13px] font-medium text-muted flex-1">
              {event.here.length > 0 ? 'Who showed up' : 'Who was going'}
            </Text>
            <ChevronRight size={16} color={colors.faint} />
          </View>
          <GoingFaces people={crowd} currentUserId={userId} size={32} />
        </TouchableOpacity>
      )}

      <Text className="text-[13px] text-muted mt-4 leading-[18px]">
        RSVPs and check-ins close once an event wraps up.
      </Text>

      <View className="mt-4">
        {next ? (
          <PrimaryButton
            label={`RSVP for ${parseDateKey(next).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
            onPress={() => onOpenDate(next)}
          />
        ) : isHost ? (
          <PrimaryButton
            label="Host another one here"
            icon={Plus}
            onPress={() => router.push({ pathname: '/event/new', params: { spaceId: event.space.id } } as never)}
          />
        ) : (
          <PrimaryButton
            label="See what's coming up"
            icon={CalendarDays}
            tone="neutral"
            onPress={() => router.push('/calendar' as never)}
          />
        )}
      </View>
    </View>
  );
}

const MENTIONS_PREVIEW = 3;

function EventMentions({ mentions, spaceName, userId }: { mentions: EventMention[]; spaceName: string; userId: string }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, MENTIONS_PREVIEW);
  const hidden = mentions.length - visible.length;

  return (
    <View className="bg-surface rounded-2xl px-4 pt-4 mt-3">
      <View className="flex-row items-center mb-1">
        <Text className="text-[18px] font-semibold text-ink flex-1">What people are saying</Text>
        <Text className="text-[13px] text-muted">{mentions.length} mentions</Text>
      </View>

      {visible.map((mention, index) => {
        const fromPlace = mention.source_type === 'space';
        const name = fromPlace ? spaceName : getDisplayName(mention.profile);
        const authorId = mention.profile?.user_id;
        return (
          <View key={mention.id}>
            {index > 0 && <View className="h-px bg-line-soft" />}
            <View className="py-3">
              <TouchableOpacity
                disabled={!authorId}
                onPress={() => authorId && openProfile(authorId, userId)}
                activeOpacity={0.6}
                className="flex-row items-center"
              >
                <Avatar name={name} uri={mention.profile?.avatar_url} size={32} />
                <View className="flex-1 ml-2.5">
                  <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                    {fromPlace ? 'From the place description' : name}
                  </Text>
                  <Text className="text-[13px] text-muted">
                    {formatTimeAgo(mention.source_created_at)}
                    {` · says ${formatEventWhen(mention)}`}
                  </Text>
                </View>
              </TouchableOpacity>
              <Text className="text-[15px] text-body leading-[22px] mt-2">“{mention.snippet}”</Text>
              {mention.link_url && (
                <TouchableOpacity onPress={() => openExternalUrl(mention.link_url)} className="flex-row items-center self-start mt-1.5" activeOpacity={0.6}>
                  <ExternalLink size={13} color={colors.primary} />
                  <Text className="text-[13px] font-medium text-primary ml-1">{linkLabel(mention.link_url)}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {mentions.length > MENTIONS_PREVIEW ? (
        <>
          <View className="h-px bg-line-soft" />
          <TouchableOpacity onPress={() => setExpanded((value) => !value)} className="py-3 items-center" activeOpacity={0.6}>
            <Text className="text-[15px] text-primary font-medium">{expanded ? 'Show fewer' : `Show ${hidden} more`}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View className="h-1" />
      )}
    </View>
  );
}

export default function EventDetailScreen() {
  const colors = useColors();
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

  const openInvites = useCallback(async () => {
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
  }, [event, userId]);

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
  }, [event, inviteParam, openInvites, userId]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!event) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas justify-center px-5">
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {hosted && (
          <EventPoster
            title={event.title}
            when={formatEventWhen(event)}
            place={event.space.name}
            visibility={event.visibility}
            theme={event.theme}
            cancelled={Boolean(event.cancelled_at)}
            ended={ended}
          />
        )}

        <View className={`bg-surface rounded-2xl overflow-hidden ${hosted ? 'mt-3' : ''}`}>
          {!hosted && (
            <View style={{ backgroundColor: meta.tint }} className="px-5 pt-5 pb-5">
              <View className="flex-row items-center">
                <View style={{ backgroundColor: meta.color }} className="rounded-full px-2.5 py-1">
                  <Text className="text-white text-[12px] font-semibold">Mentioned</Text>
                </View>
                {ended && (
                  <View className="rounded-full px-2.5 py-1 ml-2 bg-surface">
                    <Text className="text-muted text-[12px] font-semibold">Ended</Text>
                  </View>
                )}
              </View>
              <Text className="text-[26px] font-bold tracking-tight text-ink mt-3">{event.title}</Text>
              <View className="flex-row items-center mt-1.5">
                <CalendarDays size={14} color={colors.muted} />
                <Text className="text-[15px] text-body ml-1.5 flex-1">{formatEventWhen(event)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity onPress={() => router.push(`/space/${event.space.id}` as never)} className="flex-row items-center px-4 py-3" activeOpacity={0.6}>
            <CategoryIcon category={event.space.category} size={40} />
            <View className="flex-1 ml-3">
              <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{event.space.name}</Text>
              <Text className="text-[13px] text-muted mt-0.5" numberOfLines={2}>{event.space.address}</Text>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </TouchableOpacity>

          {hostId && (
            <>
              <View className="h-px bg-line-soft ml-4" />
              <TouchableOpacity onPress={() => openProfile(hostId, userId)} className="flex-row items-center px-4 py-3" activeOpacity={0.6}>
                <Avatar name={hostName} uri={event.profile?.avatar_url} size={40} />
                <View className="flex-1 ml-3">
                  <Text className="text-[13px] text-muted">{hosted ? 'Hosted by' : 'Mentioned by'}</Text>
                  <Text className="text-[16px] font-semibold text-ink mt-0.5" numberOfLines={1}>
                    {hostName}
                    {!hosted && mentionCount > 1 && (
                      <Text className="font-normal text-muted"> and {mentionCount - 1} {mentionCount === 2 ? 'other' : 'others'}</Text>
                    )}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.faint} />
              </TouchableOpacity>
            </>
          )}

          {hosted && event.description && (
            <>
              <View className="h-px bg-line-soft ml-4" />
              <Text className="px-4 py-3.5 text-[15px] text-body leading-[22px]">{event.description}</Text>
            </>
          )}
          {!hosted && !showMentions && (
            <>
              <View className="h-px bg-line-soft ml-4" />
              <Text className="px-4 py-3.5 text-[15px] text-body leading-[22px]">“{event.snippet}”</Text>
            </>
          )}
        </View>

        {isHost && !event.cancelled_at && !ended && (
          <View className="bg-surface rounded-2xl p-4 mt-3">
            <Text className="text-[16px] font-semibold text-ink mb-3">Look</Text>
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
          <View className="bg-surface rounded-2xl p-4 mt-3">
            <TouchableOpacity
              onPress={() => event.here.length > 0 && setShowHere(true)}
              disabled={event.here.length === 0}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`See who is here, ${event.here_count} here now`}
              className="flex-row items-center"
            >
              <View className="flex-row items-center bg-success-soft rounded-full px-2.5 py-1 mr-2">
                <View style={{ backgroundColor: colors.success }} className="w-1.5 h-1.5 rounded-full" />
                <Text className="text-[12px] font-semibold text-success ml-1.5">Live</Text>
              </View>
              <Text className="text-[17px] font-semibold text-ink flex-1">{event.here_count} here now</Text>
              {event.here.length > 0 && <ChevronRight size={18} color={colors.faint} />}
            </TouchableOpacity>
            {event.here.length > 0 ? (
              <View className="mt-3">
                <GoingFaces people={event.here} currentUserId={userId} size={36} />
              </View>
            ) : (
              <Text className="text-[15px] text-muted mt-2">No one has checked in yet.</Text>
            )}
            <TouchableOpacity
              onPress={toggleHere}
              disabled={isSaving}
              activeOpacity={0.8}
              style={{ backgroundColor: event.viewer_here ? colors.successSoft : colors.ink }}
              className="h-[50px] rounded-xl flex-row items-center justify-center mt-4"
              accessibilityState={{ selected: event.viewer_here }}
            >
              {event.viewer_here ? <Check size={18} color={colors.success} /> : <MapPinCheck size={18} color={colors.canvas} />}
              <Text style={{ color: event.viewer_here ? colors.success : colors.canvas }} className="font-semibold text-[16px] ml-2">
                {event.viewer_here ? "You're here" : "I'm here"}
              </Text>
            </TouchableOpacity>
            <Text className="text-[13px] text-muted text-center mt-2">
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
          <View className="bg-surface rounded-2xl p-4 mt-3">
            <TouchableOpacity
              onPress={() => event.going.length > 0 && setShowGoing(true)}
              disabled={event.going.length === 0}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`See who is going, ${headcount}`}
              className="flex-row items-center"
            >
              <UsersRound size={18} color={colors.muted} />
              <Text className="text-[17px] font-semibold text-ink ml-2 flex-1">{headcount}</Text>
              {event.going.length > 0 && <ChevronRight size={18} color={colors.faint} />}
            </TouchableOpacity>
            {event.kind === 'weekly' && event.occurrence_date && (
              <Text className="text-[13px] text-muted mt-1">For {formatEventWhen({ ...event, kind: 'one_time' }, event.occurrence_date)}</Text>
            )}
            {capNote && <Text className={`text-[13px] mt-1 ${atCap ? 'text-warning' : 'text-muted'}`}>{capNote}</Text>}
            {event.going.length > 0 ? (
              <View className="mt-3">
                <GoingFaces people={event.going} currentUserId={userId} size={36} />
              </View>
            ) : (
              <Text className="text-[15px] text-muted mt-2">No one has RSVPed yet. Be the first.</Text>
            )}
            <View className="flex-row gap-2 mt-4">
              <TouchableOpacity
                onPress={() => rsvp('going')}
                disabled={isSaving || isFull}
                activeOpacity={0.8}
                style={{
                  backgroundColor: event.viewer_rsvp === 'going' ? colors.primarySoft : isFull ? colors.fill : colors.primary,
                }}
                className="flex-1 h-[50px] rounded-xl flex-row items-center justify-center"
              >
                {event.viewer_rsvp === 'going' && <Check size={18} color={colors.primary} />}
                <Text
                  style={{ color: event.viewer_rsvp === 'going' ? colors.primary : isFull ? colors.subtle : colors.onPrimary }}
                  className={`font-semibold text-[16px] ${event.viewer_rsvp === 'going' ? 'ml-1.5' : ''}`}
                >
                  {event.viewer_rsvp === 'going' ? 'Going' : isFull ? 'Full' : "I'm in"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => rsvp('not_going')}
                disabled={isSaving}
                activeOpacity={0.8}
                className={`flex-1 h-[50px] rounded-xl flex-row items-center justify-center ${
                  event.viewer_rsvp === 'not_going' ? 'bg-ink' : 'bg-fill'
                }`}
              >
                <Text className={`font-semibold text-[16px] ${event.viewer_rsvp === 'not_going' ? 'text-canvas' : 'text-ink'}`}>
                  Can&apos;t go
                </Text>
              </TouchableOpacity>
            </View>
            {event.viewer_rsvp && (
              <Text className="text-[13px] text-muted text-center mt-2">Tap your answer again to clear it.</Text>
            )}
          </View>
        )}

        {chatAvailable && (
          <TouchableOpacity
            onPress={() => openEventChat(event.id, token, event.occurrence_date)}
            activeOpacity={0.7}
            className="bg-surface rounded-2xl px-4 py-3.5 mt-3 flex-row items-center"
          >
            <View className="w-10 h-10 rounded-full bg-fill items-center justify-center">
              <MessageCircle size={20} color={colors.ink} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-[16px] font-semibold text-ink">Group chat</Text>
              <Text className="text-[13px] text-muted mt-0.5">
                {ended && chatClosesLabel
                  ? `Still open for follow-ups. Disappears ${chatClosesLabel}.`
                  : 'With everyone going. Disappears the day after.'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </TouchableOpacity>
        )}
        {chatCanOpenLater && (
          <View className="flex-row items-center mt-3 px-1">
            <Lock size={14} color={colors.subtle} />
            <Text className="text-[13px] text-muted ml-2 flex-1">Tap &quot;I&apos;m in&quot; to join the group chat with everyone going.</Text>
          </View>
        )}
        {chatClosed && (
          <View className="flex-row items-center mt-3 px-1">
            <MessageCircle size={14} color={colors.subtle} />
            <Text className="text-[13px] text-muted ml-2 flex-1">The group chat for this one has disappeared.</Text>
          </View>
        )}

        <View className="flex-row gap-2 mt-3">
          <ShareAction icon={Copy} label="Copy link" onPress={() => copyInviteLink(eventShareUrl(event))} />
          {isHost && <ShareAction icon={UserPlus} label="Invite" onPress={openInvites} />}
          <ShareAction icon={Share2} label="Share" onPress={() => shareEvent(event)} />
        </View>
        {event.link_url && (
          <TouchableOpacity
            onPress={() => openExternalUrl(event.link_url)}
            activeOpacity={0.6}
            className="mt-2 bg-surface rounded-2xl px-4 h-[52px] flex-row items-center"
          >
            <ExternalLink size={18} color={colors.muted} />
            <Text className="text-[16px] text-ink ml-3 flex-1" numberOfLines={1}>{linkLabel(event.link_url)}</Text>
            <ChevronRight size={18} color={colors.faint} />
          </TouchableOpacity>
        )}

        {showMentions && <EventMentions mentions={mentions} spaceName={event.space.name} userId={userId} />}

        {!hosted && (
          <View className="flex-row items-center mt-4 px-1">
            <CalendarDays size={14} color={colors.subtle} />
            <Text className="text-[13px] text-muted ml-2 flex-1">Mentioned in reviews. Headcounts are 3rdSpace people, not the venue&apos;s list.</Text>
          </View>
        )}

        {isHost && !event.cancelled_at && !ended && (
          <TouchableOpacity onPress={cancel} activeOpacity={0.6} className="mt-6 h-11 items-center justify-center">
            <Text className="text-[15px] text-danger font-semibold">Cancel hangout</Text>
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
