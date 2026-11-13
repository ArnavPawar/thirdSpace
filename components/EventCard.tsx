import React, { useState } from 'react';
import { Alert, Pressable, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Clock, ExternalLink, Lock, Repeat, UsersRound } from 'lucide-react-native';
import GoingFaces from '@/components/GoingFaces';
import PeopleListSheet from '@/components/PeopleListSheet';
import { useAuth } from '@/lib/auth';
import { formatEventTime, getEventPhase, isHostedEvent, parseDateKey, WEEKDAY_NAMES } from '@/lib/events';
import { formatDistance, getDisplayName } from '@/lib/format';
import { openDirectMessage, openEvent, openHereChat, openProfile } from '@/lib/links';
import { CATEGORY_META, useColors } from '@/lib/theme';
import type { CalendarOccurrence } from '@/types/space';

interface EventCardProps {
  occurrence: CalendarOccurrence;
  showRecurrence?: boolean;
}

export default function EventCard({ occurrence, showRecurrence = false }: EventCardProps) {
  const colors = useColors();
  const { userId } = useAuth();
  const [showGoing, setShowGoing] = useState(false);
  const [showHere, setShowHere] = useState(false);
  const { event, distance, mention_count: mentionCount } = occurrence;
  const hosted = isHostedEvent(event);
  const meta = CATEGORY_META[event.space.category];
  const CategoryGlyph = meta.icon;
  const date = parseDateKey(occurrence.date);
  const time = formatEventTime(event.start_time);
  const distanceLabel = formatDistance(distance);
  const isWeekly = event.kind === 'weekly';
  const showsWeekday = showRecurrence && isWeekly;
  const whenLabel = showsWeekday
    ? `Every ${WEEKDAY_NAMES[event.weekday ?? date.getDay()]}`
    : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const phase = getEventPhase(event, occurrence.date);
  const isLive = phase === 'live';
  const isEnded = phase === 'ended';
  const goingLabel = isEnded ? 'went' : 'going';
  const mentions = Math.max(mentionCount, event.mention_count || 1);

  const openLink = () => {
    if (event.link_url) WebBrowser.openBrowserAsync(event.link_url).catch(() => undefined);
  };

  return (
    <>
    <Pressable
      onPress={() => openEvent(event.id, undefined, occurrence.date)}
      accessibilityRole="button"
      accessibilityLabel={`${event.title} at ${event.space.name}${isEnded ? ', ended' : ''}`}
      style={isEnded ? { opacity: 0.55 } : undefined}
      className="bg-surface rounded-2xl p-3.5 flex-row"
    >
      <View className="w-[52px] h-[58px] rounded-xl bg-fill items-center justify-center mr-3.5">
        <Text style={{ color: meta.color }} className="text-[11px] font-semibold">
          {showsWeekday
            ? WEEKDAY_NAMES[event.weekday ?? date.getDay()].slice(0, 3)
            : date.toLocaleDateString(undefined, { weekday: 'short' })}
        </Text>
        {showsWeekday ? (
          <Repeat size={18} color={colors.ink} style={{ marginTop: 4 }} />
        ) : (
          <Text className="text-[20px] font-bold text-ink leading-6">{date.getDate()}</Text>
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="text-[16px] font-semibold text-ink flex-shrink">{event.title}</Text>
          {isLive && (
            <TouchableOpacity
              onPress={() => event.here.length > 0 && setShowHere(true)}
              disabled={event.here.length === 0}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={event.here_count > 0 ? `See who is here, ${event.here_count} here` : 'Live'}
              className="flex-row items-center bg-success-soft rounded-full px-2 py-0.5 ml-2"
            >
              <View style={{ backgroundColor: colors.success }} className="w-1.5 h-1.5 rounded-full" />
              <Text className="text-[11px] font-semibold text-success ml-1">
                {event.here_count > 0 ? `Live · ${event.here_count} here` : 'Live'}
              </Text>
            </TouchableOpacity>
          )}
          {isEnded && (
            <TouchableOpacity
              onPress={() => {
                if (event.here.length > 0) setShowHere(true);
                else if (event.going.length > 0) setShowGoing(true);
              }}
              disabled={event.here.length === 0 && event.going.length === 0}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={event.here_count > 0 ? `See who showed up, ${event.here_count} checked in` : 'See who was going'}
              className="rounded-full px-2 py-0.5 ml-2 bg-fill"
            >
              <Text className="text-[11px] font-semibold text-muted">
                {event.here_count > 0 ? `Ended · ${event.here_count} there` : 'Ended'}
              </Text>
            </TouchableOpacity>
          )}
          {isWeekly && !isLive && !isEnded && !showsWeekday && (
            <View className="flex-row items-center rounded-full px-2 py-0.5 ml-2 bg-fill">
              <Repeat size={10} color={colors.muted} />
              <Text className="text-[11px] font-semibold text-muted ml-1">Weekly</Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center mt-1">
          <CategoryGlyph size={13} color={meta.color} />
          <Text numberOfLines={1} className="text-[13px] text-body ml-1.5 flex-shrink">
            {event.space.name}
            {distanceLabel ? <Text className="text-muted">{` · ${distanceLabel}`}</Text> : null}
          </Text>
        </View>

        <View className="flex-row items-center mt-0.5">
          <Clock size={13} color={colors.subtle} />
          <Text className="text-[13px] text-muted ml-1.5">
            {whenLabel}
            {time ? ` · ${time}` : ''}
          </Text>
        </View>

        {hosted && event.description ? (
          <Text numberOfLines={2} className="text-[14px] text-body mt-2 leading-5">{event.description}</Text>
        ) : !hosted ? (
          <Text numberOfLines={2} className="text-[14px] text-body mt-2 leading-5">“{event.snippet}”</Text>
        ) : null}

        <View className="flex-row items-center justify-between mt-2.5">
          <View className="flex-row items-center flex-shrink">
            {hosted ? (
              <TouchableOpacity
                onPress={() => event.going.length > 0 && setShowGoing(true)}
                disabled={event.going.length === 0}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`See who is ${goingLabel}`}
                className="flex-row items-center"
              >
                {event.going.length > 0 ? (
                  <GoingFaces people={event.going} currentUserId={userId} size={22} />
                ) : (
                  <UsersRound size={14} color={colors.subtle} />
                )}
                <Text className="text-[13px] text-muted ml-1.5">
                  {event.capacity && !isEnded ? `${event.going_count}/${event.capacity}` : event.going_count} {goingLabel}
                </Text>
                {event.visibility === 'private' && (
                  <View className="flex-row items-center ml-2">
                    <Lock size={11} color={colors.subtle} />
                    <Text className="text-[12px] text-subtle ml-0.5">Private</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center flex-shrink">
                {event.going.length > 0 && (
                  <View className="mr-1.5">
                    <GoingFaces people={event.going} currentUserId={userId} size={22} />
                  </View>
                )}
                <Text numberOfLines={1} className="text-[12px] text-subtle flex-shrink">
                  {event.going_count > 0 ? `${event.going_count} ${goingLabel} · ` : ''}
                  {event.source_type === 'space'
                    ? 'From the place description'
                    : mentions > 1
                      ? `Mentioned in ${mentions} reviews`
                      : 'Mentioned in a review'}
                </Text>
                {event.source_type !== 'space' && mentions <= 1 && (event.profile?.user_id || event.source_user_id) && (
                  <TouchableOpacity
                    onPress={() => openProfile((event.profile?.user_id || event.source_user_id) as string, userId)}
                    accessibilityLabel={`View ${getDisplayName(event.profile)}'s profile`}
                    hitSlop={6}
                  >
                    <Text className="text-[12px] font-medium text-body">
                      {` · ${event.profile?.username ? `@${event.profile.username}` : getDisplayName(event.profile)}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          {event.link_url && (
            <TouchableOpacity
              onPress={openLink}
              activeOpacity={0.7}
              accessibilityLabel={`Open link for ${event.title}`}
              hitSlop={6}
              className="flex-row items-center bg-fill rounded-full px-2.5 h-7 ml-2"
            >
              <ExternalLink size={12} color={colors.ink} />
              <Text className="text-ink text-[12px] font-semibold ml-1">Link</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Pressable>
    <PeopleListSheet
      visible={showGoing}
      title={`${event.going_count} ${goingLabel}`}
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
      title={isEnded ? `${event.here_count} checked in` : `${event.here_count} here now`}
      people={event.here}
      currentUserId={userId}
      onClose={() => setShowHere(false)}
      actionLabel={isLive ? 'Chat with everyone here' : undefined}
      actionHint="Only people who checked in. This chat deletes when the hangout ends."
      onAction={isLive ? () => {
        setShowHere(false);
        if (!event.viewer_here) {
          Alert.alert('Check in first', 'Open the hangout and tap I\'m here to join this chat.');
          return;
        }
        openHereChat(event.id, event.visibility === 'private' ? event.invite_token : undefined, occurrence.date);
      } : undefined}
      onMessage={(person) => {
        setShowHere(false);
        openDirectMessage(person.user_id);
      }}
    />
    </>
  );
}
