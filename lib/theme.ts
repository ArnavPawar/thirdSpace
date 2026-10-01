import { Building2, Coffee, Gamepad2, Sunset, Trees, Trophy, Wine, type LucideIcon } from 'lucide-react-native';
import type { SpaceCategory } from '@/types/space';

export const colors = {
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  subtle: '#94a3b8',
  border: '#e2e8f0',
  surface: '#ffffff',
  background: '#f8fafc',
  secret: '#7c3aed',
  secretSoft: '#f5f3ff',
  like: '#e11d48',
  success: '#059669',
  warning: '#d97706',
};

export interface CategoryMeta {
  short: string;
  blurb: string;
  icon: LucideIcon;
  color: string;
  tint: string;
}

export const CATEGORY_META: Record<SpaceCategory, CategoryMeta> = {
  'Cafe & Coworking': {
    short: 'Cafe',
    blurb: 'Cafes & coworking',
    icon: Coffee,
    color: '#b45309',
    tint: '#fef3c7',
  },
  'Park & Nature': {
    short: 'Park',
    blurb: 'Parks & nature',
    icon: Trees,
    color: '#15803d',
    tint: '#dcfce7',
  },
  'Sports Area': {
    short: 'Sports',
    blurb: 'Courts & fields',
    icon: Trophy,
    color: '#ea580c',
    tint: '#ffedd5',
  },
  'Smoke & Sunset Spots': {
    short: 'Sunset',
    blurb: 'Sunset & smoke spots',
    icon: Sunset,
    color: '#c026d3',
    tint: '#fae8ff',
  },
  'Social Drinking Spots': {
    short: 'Drinks',
    blurb: 'Bars & lounges',
    icon: Wine,
    color: '#be123c',
    tint: '#ffe4e6',
  },
  'Interactive Fun (Arcades, Board Games)': {
    short: 'Games',
    blurb: 'Arcades & board games',
    icon: Gamepad2,
    color: '#0f766e',
    tint: '#ccfbf1',
  },
  'Public Architecture (Atriums, Hotel Lobbies)': {
    short: 'Lobbies',
    blurb: 'Atriums & hotel lobbies',
    icon: Building2,
    color: '#1d4ed8',
    tint: '#dbeafe',
  },
};

export function getScoreTone(score: number) {
  if (score >= 80) return { text: '#047857', background: '#d1fae5' };
  if (score >= 60) return { text: '#b45309', background: '#fef3c7' };
  return { text: '#be123c', background: '#ffe4e6' };
}

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#0f766e', '#be123c'];

export function getAvatarColor(seed: string) {
  const hash = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
