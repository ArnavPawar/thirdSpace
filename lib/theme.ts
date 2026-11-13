import { useColorScheme } from 'nativewind';
import { Building2, Coffee, Gamepad2, Sunset, Trees, Trophy, Wine, type LucideIcon } from 'lucide-react-native';
import type { SpaceCategory } from '@/types/space';
import { palettes, type Palette } from './palettes';

export { palettes, type Palette };

export type ColorScheme = 'light' | 'dark';

export function useColorSchemeName(): ColorScheme {
  return useColorScheme().colorScheme === 'dark' ? 'dark' : 'light';
}

export function useColors(): Palette {
  return palettes[useColorSchemeName()];
}

/** Appends an alpha channel to a 6-digit hex color. */
export function withAlpha(hex: string, alpha: number) {
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex.slice(0, 7)}${channel}`;
}

export interface CategoryMeta {
  short: string;
  blurb: string;
  icon: LucideIcon;
  color: string;
  /** Translucent so it reads on both light and dark surfaces. */
  tint: string;
}

const category = (meta: Omit<CategoryMeta, 'tint'>): CategoryMeta => ({ ...meta, tint: withAlpha(meta.color, 0.14) });

export const CATEGORY_META: Record<SpaceCategory, CategoryMeta> = {
  'Cafe & Coworking': category({
    short: 'Cafe',
    blurb: 'Cafes & coworking',
    icon: Coffee,
    color: '#b7791f',
  }),
  'Park & Nature': category({
    short: 'Park',
    blurb: 'Parks & nature',
    icon: Trees,
    color: '#2f8a57',
  }),
  'Sports Area': category({
    short: 'Sports',
    blurb: 'Courts & fields',
    icon: Trophy,
    color: '#dd6b20',
  }),
  'Smoke & Sunset Spots': category({
    short: 'Sunset',
    blurb: 'Sunset & smoke spots',
    icon: Sunset,
    color: '#c0417f',
  }),
  'Social Drinking Spots': category({
    short: 'Drinks',
    blurb: 'Bars & lounges',
    icon: Wine,
    color: '#c53b4a',
  }),
  'Interactive Fun (Arcades, Board Games)': category({
    short: 'Games',
    blurb: 'Arcades & board games',
    icon: Gamepad2,
    color: '#2c8a8b',
  }),
  'Public Architecture (Atriums, Hotel Lobbies)': category({
    short: 'Lobbies',
    blurb: 'Atriums & hotel lobbies',
    icon: Building2,
    color: '#3b6fc4',
  }),
};

export function getScoreTone(score: number, palette: Palette) {
  if (score >= 80) return { text: palette.success, background: palette.successSoft };
  if (score >= 60) return { text: palette.warning, background: palette.warningSoft };
  return { text: palette.danger, background: palette.dangerSoft };
}

const AVATAR_COLORS = ['#3f6f5a', '#4a6a8a', '#8a5a6e', '#9a6a3a', '#5a7a3a', '#6a5a8a', '#3a7a7a', '#8a4a4a'];

export function getAvatarColor(seed: string) {
  const hash = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
