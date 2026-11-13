import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Globe, KeyRound, Lock } from 'lucide-react-native';
import { EventPoster, ThemePicker } from '@/components/EventPoster';
import PlacePicker, { type PickedPlace } from '@/components/PlacePicker';
import { Chip, PrimaryButton, SegmentedControl, ToggleRow } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createHostedEvent, listMyGroups } from '@/lib/data';
import { formatEventTime, parseDateKey, parseEventTime, toDateKey } from '@/lib/events';
import { eventHref, requireSignedIn } from '@/lib/links';
import { CATEGORY_META, useColors, useColorSchemeName } from '@/lib/theme';
import { CATEGORY_CONFIG, SPACE_CATEGORIES, type EventTheme, type EventVisibility, type Group, type SpaceCategory, type ThirdSpace } from '@/types/space';

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

const inputClass = 'bg-surface rounded-xl h-12 px-4 text-[16px] text-ink';
const groupedInputClass = 'h-12 px-4 text-[16px] text-ink';

function FieldLabel({ children }: { children: string }) {
  return <Text className="text-[13px] font-medium text-muted mt-6 mb-1.5 ml-1">{children}</Text>;
}

function FieldHint({ children }: { children: string }) {
  return <Text className="text-[13px] text-muted mt-1.5 mx-1 leading-[18px]">{children}</Text>;
}

function Hairline() {
  return <View className="h-px bg-line-soft ml-4" />;
}

function WhenPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const colors = useColors();
  const scheme = useColorSchemeName();
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
  const valuePillClass = 'bg-fill rounded-lg px-3 h-9 items-center justify-center';
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
      <View className="bg-surface rounded-2xl">
        <View className={rowClass}>
          <Text className="text-[16px] text-ink">Date</Text>
          <TextInput
            value={webDate}
            onChangeText={(text) => { setWebDate(text); applyWeb(text, webTime); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtle}
            keyboardAppearance={scheme}
            className="text-[16px] text-ink text-right flex-1 ml-4"
          />
        </View>
        <Hairline />
        <View className={rowClass}>
          <Text className="text-[16px] text-ink">Time</Text>
          <TextInput
            value={webTime}
            onChangeText={(text) => { setWebTime(text); applyWeb(webDate, text); }}
            placeholder="7:30 PM"
            placeholderTextColor={colors.subtle}
            keyboardAppearance={scheme}
            className="text-[16px] text-ink text-right flex-1 ml-4"
          />
        </View>
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View className="bg-surface rounded-2xl">
        <View className={rowClass}>
          <Text className="text-[16px] text-ink">Date</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={startOfToday()}
            accentColor={colors.primary}
            themeVariant={scheme}
            onChange={(_, picked) => picked && merge(picked, 'date')}
          />
        </View>
        <Hairline />
        <View className={rowClass}>
          <Text className="text-[16px] text-ink">Time</Text>
          <DateTimePicker
            value={value}
            mode="time"
            display="compact"
            minuteInterval={5}
            accentColor={colors.primary}
            themeVariant={scheme}
            onChange={(_, picked) => picked && merge(picked, 'time')}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-2xl">
      <TouchableOpacity onPress={() => setAndroidMode('date')} className={rowClass} activeOpacity={0.6}>
        <Text className="text-[16px] text-ink">Date</Text>
        <View className={valuePillClass}>
          <Text className="text-[15px] font-medium text-ink">{dateLabel}</Text>
        </View>
      </TouchableOpacity>
      <Hairline />
      <TouchableOpacity onPress={() => setAndroidMode('time')} className={rowClass} activeOpacity={0.6}>
        <Text className="text-[16px] text-ink">Time</Text>
        <View className={valuePillClass}>
          <Text className="text-[15px] font-medium text-ink">{timeLabel}</Text>
        </View>
      </TouchableOpacity>
      {androidMode && (
        <DateTimePicker
          value={value}
          mode={androidMode}
          themeVariant={scheme}
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
  const colors = useColors();
  const scheme = useColorSchemeName();
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
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    listMyGroups(userId).then(setGroups).catch(() => setGroups([]));
  }, [userId]);

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
        groupIds,
      });
      const href = eventHref(created.id, created.visibility === 'private' ? created.invite_token : undefined);
      router.replace(`${href}${href.includes('?') ? '&' : '?'}invite=1` as never);
    } catch (error) {
      Alert.alert('Could not publish', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <EventPoster
            title={title}
            when={when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            place={place ? (place.existing ? place.space.name : placeName.trim() || place.space.name) : undefined}
            visibility={effectiveVisibility}
            theme={theme}
          />
          <View className="mt-3">
            <ThemePicker value={theme} onChange={setTheme} />
          </View>

          <FieldLabel>Where</FieldLabel>
          <PlacePicker
            userId={userId}
            presetSpaceId={presetSpaceId}
            initialCoordinate={initialCoordinate && Number.isFinite(initialCoordinate.latitude) ? initialCoordinate : null}
            onPlaceChange={onPlaceChange}
          />

          {place && !place.existing && (
            <View>
              <FieldLabel>Place name</FieldLabel>
              <TextInput
                value={placeName}
                onChangeText={setPlaceName}
                placeholder="What should we call this spot?"
                placeholderTextColor={colors.subtle}
                keyboardAppearance={scheme}
                className={inputClass}
              />
              <FieldLabel>What kind of spot?</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SPACE_CATEGORIES.map((value) => (
                  <Chip
                    key={value}
                    label={CATEGORY_META[value].short}
                    icon={CATEGORY_META[value].icon}
                    iconColor={CATEGORY_META[value].color}
                    selected={category === value}
                    onPress={() => setCategory(value)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          <FieldLabel>What are we doing?</FieldLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Sunset hang, trivia, cowork..."
            placeholderTextColor={colors.subtle}
            keyboardAppearance={scheme}
            maxLength={60}
            className={inputClass}
          />

          <FieldLabel>When</FieldLabel>
          <WhenPicker value={when} onChange={setWhen} />

          <FieldLabel>Who can see it</FieldLabel>
          {secretPlace ? (
            <View className="bg-secret-soft rounded-2xl p-4 flex-row">
              <KeyRound size={18} color={colors.secret} style={{ marginTop: 1 }} />
              <View className="flex-1 ml-3">
                <Text className="text-[16px] font-semibold text-ink">Private only</Text>
                <Text className="text-[14px] text-body mt-0.5 leading-5">This is a secret spot, so the hangout stays link-only.</Text>
              </View>
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
              <FieldHint>
                {visibility === 'public'
                  ? 'Anyone nearby can see it on the calendar and map.'
                  : 'Hidden from the public calendar and map. Invite a group, or send the link to specific people.'}
              </FieldHint>
            </>
          )}

          <FieldLabel>Post to groups</FieldLabel>
          {groups.length === 0 ? (
            <Text className="text-[13px] text-muted mx-1 leading-[18px]">Groups you belong to show up here, so one hangout reaches the whole crew.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {groups.map((group) => (
                <Chip
                  key={group.id}
                  label={group.name}
                  selected={groupIds.includes(group.id)}
                  onPress={() => setGroupIds((current) => current.includes(group.id)
                    ? current.filter((id) => id !== group.id)
                    : [...current, group.id])}
                />
              ))}
            </ScrollView>
          )}

          <FieldLabel>Optional</FieldLabel>
          <View className="bg-surface rounded-2xl overflow-hidden">
            <TextInput
              value={capacityText}
              onChangeText={setCapacityText}
              placeholder="Cap (leave blank for no limit)"
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              keyboardType="number-pad"
              className={groupedInputClass}
            />
            {capacityText.trim().length > 0 && (
              <>
                <Hairline />
                <ToggleRow
                  title="Let people join past the cap"
                  subtitle={allowOverCapacity ? 'The cap is a target. RSVPs stay open.' : 'RSVPs close once the cap is hit.'}
                  value={allowOverCapacity}
                  onValueChange={setAllowOverCapacity}
                />
              </>
            )}
            <Hairline />
            <TextInput
              value={linkText}
              onChangeText={setLinkText}
              placeholder="Partiful, Luma, Instagram..."
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              autoCapitalize="none"
              autoCorrect={false}
              className={groupedInputClass}
            />
            <Hairline />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Bring a blanket, we'll be on the patio"
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              multiline
              textAlignVertical="top"
              maxLength={800}
              className="px-4 py-3 min-h-[96px] text-[16px] text-ink"
            />
          </View>

          <View className="mt-8">
            <PrimaryButton
              label="Publish hangout"
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
