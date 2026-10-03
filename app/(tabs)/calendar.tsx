import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { CalendarDays, ChevronDown, ChevronUp, Repeat } from 'lucide-react-native';
import EventCard from '@/components/EventCard';
import MonthGrid from '@/components/MonthGrid';
import RangeBar, { RANGE_STOPS, type RangeMiles } from '@/components/RangeBar';
import { EmptyState, ScreenHeader, SectionTitle } from '@/components/ui';
import { listEventsNearby } from '@/lib/data';
import { parseDateKey, toDateKey } from '@/lib/events';
import { colors } from '@/lib/theme';
import type { CalendarOccurrence, SpaceCategory } from '@/types/space';

const ARLINGTON = { latitude: 38.8816, longitude: -77.1081 };
const DEFAULT_RADIUS: RangeMiles = 5;
const RANGE_DEBOUNCE_MS = 250;

const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const eventIdentity = (occurrence: CalendarOccurrence) =>
  `${occurrence.event.space_id}|${occurrence.event.title}|${occurrence.event.kind === 'weekly' ? `w${occurrence.event.weekday}` : occurrence.date}`;

export default function CalendarScreen() {
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [radius, setRadius] = useState<RangeMiles>(DEFAULT_RADIUS);
  const [queryRadius, setQueryRadius] = useState<RangeMiles>(DEFAULT_RADIUS);
  const [center, setCenter] = useState(ARLINGTON);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [occurrences, setOccurrences] = useState<CalendarOccurrence[]>([]);
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
      const next = await listEventsNearby({ monthStart, center, radiusMiles: queryRadius, force });
      if (id === requestId.current) setOccurrences(next);
    } catch {
      Alert.alert('Calendar Error', 'Could not load events nearby.');
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [center, monthStart, queryRadius]);

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
        empty: 'Nothing listed for this day yet.',
      };
    }

    if (isCurrentMonth) {
      const today = new Date();
      const weekEndKey = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6));
      return {
        title: 'This week',
        items: occurrences.filter((occurrence) => occurrence.date >= todayKey && occurrence.date <= weekEndKey),
        empty: 'Nothing else this week. Check the weekly regulars below.',
      };
    }

    return {
      title: `Coming up in ${monthStart.toLocaleDateString(undefined, { month: 'long' })}`,
      items: occurrences.filter((occurrence) => occurrence.event.kind === 'one_time'),
      empty: 'No one-off events this month yet.',
    };
  }, [isCurrentMonth, monthStart, occurrences, selectedDate, todayKey]);

  const nextWiderRadius = RANGE_STOPS.find((stop) => stop > radius);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader
          title="Calendar"
          subtitle={hasUserLocation ? "What's happening near you" : "What's happening around Arlington, VA"}
        />

        <View className="px-4 gap-3">
          <RangeBar value={radius} onChange={setRadius} eventCount={isLoading ? undefined : eventCount} />
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
        ) : occurrences.length === 0 ? (
          <View className="px-4 mt-5">
            <EmptyState
              icon={CalendarDays}
              title="Nothing on the calendar nearby"
              body={'Events show up here when reviews mention them, like "trivia every Tuesday at 8pm".'}
              actionLabel={nextWiderRadius ? `Widen to ${nextWiderRadius} mi` : undefined}
              onAction={nextWiderRadius ? () => setRadius(nextWiderRadius) : undefined}
            />
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
