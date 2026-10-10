import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { EventTheme, EventVisibility } from '@/types/space';

export interface EventThemeStyle {
  id: EventTheme;
  label: string;
  background: string;
  glow: string;
  ink: string;
  muted: string;
}

export const EVENT_THEMES: EventThemeStyle[] = [
  { id: 'indigo', label: 'Indigo', background: '#312e81', glow: '#818cf8', ink: '#eef2ff', muted: '#c7d2fe' },
  { id: 'sunset', label: 'Sunset', background: '#9a3412', glow: '#fb7185', ink: '#fff7ed', muted: '#fed7aa' },
  { id: 'night', label: 'Night', background: '#0f172a', glow: '#38bdf8', ink: '#f8fafc', muted: '#94a3b8' },
  { id: 'court', label: 'Court', background: '#1c1917', glow: '#fb923c', ink: '#fff7ed', muted: '#fdba74' },
  { id: 'cafe', label: 'Cafe', background: '#78350f', glow: '#fbbf24', ink: '#fffbeb', muted: '#fde68a' },
  { id: 'grove', label: 'Grove', background: '#14532d', glow: '#4ade80', ink: '#f0fdf4', muted: '#bbf7d0' },
];

const THEME_BY_ID = Object.fromEntries(EVENT_THEMES.map((theme) => [theme.id, theme])) as Record<EventTheme, EventThemeStyle>;

export function eventThemeStyle(theme?: string): EventThemeStyle {
  return (theme && theme in THEME_BY_ID ? THEME_BY_ID[theme as EventTheme] : undefined) || THEME_BY_ID.indigo;
}

export function EventPoster({
  title,
  when,
  place,
  visibility,
  theme,
  cancelled,
}: {
  title: string;
  when: string;
  place?: string;
  visibility?: EventVisibility;
  theme?: string;
  cancelled?: boolean;
}) {
  const style = eventThemeStyle(theme);
  return (
    <View style={{ backgroundColor: style.background }} className="rounded-3xl overflow-hidden px-5 pt-5 pb-6 min-h-[210px]">
      <View
        style={{ backgroundColor: style.glow, position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -70, right: -40, opacity: 0.9 }}
      />
      <View
        style={{ backgroundColor: style.ink, position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -50, left: -20, opacity: 0.08 }}
      />
      <View className="flex-row items-center">
        {visibility && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.16)' }} className="rounded-full px-2.5 py-1">
            <Text style={{ color: style.ink }} className="text-[11px] font-bold uppercase">
              {visibility === 'private' ? 'Private' : 'Public'}
            </Text>
          </View>
        )}
        {cancelled && (
          <Text className="text-[12px] font-bold text-rose-200 ml-2">Cancelled</Text>
        )}
      </View>
      <Text style={{ color: style.ink }} className="text-[32px] font-extrabold mt-8 leading-9" numberOfLines={3}>
        {title.trim() || 'Name the hangout'}
      </Text>
      <Text style={{ color: style.muted }} className="text-[15px] font-semibold mt-3">{when}</Text>
      {place ? (
        <Text style={{ color: style.ink }} className="text-[15px] mt-1" numberOfLines={1}>{place}</Text>
      ) : null}
    </View>
  );
}

export function ThemePicker({ value, onChange }: { value?: string; onChange: (theme: EventTheme) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {EVENT_THEMES.map((theme) => {
        const selected = eventThemeStyle(value).id === theme.id;
        return (
          <TouchableOpacity
            key={theme.id}
            onPress={() => onChange(theme.id)}
            accessibilityLabel={`${theme.label} theme`}
            accessibilityState={{ selected }}
            style={{
              backgroundColor: theme.background,
              borderColor: selected ? '#0f172a' : 'transparent',
            }}
            className="w-11 h-11 rounded-full border-2 items-center justify-center"
          >
            <View style={{ backgroundColor: theme.glow }} className="w-4 h-4 rounded-full" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
