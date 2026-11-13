import {
  Bike,
  BookOpen,
  Camera,
  Cat,
  Coffee,
  Dog,
  Flower2,
  Gamepad2,
  Headphones,
  Moon,
  Mountain,
  Music,
  Palette,
  Pizza,
  Sprout,
  Sunset,
  Tent,
  Trees,
  Waves,
  Wine,
  type LucideIcon,
} from 'lucide-react-native';

export interface AvatarPreset {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'coffee', label: 'Coffee', icon: Coffee, color: '#9a6a3a' },
  { id: 'trees', label: 'Trees', icon: Trees, color: '#2f7a52' },
  { id: 'sunset', label: 'Sunset', icon: Sunset, color: '#c0567f' },
  { id: 'moon', label: 'Moon', icon: Moon, color: '#4a4f8a' },
  { id: 'mountain', label: 'Mountain', icon: Mountain, color: '#4a6a8a' },
  { id: 'waves', label: 'Waves', icon: Waves, color: '#2c7f9b' },
  { id: 'bike', label: 'Bike', icon: Bike, color: '#c2602a' },
  { id: 'book', label: 'Book', icon: BookOpen, color: '#6a5a8a' },
  { id: 'music', label: 'Music', icon: Music, color: '#a04a6a' },
  { id: 'headphones', label: 'Headphones', icon: Headphones, color: '#3a3a3a' },
  { id: 'wine', label: 'Wine', icon: Wine, color: '#8a3a4a' },
  { id: 'games', label: 'Games', icon: Gamepad2, color: '#2c8a8b' },
  { id: 'camera', label: 'Camera', icon: Camera, color: '#5a5a62' },
  { id: 'palette', label: 'Palette', icon: Palette, color: '#b7791f' },
  { id: 'sprout', label: 'Sprout', icon: Sprout, color: '#5a8a3a' },
  { id: 'flower', label: 'Flower', icon: Flower2, color: '#c05a8a' },
  { id: 'tent', label: 'Tent', icon: Tent, color: '#7a6a3a' },
  { id: 'pizza', label: 'Pizza', icon: Pizza, color: '#c5503b' },
  { id: 'dog', label: 'Dog', icon: Dog, color: '#8a6a4a' },
  { id: 'cat', label: 'Cat', icon: Cat, color: '#4a5a6a' },
];

const PRESET_PREFIX = 'preset:';

export const presetAvatarValue = (presetId: string) => `${PRESET_PREFIX}${presetId}`;

export type ParsedAvatar =
  | { kind: 'preset'; preset: AvatarPreset }
  | { kind: 'image'; uri: string }
  | { kind: 'none' };

/** `profiles.avatar_url` holds either an image URL or `preset:<id>`. */
export function parseAvatar(value?: string | null): ParsedAvatar {
  if (!value) return { kind: 'none' };
  if (value.startsWith(PRESET_PREFIX)) {
    const preset = AVATAR_PRESETS.find((item) => item.id === value.slice(PRESET_PREFIX.length));
    return preset ? { kind: 'preset', preset } : { kind: 'none' };
  }
  return { kind: 'image', uri: value };
}
