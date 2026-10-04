import React from 'react';
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Sparkles, type LucideIcon } from 'lucide-react-native';
import { CATEGORY_META, colors, getAvatarColor, getScoreTone } from '@/lib/theme';
import { getInitials } from '@/lib/format';
import { getOpenStatus } from '@/lib/hours';
import { findVibeIdentityByTitle } from '@/types/vibes';
import type { SpaceCategory } from '@/types/space';

// NativeWind can't swap shadow classes between renders, so conditional shadows go through `style`.
const softShadow: ViewStyle = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
};

const activeSegmentStyle: ViewStyle = { ...softShadow, backgroundColor: '#ffffff' };

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="px-5 pt-3 pb-4 flex-row items-end justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-[32px] font-extrabold text-ink tracking-tight">{title}</Text>
        {subtitle && <Text className="text-[15px] text-slate-500 mt-1 leading-5">{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  color = colors.ink,
  background = 'bg-white',
  accessibilityLabel,
}: {
  icon: LucideIcon;
  onPress: () => void;
  color?: string;
  background?: string;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
      className={`w-11 h-11 rounded-full items-center justify-center border border-slate-200 ${background}`}
    >
      <Icon size={20} color={color} />
    </TouchableOpacity>
  );
}

export function Avatar({
  name,
  size = 40,
  ringColor,
}: {
  name: string;
  size?: number;
  ringColor?: string;
}) {
  const ring = ringColor ? 3 : 0;
  return (
    <View
      style={{
        width: size + ring * 2,
        height: size + ring * 2,
        borderRadius: (size + ring * 2) / 2,
        borderWidth: ring,
        borderColor: ringColor,
        padding: ringColor ? 2 : 0,
      }}
      className="items-center justify-center"
    >
      <View
        style={{
          width: ringColor ? size - 4 : size,
          height: ringColor ? size - 4 : size,
          borderRadius: size / 2,
          backgroundColor: getAvatarColor(name),
        }}
        className="items-center justify-center"
      >
        <Text style={{ fontSize: size * 0.36 }} className="text-white font-bold">
          {getInitials(name)}
        </Text>
      </View>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  color = colors.primary,
  elevated = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  color?: string;
  elevated?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        elevated ? softShadow : undefined,
        selected ? { backgroundColor: color, borderColor: color } : undefined,
      ]}
      className={`flex-row items-center px-3.5 h-9 rounded-full border ${
        selected ? '' : 'bg-white border-slate-200'
      }`}
    >
      {Icon && <Icon size={14} color={selected ? 'white' : color} />}
      <Text className={`text-[13px] font-semibold ${Icon ? 'ml-1.5' : ''} ${selected ? 'text-white' : 'text-slate-700'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={style} className="flex-row bg-slate-100 rounded-2xl p-1">
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={isActive ? activeSegmentStyle : undefined}
            className="flex-1 flex-row h-9 rounded-xl items-center justify-center"
          >
            {Icon && <Icon size={14} color={isActive ? colors.ink : colors.muted} />}
            <Text className={`text-[13px] font-semibold ${Icon ? 'ml-1.5' : ''} ${isActive ? 'text-ink' : 'text-slate-500'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CategoryIcon({ category, size = 44 }: { category: SpaceCategory; size?: number }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: meta.tint }}
      className="items-center justify-center"
    >
      <Icon size={size * 0.48} color={meta.color} />
    </View>
  );
}

export function ScorePill({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const tone = getScoreTone(score);
  return (
    <View
      style={{ backgroundColor: tone.background }}
      className={`rounded-full items-center justify-center ${size === 'sm' ? 'px-2 h-6' : 'px-2.5 h-7'}`}
    >
      <Text style={{ color: tone.text }} className={`font-extrabold ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        {score}
      </Text>
    </View>
  );
}

export function OpenStatusBadge({ hours, showDetail = true }: { hours?: string; showDetail?: boolean }) {
  const status = getOpenStatus(hours);
  if (!status) return null;
  const tone = status.isOpen ? colors.success : colors.closed;
  return (
    <View className="flex-row items-center">
      <View style={{ backgroundColor: tone }} className="w-2 h-2 rounded-full" />
      <Text style={{ color: tone }} className="text-[13px] font-bold ml-1.5">{status.isOpen ? 'Open now' : 'Closed'}</Text>
      {showDetail && status.detail && (
        <Text numberOfLines={1} className="text-[13px] text-slate-500 flex-shrink"> · {status.detail}</Text>
      )}
    </View>
  );
}

export function VibeTitleChip({ title, size = 'sm' }: { title?: string; size?: 'sm' | 'md' }) {
  if (!title) return null;
  const identity = findVibeIdentityByTitle(title);
  const color = identity?.color || colors.secret;
  return (
    <View
      style={{ backgroundColor: `${color}1A` }}
      className={`flex-row items-center self-start rounded-full ${size === 'md' ? 'px-3 py-1.5' : 'px-2 py-0.5'}`}
    >
      <Sparkles size={size === 'md' ? 13 : 10} color={color} />
      <Text style={{ color }} className={`font-bold ml-1 ${size === 'md' ? 'text-[13px]' : 'text-[11px]'}`}>
        {title}
      </Text>
    </View>
  );
}

export function ProgressBar({ progress, color = colors.primary, height = 8 }: { progress: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2 }} className="bg-slate-100 overflow-hidden">
      <View
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="bg-white rounded-3xl border border-slate-200 px-6 py-10 items-center">
      <View className="w-14 h-14 rounded-full bg-slate-100 items-center justify-center mb-4">
        <Icon size={26} color={colors.subtle} />
      </View>
      <Text className="text-lg font-bold text-ink text-center">{title}</Text>
      <Text className="text-slate-500 text-center mt-1.5 leading-5">{body}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.8} className="mt-5 bg-primary rounded-full px-5 h-11 items-center justify-center">
          <Text className="text-white font-semibold">{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon: Icon,
  disabled,
  loading,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'secret' | 'neutral';
}) {
  const background = disabled
    ? 'bg-slate-200'
    : tone === 'secret' ? 'bg-secret' : tone === 'neutral' ? 'bg-slate-100' : 'bg-primary';
  const textColor = disabled ? colors.subtle : tone === 'neutral' ? colors.ink : 'white';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      className={`h-[52px] rounded-2xl flex-row items-center justify-center px-5 ${background}`}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {Icon && <Icon size={18} color={textColor} />}
          <Text style={{ color: textColor }} className={`font-bold text-base ${Icon ? 'ml-2' : ''}`}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-[17px] font-bold text-ink">{title}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text className="text-primary font-semibold text-sm">{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
