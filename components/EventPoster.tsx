import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/lib/theme';
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

function PosterBadge({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={{ backgroundColor: background }} className="rounded-full px-2.5 py-1 mr-2">
      <Text style={{ color }} className="text-[12px] font-semibold">{label}</Text>
    </View>
  );
}

export function EventPoster({
  title,
  when,
  place,
  visibility,
  theme,
  cancelled,
  ended,
}: {
  title: string;
  when: string;
  place?: string;
  visibility?: EventVisibility;
  theme?: string;
  cancelled?: boolean;
  ended?: boolean;
}) {
  const style = eventThemeStyle(theme);
  return (
    <View style={{ backgroundColor: style.background }} className="rounded-2xl overflow-hidden px-5 pt-5 pb-6 min-h-[200px]">
      <View
        style={{ backgroundColor: style.glow, position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -80, right: -50, opacity: ended ? 0.3 : 0.75 }}
      />
      <View className="flex-row items-center">
        {visibility && (
          <PosterBadge
            label={visibility === 'private' ? 'Private' : 'Public'}
            color={style.ink}
            background="rgba(255,255,255,0.16)"
          />
        )}
        {cancelled && <PosterBadge label="Cancelled" color="#fecdd3" background="rgba(0,0,0,0.35)" />}
        {ended && !cancelled && <PosterBadge label="Ended" color={style.ink} background="rgba(0,0,0,0.35)" />}
      </View>
      <Text style={{ color: style.ink }} className="text-[30px] font-bold tracking-tight mt-8 leading-9" numberOfLines={3}>
        {title.trim() || 'Name the hangout'}
      </Text>
      <Text style={{ color: style.muted }} className="text-[15px] font-medium mt-3">{when}</Text>
      {place ? (
        <Text style={{ color: style.ink }} className="text-[15px] mt-1" numberOfLines={1}>{place}</Text>
      ) : null}
    </View>
  );
}

export function ThemePicker({ value, onChange }: { value?: string; onChange: (theme: EventTheme) => void }) {
  const colors = useColors();
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
            activeOpacity={0.7}
            style={{ borderColor: selected ? colors.ink : 'transparent' }}
            className="w-11 h-11 rounded-full border-2 items-center justify-center"
          >
            <View style={{ backgroundColor: theme.background }} className="w-9 h-9 rounded-full items-center justify-center">
              <View style={{ backgroundColor: theme.glow }} className="w-3.5 h-3.5 rounded-full" />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
