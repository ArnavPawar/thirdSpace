import React from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Clock, ExternalLink, MapPin, Repeat, Users } from 'lucide-react-native';
import GoingFaces from '@/components/GoingFaces';
import { useAuth } from '@/lib/auth';
import { formatEventTime, getEventPhase, isHostedEvent, parseDateKey, WEEKDAY_NAMES } from '@/lib/events';
import { formatDistance, getDisplayName } from '@/lib/format';
import { openEvent } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { CalendarOccurrence } from '@/types/space';

interface EventCardProps {
  occurrence: CalendarOccurrence;
  showRecurrence?: boolean;
}

export default function EventCard({ occurrence, showRecurrence = false }: EventCardProps) {
  const { userId } = useAuth();
  const { event, distance, mention_count: mentionCount } = occurrence;
  const hosted = isHostedEvent(event);
  const meta = CATEGORY_META[event.space.category];
  const Icon = meta.icon;
  const date = parseDateKey(occurrence.date);
  const time = formatEventTime(event.start_time);
  const distanceLabel = formatDistance(distance);
  const isWeekly = event.kind === 'weekly';
  const whenLabel = showRecurrence && isWeekly
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
    <Pressable
      onPress={() => openEvent(event.id, undefined, occurrence.date)}
      accessibilityRole="button"
      accessibilityLabel={`${event.title} at ${event.space.name}${isEnded ? ', ended' : ''}`}
      style={isEnded ? { opacity: 0.6 } : undefined}
      className="bg-white rounded-3xl border border-slate-200 p-3 flex-row"
    >
      <View
        style={{ backgroundColor: meta.tint }}
        className="w-[68px] rounded-2xl items-center justify-center py-3 mr-3"
      >
        <Icon size={26} color={meta.color} />
        <Text style={{ color: meta.color }} className="text-[11px] font-extrabold mt-1.5 uppercase">
          {showRecurrence && isWeekly
            ? WEEKDAY_NAMES[event.weekday ?? date.getDay()].slice(0, 3)
            : date.toLocaleDateString(undefined, { weekday: 'short' })}
        </Text>
        {!(showRecurrence && isWeekly) && (
          <Text style={{ color: meta.color }} className="text-[20px] font-extrabold leading-6">{date.getDate()}</Text>
        )}
      </View>

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="text-[16px] font-extrabold text-ink flex-shrink">{event.title}</Text>
          {isLive && (
            <View className="flex-row items-center bg-emerald-50 rounded-full px-2 py-0.5 ml-2">
              <View style={{ backgroundColor: colors.success }} className="w-1.5 h-1.5 rounded-full" />
              <Text className="text-[10px] font-bold text-emerald-700 ml-1">
                {event.here_count > 0 ? `Live · ${event.here_count} here` : 'Live'}
              </Text>
            </View>
          )}
          {isEnded && (
            <View className="rounded-full px-2 py-0.5 ml-2 bg-slate-100">
              <Text className="text-[10px] font-bold text-slate-500">Ended</Text>
            </View>
          )}
          {isWeekly && !isLive && !isEnded && (
            <View style={{ backgroundColor: colors.primarySoft }} className="flex-row items-center rounded-full px-2 py-0.5 ml-2">
              <Repeat size={10} color={colors.primary} />
              <Text className="text-[10px] font-bold text-primary ml-1">Weekly</Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center mt-0.5">
          <MapPin size={12} color={colors.muted} />
          <Text numberOfLines={1} className="text-[13px] font-semibold text-slate-600 ml-1 flex-shrink">
            {event.space.name}
            {distanceLabel ? ` · ${distanceLabel}` : ''}
          </Text>
        </View>

        <View className="flex-row items-center mt-0.5">
          <Clock size={12} color={colors.muted} />
          <Text className="text-[13px] text-slate-500 ml-1">
            {whenLabel}
            {time ? ` · ${time}` : ''}
          </Text>
        </View>

        {hosted && event.description ? (
          <Text numberOfLines={2} className="text-[13px] text-slate-600 mt-2 leading-[18px]">{event.description}</Text>
        ) : !hosted ? (
          <Text numberOfLines={2} className="text-[13px] text-slate-600 italic mt-2 leading-[18px]">“{event.snippet}”</Text>
        ) : null}

        {event.going.length > 0 && (
          <View className="mt-2">
            <GoingFaces people={event.going} currentUserId={userId} size={24} />
          </View>
        )}

        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-row items-center flex-shrink">
            {hosted ? (
              <>
                <View style={{ backgroundColor: event.visibility === 'private' ? '#f1f5f9' : colors.primarySoft }} className="rounded-full px-2 py-0.5">
                  <Text className={`text-[11px] font-bold ${event.visibility === 'private' ? 'text-slate-600' : 'text-primary'}`}>
                    {event.visibility === 'private' ? 'Private' : 'Hosted'}
                  </Text>
                </View>
                <View className="ml-2">
                  <Users size={12} color={colors.muted} />
                </View>
                <Text className="text-[12px] font-semibold text-slate-500 ml-1">{event.capacity && !isEnded ? `${event.going_count}/${event.capacity}` : event.going_count} {goingLabel}</Text>
              </>
            ) : (
              <Text numberOfLines={1} className="text-[11px] font-semibold text-slate-400 flex-shrink">
                {event.going_count > 0 ? `${event.going_count} ${goingLabel} · ` : ''}
                {event.source_type === 'space'
                  ? 'Mentioned in the place description'
                  : mentions > 1
                    ? `Mentioned in ${mentions} reviews`
                    : `Mentioned in reviews · ${event.profile?.username ? `@${event.profile.username}` : getDisplayName(event.profile)}`}
              </Text>
            )}
          </View>
          {event.link_url && (
            <TouchableOpacity
              onPress={openLink}
              activeOpacity={0.75}
              accessibilityLabel={`Open link for ${event.title}`}
              className="flex-row items-center bg-primary rounded-full px-3 h-7 ml-2"
            >
              <ExternalLink size={12} color="white" />
              <Text className="text-white text-[12px] font-bold ml-1">Link</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Pressable>
  );
}
