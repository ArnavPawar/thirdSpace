import React from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Clock, ExternalLink, MapPin, Repeat } from 'lucide-react-native';
import { formatEventTime, parseDateKey, WEEKDAY_NAMES } from '@/lib/events';
import { formatDistance, getDisplayName } from '@/lib/format';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { CalendarOccurrence } from '@/types/space';

interface EventCardProps {
  occurrence: CalendarOccurrence;
  showRecurrence?: boolean;
}

export default function EventCard({ occurrence, showRecurrence = false }: EventCardProps) {
  const { event, distance, mention_count: mentionCount } = occurrence;
  const meta = CATEGORY_META[event.space.category];
  const Icon = meta.icon;
  const date = parseDateKey(occurrence.date);
  const time = formatEventTime(event.start_time);
  const distanceLabel = formatDistance(distance);
  const isWeekly = event.kind === 'weekly';
  const whenLabel = showRecurrence && isWeekly
    ? `Every ${WEEKDAY_NAMES[event.weekday ?? date.getDay()]}`
    : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const openLink = () => {
    if (event.link_url) WebBrowser.openBrowserAsync(event.link_url).catch(() => undefined);
  };

  return (
    <Pressable
      onPress={() => router.push(`/space/${event.space.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${event.title} at ${event.space.name}`}
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
          {isWeekly && (
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

        <Text numberOfLines={2} className="text-[13px] text-slate-600 italic mt-2 leading-[18px]">
          “{event.snippet}”
        </Text>

        <View className="flex-row items-center justify-between mt-2">
          <Text numberOfLines={1} className="text-[11px] font-semibold text-slate-400 flex-shrink">
            {event.source_type === 'rating'
              ? `from ${event.profile?.username ? `@${event.profile.username}` : getDisplayName(event.profile)}'s review`
              : 'from the place description'}
            {mentionCount > 1 ? ` · mentioned ${mentionCount}×` : ''}
          </Text>
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
