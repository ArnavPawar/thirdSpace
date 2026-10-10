import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Globe, Lock } from 'lucide-react-native';
import { EventPoster, ThemePicker } from '@/components/EventPoster';
import PlacePicker, { type PickedPlace } from '@/components/PlacePicker';
import { Chip, PrimaryButton, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createHostedEvent } from '@/lib/data';
import { formatEventTime, parseDateKey, parseEventTime, toDateKey } from '@/lib/events';
import { eventHref, requireSignedIn, shareEvent } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import { CATEGORY_CONFIG, SPACE_CATEGORIES, type EventTheme, type EventVisibility, type SpaceCategory, type ThirdSpace } from '@/types/space';

const defaultStart = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return date;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

function WhenPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const [androidMode, setAndroidMode] = useState<'date' | 'time' | null>(null);
  const [webDate, setWebDate] = useState(() => toDateKey(value));
  const [webTime, setWebTime] = useState(() => formatEventTime(`${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`) || '');

  const merge = (picked: Date, mode: 'date' | 'time') => {
    const next = new Date(value);
    if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(next);
  };

  const rowClass = 'flex-row items-center justify-between px-4 min-h-[52px]';
  const dateLabel = value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (Platform.OS === 'web') {
    const applyWeb = (dateText: string, timeText: string) => {
      const time = parseEventTime(timeText);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !time) return;
      const [hour, minute] = time.split(':').map(Number);
      const next = parseDateKey(dateText);
      next.setHours(hour, minute, 0, 0);
      onChange(next);
    };
    return (
      <View className="bg-white border border-slate-200 rounded-2xl">
        <View className={`${rowClass} border-b border-slate-100`}>
          <Text className="text-base text-ink">Date</Text>
          <TextInput
            value={webDate}
            onChangeText={(text) => { setWebDate(text); applyWeb(text, webTime); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtle}
            className="text-base text-primary text-right flex-1 ml-4"
          />
        </View>
        <View className={rowClass}>
          <Text className="text-base text-ink">Time</Text>
          <TextInput
            value={webTime}
            onChangeText={(text) => { setWebTime(text); applyWeb(webDate, text); }}
            placeholder="7:30 PM"
            placeholderTextColor={colors.subtle}
            className="text-base text-primary text-right flex-1 ml-4"
          />
        </View>
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View className="bg-white border border-slate-200 rounded-2xl">
        <View className={`${rowClass} border-b border-slate-100`}>
          <Text className="text-base text-ink">Date</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={startOfToday()}
            accentColor={colors.primary}
            onChange={(_, picked) => picked && merge(picked, 'date')}
          />
        </View>
        <View className={rowClass}>
          <Text className="text-base text-ink">Time</Text>
          <DateTimePicker
            value={value}
            mode="time"
            display="compact"
            minuteInterval={5}
            accentColor={colors.primary}
            onChange={(_, picked) => picked && merge(picked, 'time')}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-white border border-slate-200 rounded-2xl">
      <TouchableOpacity onPress={() => setAndroidMode('date')} className={`${rowClass} border-b border-slate-100`} activeOpacity={0.7}>
        <Text className="text-base text-ink">Date</Text>
        <Text className="text-base font-semibold text-primary">{dateLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setAndroidMode('time')} className={rowClass} activeOpacity={0.7}>
        <Text className="text-base text-ink">Time</Text>
        <Text className="text-base font-semibold text-primary">{timeLabel}</Text>
      </TouchableOpacity>
      {androidMode && (
        <DateTimePicker
          value={value}
          mode={androidMode}
          minimumDate={androidMode === 'date' ? startOfToday() : undefined}
          onChange={(event, picked) => {
            const mode = androidMode;
            setAndroidMode(null);
            if (event.type === 'set' && picked) merge(picked, mode);
          }}
        />
      )}
    </View>
  );
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function NewEventScreen() {
  const { user, userId } = useAuth();
  const params = useLocalSearchParams<{ spaceId?: string; lat?: string; lng?: string }>();
  const presetSpaceId = typeof params.spaceId === 'string' ? params.spaceId : undefined;
  const initialCoordinate = params.lat && params.lng
    ? { latitude: Number(params.lat), longitude: Number(params.lng) }
    : null;
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [category, setCategory] = useState<SpaceCategory>('Cafe & Coworking');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [theme, setTheme] = useState<EventTheme>('indigo');
  const [capacityText, setCapacityText] = useState('');
  const [allowOverCapacity, setAllowOverCapacity] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const secretPlace = Boolean(place?.space.is_secret);
  const effectiveVisibility: EventVisibility = secretPlace ? 'private' : visibility;

  const onPlaceChange = (next: PickedPlace | null) => {
    setPlace(next);
    if (!next) return;
    setPlaceName(next.space.name);
    if (next.existing) setCategory(next.space.category);
    if (next.space.is_secret) setVisibility('private');
  };

  const publish = async () => {
    const next = presetSpaceId ? `/event/new?spaceId=${presetSpaceId}` : '/event/new';
    if (!requireSignedIn(Boolean(user), next, 'Sign in so people can find your hangout and RSVP.')) return;
    if (!place) {
      Alert.alert('Pick a place', 'Search a spot or drop a pin first.');
      return;
    }

    if (when.getTime() < Date.now() - 5 * 60 * 1000) {
      Alert.alert('Check the time', 'That start time already passed.');
      return;
    }
    const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;

    const linkUrl = normalizeUrl(linkText);
    if (linkUrl === null) {
      Alert.alert('Check the link', 'That URL does not look right.');
      return;
    }

    let capacity: number | undefined;
    if (capacityText.trim()) {
      capacity = Number(capacityText);
      if (!Number.isInteger(capacity) || capacity < 1) {
        Alert.alert('Check the cap', 'Leave it blank for no limit, or use a whole number.');
        return;
      }
    }

    const space: ThirdSpace = place.existing
      ? place.space
      : {
          ...place.space,
          name: placeName.trim() || place.space.name,
          category,
          primary_purpose: CATEGORY_CONFIG[category].purposes[0],
        };

    setIsSubmitting(true);
    try {
      const created = await createHostedEvent(userId, {
        title,
        eventDate: toDateKey(when),
        startTime: time,
        visibility: effectiveVisibility,
        theme,
        description: notes.trim() || undefined,
        capacity,
        allowOverCapacity,
        linkUrl,
        existingSpace: place.existing,
        space,
      });
      if (created.visibility === 'private') {
        try {
          await shareEvent(created);
        } catch {
          // Sharing can be dismissed without failing the hangout.
        }
      }
      router.replace(eventHref(created.id, created.visibility === 'private' ? created.invite_token : undefined) as never);
    } catch (error) {
      Alert.alert('Could not publish', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <EventPoster
            title={title}
            when={when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            place={place ? (place.existing ? place.space.name : placeName.trim() || place.space.name) : undefined}
            visibility={effectiveVisibility}
            theme={theme}
          />
          <View className="mt-3 mb-5">
            <ThemePicker value={theme} onChange={setTheme} />
          </View>

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">Where</Text>
          <PlacePicker
            userId={userId}
            presetSpaceId={presetSpaceId}
            initialCoordinate={initialCoordinate && Number.isFinite(initialCoordinate.latitude) ? initialCoordinate : null}
            onPlaceChange={onPlaceChange}
          />

          {place && !place.existing && (
            <View className="mt-4">
              <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">Place name</Text>
              <TextInput
                value={placeName}
                onChangeText={setPlaceName}
                placeholder="What should we call this spot?"
                placeholderTextColor={colors.subtle}
                className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] text-base text-ink"
              />
              <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">What kind of spot?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SPACE_CATEGORIES.map((value) => (
                  <Chip
                    key={value}
                    label={CATEGORY_META[value].short}
                    icon={CATEGORY_META[value].icon}
                    color={CATEGORY_META[value].color}
                    selected={category === value}
                    onPress={() => setCategory(value)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">What are we doing?</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Sunset hang, trivia, cowork..."
            placeholderTextColor={colors.subtle}
            maxLength={60}
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] text-base text-ink"
          />

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">When</Text>
          <WhenPicker value={when} onChange={setWhen} />

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">Who can see it</Text>
          {secretPlace ? (
            <View className="bg-secret/5 border border-secret/20 rounded-2xl p-4">
              <Text className="font-bold text-ink">Private only</Text>
              <Text className="text-slate-600 mt-1">This is a secret spot, so the hangout stays link-only.</Text>
            </View>
          ) : (
            <>
              <SegmentedControl
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: 'public', label: 'Public', icon: Globe },
                  { value: 'private', label: 'Private', icon: Lock },
                ]}
              />
              <Text className="text-[13px] text-slate-500 mt-2">
                {visibility === 'public'
                  ? 'Anyone nearby can see it on the calendar and map.'
                  : 'Hidden from the public calendar and map. Share the link with the people you want.'}
              </Text>
            </>
          )}

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">Optional</Text>
          <TextInput
            value={capacityText}
            onChangeText={setCapacityText}
            placeholder="Cap (leave blank for no limit)"
            placeholderTextColor={colors.subtle}
            keyboardType="number-pad"
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] text-base text-ink"
          />
          {capacityText.trim().length > 0 && (
            <View className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mt-3 flex-row items-center">
              <View className="flex-1 pr-3">
                <Text className="font-semibold text-ink">Let people join past the cap</Text>
                <Text className="text-[13px] text-slate-500 mt-0.5">
                  {allowOverCapacity ? 'The cap is a target. RSVPs stay open.' : 'RSVPs close once the cap is hit.'}
                </Text>
              </View>
              <Switch
                value={allowOverCapacity}
                onValueChange={setAllowOverCapacity}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          )}
          <TextInput
            value={linkText}
            onChangeText={setLinkText}
            placeholder="Partiful, Luma, Instagram..."
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] text-base text-ink mt-3"
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Bring a blanket, we'll be on the patio"
            placeholderTextColor={colors.subtle}
            multiline
            maxLength={800}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[96px] text-base text-ink mt-3"
          />

          <View className="mt-6">
            <PrimaryButton
              label={effectiveVisibility === 'private' ? 'Create & share link' : 'Publish hangout'}
              onPress={publish}
              loading={isSubmitting}
              disabled={!title.trim() || !place}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}