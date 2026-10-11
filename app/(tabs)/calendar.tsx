import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { CalendarDays, ChevronDown, ChevronUp, Globe, Lock, MessageSquareQuote, Plus, Repeat, type LucideIcon } from 'lucide-react-native';
import EventCard from '@/components/EventCard';
import MonthGrid from '@/components/MonthGrid';
import RangeBar, { RANGE_STOPS } from '@/components/RangeBar';
import { Chip, EmptyState, ScreenHeader, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listEventsNearby } from '@/lib/data';
import { eventOrigin, parseDateKey, toDateKey, type EventOrigin } from '@/lib/events';
import { colors } from '@/lib/theme';
import type { CalendarOccurrence, SpaceCategory } from '@/types/space';

const ARLINGTON = { latitude: 38.8816, longitude: -77.1081 };
const DEFAULT_RADIUS = 5;
const RANGE_DEBOUNCE_MS = 250;

type SourceFilter = 'all' | EventOrigin;

const SOURCE_FILTERS: { value: SourceFilter; label: string; icon?: LucideIcon; empty: string }[] = [
  { value: 'all', label: 'All', empty: 'Nothing listed' },
  { value: 'reviews', label: 'From reviews', icon: MessageSquareQuote, empty: 'No events from reviews' },
  { value: 'public', label: 'Public hangouts', icon: Globe, empty: 'No public hangouts' },
  { value: 'private', label: 'Private invites', icon: Lock, empty: 'No private invites' },
];

const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const eventIdentity = (occurrence: CalendarOccurrence) =>
  occurrence.event.source_type === 'hosted'
    ? occurrence.event.id
    : `${occurrence.event.space_id}|${occurrence.event.title}|${occurrence.event.kind === 'weekly' ? `w${occurrence.event.weekday}` : occurrence.date}`;

export default function CalendarScreen() {
  const { userId } = useAuth();
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [queryRadius, setQueryRadius] = useState(DEFAULT_RADIUS);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [center, setCenter] = useState(ARLINGTON);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [allOccurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWeekly, setShowWeekly] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setQueryRadius(radius), RANGE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [radius]);

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status === Location.PermissionStatus.UNDETERMINED) {
          status = (await Location.requestForegroundPermissionsAsync()).status;
        }
        if (status !== Location.PermissionStatus.GRANTED) return;
        const position = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({});
        if (!position) return;
        setCenter({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setHasUserLocation(true);
      } catch {
        // Falls back to the default area.
      }
    })();
  }, []);

  const load = useCallback(async (force = false) => {
    const id = ++requestId.current;
    try {
      const next = await listEventsNearby({ monthStart, center, radiusMiles: queryRadius, viewerId: userId, includePrivate: true, force });
      if (id === requestId.current) setOccurrences(next);
    } catch {
      Alert.alert('Calendar Error', 'Could not load events nearby.');
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [center, monthStart, queryRadius, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const changeMonth = useCallback((delta: number) => {
    setSelectedDate(null);
    setMonthStart((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }, []);

  const sourceCounts = useMemo(() => {
    const counts: Record<SourceFilter, Set<string>> = { all: new Set(), reviews: new Set(), public: new Set(), private: new Set() };
    for (const occurrence of allOccurrences) {
      const identity = eventIdentity(occurrence);
      counts.all.add(identity);
      counts[eventOrigin(occurrence.event)].add(identity);
    }
    return counts;
  }, [allOccurrences]);

  const occurrences = useMemo(
    () => sourceFilter === 'all'
      ? allOccurrences
      : allOccurrences.filter((occurrence) => eventOrigin(occurrence.event) === sourceFilter),
    [allOccurrences, sourceFilter]
  );
  const activeFilter = SOURCE_FILTERS.find((filter) => filter.value === sourceFilter)!;

  const todayKey = toDateKey(new Date());
  const isCurrentMonth = monthStart.getTime() === firstOfMonth(new Date()).getTime();

  const categoriesByDate = useMemo(() => occurrences.reduce<Record<string, SpaceCategory[]>>((byDate, occurrence) => {
    (byDate[occurrence.date] ||= []).push(occurrence.event.space.category);
    return byDate;
  }, {}), [occurrences]);

  const eventCount = useMemo(() => new Set(occurrences.map(eventIdentity)).size, [occurrences]);

  const weeklyEvents = useMemo(() => {
    const seen = new Set<string>();
    return occurrences
      .filter((occurrence) => {
        if (occurrence.event.kind !== 'weekly') return false;
        const identity = eventIdentity(occurrence);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .sort((first, second) =>
        (first.event.weekday ?? 0) - (second.event.weekday ?? 0) ||
        (first.event.start_time || '99:99').localeCompare(second.event.start_time || '99:99')
      );
  }, [occurrences]);

  const agenda = useMemo(() => {
    if (selectedDate) {
      return {
        title: parseDateKey(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
        items: occurrences.filter((occurrence) => occurrence.date === selectedDate),
        empty: sourceFilter === 'all' ? 'Nothing listed for this day yet.' : `${activeFilter.empty} on this day.`,
      };
    }

    if (isCurrentMonth) {
      const today = new Date();
      const weekEndKey = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6));
      return {
        title: 'This week',
        items: occurrences.filter((occurrence) => occurrence.date >= todayKey && occurrence.date <= weekEndKey),
        empty: sourceFilter === 'all' ? 'Nothing else this week. Check the weekly regulars below.' : `${activeFilter.empty} this week.`,
      };
    }

    return {
      title: `Coming up in ${monthStart.toLocaleDateString(undefined, { month: 'long' })}`,
      items: occurrences.filter((occurrence) => occurrence.event.kind === 'one_time'),
      empty: sourceFilter === 'all' ? 'No one-off events this month yet.' : `${activeFilter.empty} this month.`,
    };
  }, [activeFilter, isCurrentMonth, monthStart, occurrences, selectedDate, sourceFilter, todayKey]);

  const nextWiderRadius = RANGE_STOPS.find((stop) => stop > radius);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <ScrollView
        scrollEnabled={!isDraggingRange}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader
          title="Calendar"
          subtitle={hasUserLocation ? "What's happening near you" : "What's happening around Arlington, VA"}
          right={(
            <Pressable
              onPress={() => router.push('/event/new' as never)}
              accessibilityRole="button"
              accessibilityLabel="Create event"
              className="bg-primary rounded-full px-4 h-11 flex-row items-center"
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-bold ml-1.5">Create</Text>
            </Pressable>
          )}
        />

        <View className="px-4 gap-3">
          <RangeBar
            value={radius}
            onChange={setRadius}
            onDraggingChange={setIsDraggingRange}
            eventCount={isLoading ? undefined : eventCount}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="-mx-4 px-4">
            {SOURCE_FILTERS.map((filter) => {
              const count = sourceCounts[filter.value].size;
              return (
                <Chip
                  key={filter.value}
                  label={isLoading ? filter.label : `${filter.label} · ${count}`}
                  icon={filter.icon}
                  selected={sourceFilter === filter.value}
                  onPress={() => setSourceFilter(filter.value)}
                />
              );
            })}
          </ScrollView>
          <MonthGrid
            monthStart={monthStart}
            categoriesByDate={categoriesByDate}
            selectedDate={selectedDate}
            todayKey={todayKey}
            onSelectDate={setSelectedDate}
            onChangeMonth={changeMonth}
          />
        </View>

        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : allOccurrences.length > 0 && occurrences.length === 0 ? (
          <View className="px-4 mt-5">
            <EmptyState
              icon={activeFilter.icon ?? CalendarDays}
              title={`${activeFilter.empty} this month`}
              body={sourceFilter === 'private'
                ? 'Invite-only hangouts show up here once someone sends you the link, or when you host one.'
                : 'Try another filter, or host something yourself.'}
              actionLabel="Show everything"
              onAction={() => setSourceFilter('all')}
            />
          </View>
        ) : occurrences.length === 0 ? (
          <View className="px-4 mt-5">
            <EmptyState
              icon={CalendarDays}
              title="Nothing on the calendar nearby"
              body="Host a hangout, or widen the range. Review mentions like trivia night still show up here too."
              actionLabel="Create event"
              onAction={() => router.push('/event/new' as never)}
            />
            {nextWiderRadius && (
              <Pressable onPress={() => setRadius(nextWiderRadius)} className="items-center mt-3">
                <Text className="text-primary font-semibold">Widen to {nextWiderRadius} mi</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View className="px-4 mt-6">
            <SectionTitle
              title={agenda.title}
              action={selectedDate ? 'Clear' : undefined}
              onAction={selectedDate ? () => setSelectedDate(null) : undefined}
            />
            {agenda.items.length === 0 ? (
              <Text className="text-slate-500 mb-2">{agenda.empty}</Text>
            ) : (
              <View className="gap-3">
                {agenda.items.map((occurrence) => (
                  <EventCard key={occurrence.key} occurrence={occurrence} />
                ))}
              </View>
            )}

            {weeklyEvents.length > 0 && (
              <View className="mt-7">
                <Pressable
                  onPress={() => setShowWeekly((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showWeekly }}
                  className="flex-row items-center justify-between mb-3"
                >
                  <View className="flex-row items-center">
                    <Repeat size={16} color={colors.primary} />
                    <Text className="text-[17px] font-bold text-ink ml-2">Every week nearby</Text>
                    <Text className="text-[13px] font-semibold text-slate-400 ml-2">{weeklyEvents.length}</Text>
                  </View>
                  {showWeekly ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
                </Pressable>
                {showWeekly && (
                  <View className="gap-3">
                    {weeklyEvents.map((occurrence) => (
                      <EventCard key={`weekly-${occurrence.key}`} occurrence={occurrence} showRecurrence />
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
