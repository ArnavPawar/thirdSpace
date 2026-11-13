import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, X, type LucideIcon } from 'lucide-react-native';
import { parseAvatar } from '@/lib/avatars';
import { CATEGORY_META, getAvatarColor, getScoreTone, useColors, useColorSchemeName, withAlpha } from '@/lib/theme';
import { getInitials } from '@/lib/format';
import { getOpenStatus } from '@/lib/hours';
import { findVibeIdentityByTitle } from '@/types/vibes';
import type { SpaceCategory } from '@/types/space';

// NativeWind can't swap shadow classes between renders, so conditional shadows go through `style`.
export const softShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

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
    <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-[30px] font-bold text-ink tracking-tight">{title}</Text>
        {subtitle && <Text className="text-[15px] text-muted mt-0.5 leading-5">{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  color,
  accessibilityLabel,
  badge,
  variant = 'fill',
  size = 40,
}: {
  icon: LucideIcon;
  onPress: () => void;
  color?: string;
  accessibilityLabel: string;
  badge?: number;
  variant?: 'fill' | 'plain' | 'surface';
  size?: number;
}) {
  const colors = useColors();
  const background = variant === 'fill' ? 'bg-fill' : variant === 'surface' ? 'bg-surface border border-line' : '';
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      activeOpacity={0.6}
      hitSlop={4}
      style={{ width: size, height: size }}
      className={`rounded-full items-center justify-center ${background}`}
    >
      <Icon size={20} color={color ?? colors.ink} />
      {badge ? (
        <View className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-like items-center justify-center border-2 border-canvas">
          <Text className="text-[10px] font-bold text-white">{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function Avatar({
  name,
  uri,
  size = 40,
  ringColor,
}: {
  name: string;
  /** A profile's `avatar_url`: an image URL, a `preset:` value, or empty for initials. */
  uri?: string | null;
  size?: number;
  ringColor?: string;
}) {
  const avatar = parseAvatar(uri);
  const ring = ringColor ? 2 : 0;
  const gap = ringColor ? 2 : 0;
  const inner = size - (ring + gap) * 2;

  let content: React.ReactNode;
  if (avatar.kind === 'image') {
    content = (
      <Image
        source={{ uri: avatar.uri }}
        style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        contentFit="cover"
        transition={120}
        accessibilityIgnoresInvertColors
      />
    );
  } else if (avatar.kind === 'preset') {
    const Icon = avatar.preset.icon;
    content = (
      <View
        style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: avatar.preset.color }}
        className="items-center justify-center"
      >
        <Icon size={inner * 0.5} color="white" strokeWidth={1.75} />
      </View>
    );
  } else {
    content = (
      <View
        style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: getAvatarColor(name) }}
        className="items-center justify-center"
      >
        <Text style={{ fontSize: inner * 0.38 }} className="text-white font-semibold">
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: ringColor,
      }}
      className="items-center justify-center"
    >
      {content}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  color,
  iconColor,
  elevated = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** Fill color when selected. Defaults to ink. */
  color?: string;
  /** Icon color while unselected, e.g. a category color on an ink-selected chip. */
  iconColor?: string;
  elevated?: boolean;
}) {
  const colors = useColors();
  const selectedBackground = color ?? colors.ink;
  const selectedText = color ? '#ffffff' : colors.canvas;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        elevated ? softShadow : undefined,
        { backgroundColor: selected ? selectedBackground : elevated ? colors.surface : colors.fill },
      ]}
      className="flex-row items-center px-3.5 h-9 rounded-full"
    >
      {Icon && <Icon size={14} color={selected ? selectedText : iconColor ?? color ?? colors.body} />}
      <Text
        style={{ color: selected ? selectedText : colors.body }}
        className={`text-[14px] font-medium ${Icon ? 'ml-1.5' : ''}`}
      >
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
  const colors = useColors();
  const scheme = useColorSchemeName();
  const activeBackground = scheme === 'dark' ? colors.fillStrong : colors.surface;
  return (
    <View style={style} className="flex-row bg-fill rounded-xl p-0.5">
      {options.map((option) => {
        const isActive = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={isActive ? [scheme === 'light' ? softShadow : undefined, { backgroundColor: activeBackground }] : undefined}
            className="flex-1 flex-row h-8 rounded-[10px] items-center justify-center px-1"
          >
            {Icon && <Icon size={14} color={isActive ? colors.ink : colors.muted} />}
            <Text
              numberOfLines={1}
              className={`text-[13px] ${Icon ? 'ml-1.5' : ''} ${isActive ? 'text-ink font-semibold' : 'text-muted font-medium'}`}
            >
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
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: meta.tint }}
      className="items-center justify-center"
    >
      <Icon size={size * 0.46} color={meta.color} />
    </View>
  );
}

export function ScorePill({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const colors = useColors();
  const tone = getScoreTone(score, colors);
  return (
    <View
      style={{ backgroundColor: tone.background }}
      className={`rounded-lg items-center justify-center ${size === 'sm' ? 'px-1.5 h-6 min-w-[30px]' : 'px-2 h-7 min-w-[36px]'}`}
    >
      <Text style={{ color: tone.text }} className={`font-bold ${size === 'sm' ? 'text-[12px]' : 'text-[14px]'}`}>
        {score}
      </Text>
    </View>
  );
}

export function OpenStatusBadge({ hours, showDetail = true }: { hours?: string; showDetail?: boolean }) {
  const colors = useColors();
  const status = getOpenStatus(hours);
  if (!status) return null;
  const tone = status.isOpen ? colors.success : colors.danger;
  return (
    <View className="flex-row items-center">
      <View style={{ backgroundColor: tone }} className="w-1.5 h-1.5 rounded-full" />
      <Text style={{ color: tone }} className="text-[13px] font-semibold ml-1.5">{status.isOpen ? 'Open now' : 'Closed'}</Text>
      {showDetail && status.detail && (
        <Text numberOfLines={1} className="text-[13px] text-muted flex-shrink"> · {status.detail}</Text>
      )}
    </View>
  );
}

export function VibeTitleChip({ title, size = 'sm' }: { title?: string; size?: 'sm' | 'md' }) {
  const colors = useColors();
  if (!title) return null;
  const identity = findVibeIdentityByTitle(title);
  const color = identity?.color || colors.secret;
  return (
    <View
      style={{ backgroundColor: withAlpha(color, 0.12) }}
      className={`flex-row items-center self-start rounded-full ${size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'}`}
    >
      <View style={{ backgroundColor: color }} className={`rounded-full ${size === 'md' ? 'w-1.5 h-1.5' : 'w-1 h-1'}`} />
      <Text style={{ color }} className={`font-semibold ml-1 ${size === 'md' ? 'text-[13px]' : 'text-[11px]'}`}>
        {title}
      </Text>
    </View>
  );
}

export function ProgressBar({ progress, color, height = 6 }: { progress: number; color?: string; height?: number }) {
  const colors = useColors();
  return (
    <View style={{ height, borderRadius: height / 2 }} className="bg-fill overflow-hidden">
      <View
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color ?? colors.primary,
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
  const colors = useColors();
  return (
    <View className="px-6 py-12 items-center">
      <View className="w-12 h-12 rounded-full bg-fill items-center justify-center mb-4">
        <Icon size={22} color={colors.muted} />
      </View>
      <Text className="text-[17px] font-semibold text-ink text-center">{title}</Text>
      <Text className="text-[15px] text-muted text-center mt-1 leading-5 max-w-[300px]">{body}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.8}
          className="mt-5 bg-ink rounded-full px-5 h-10 items-center justify-center"
        >
          <Text className="text-canvas font-semibold text-[15px]">{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

type ButtonTone = 'primary' | 'secret' | 'neutral' | 'danger' | 'ink';

export function PrimaryButton({
  label,
  onPress,
  icon: Icon,
  disabled,
  loading,
  tone = 'primary',
  size = 'lg',
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  tone?: ButtonTone;
  size?: 'md' | 'lg';
}) {
  const colors = useColors();
  const fills: Record<ButtonTone, { background: string; text: string }> = {
    primary: { background: colors.primary, text: colors.onPrimary },
    secret: { background: colors.secret, text: '#ffffff' },
    neutral: { background: colors.fill, text: colors.ink },
    danger: { background: colors.dangerSoft, text: colors.danger },
    ink: { background: colors.ink, text: colors.canvas },
  };
  const fill = disabled ? { background: colors.fill, text: colors.subtle } : fills[tone];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={{ backgroundColor: fill.background }}
      className={`rounded-xl flex-row items-center justify-center px-5 ${size === 'lg' ? 'h-[50px]' : 'h-10'}`}
    >
      {loading ? (
        <ActivityIndicator color={fill.text} />
      ) : (
        <>
          {Icon && <Icon size={size === 'lg' ? 18 : 16} color={fill.text} />}
          <Text
            style={{ color: fill.text }}
            className={`font-semibold ${size === 'lg' ? 'text-[16px]' : 'text-[14px]'} ${Icon ? 'ml-2' : ''}`}
          >
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
      <Text className="text-[18px] font-semibold text-ink">{title}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.6} hitSlop={8}>
          <Text className="text-primary font-medium text-[15px]">{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Small uppercase-free label above a group of content, like iOS grouped lists. */
export function GroupLabel({ children }: { children: string }) {
  return <Text className="text-[13px] font-medium text-muted px-4 mb-1.5">{children}</Text>;
}

export function ListGroup({
  title,
  footer,
  children,
  style,
  separatorInset = 16,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Left inset for hairlines, so they can clear a leading icon or avatar. */
  separatorInset?: number;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style} className="mb-6">
      {title ? <GroupLabel>{title}</GroupLabel> : null}
      <View className="bg-surface rounded-2xl overflow-hidden">
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 && <View style={{ marginLeft: separatorInset }} className="h-px bg-line-soft" />}
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text className="text-[13px] text-muted px-4 mt-1.5 leading-[18px]">{footer}</Text> : null}
    </View>
  );
}

export function RowIcon({ icon: Icon, color }: { icon: LucideIcon; color?: string }) {
  const colors = useColors();
  const tone = color ?? colors.body;
  return (
    <View style={{ backgroundColor: withAlpha(tone, 0.12) }} className="w-8 h-8 rounded-lg items-center justify-center mr-3">
      <Icon size={17} color={tone} />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  left,
  right,
  onPress,
  destructive,
  showChevron,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: LucideIcon;
  iconColor?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const chevron = showChevron ?? Boolean(onPress && !right);
  const content = (
    <View className="flex-row items-center px-4 min-h-[52px] py-2.5" style={disabled ? { opacity: 0.5 } : undefined}>
      {left ?? (icon ? <RowIcon icon={icon} color={destructive ? colors.danger : iconColor} /> : null)}
      <View className="flex-1 pr-2">
        <Text className={`text-[16px] ${destructive ? 'text-danger font-medium' : 'text-ink'}`}>{title}</Text>
        {subtitle ? <Text className="text-[13px] text-muted mt-0.5 leading-[18px]">{subtitle}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} className="text-[15px] text-muted max-w-[50%]">{value}</Text> : null}
      {right}
      {chevron && <ChevronRight size={18} color={colors.faint} style={{ marginLeft: 4 }} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.6} accessibilityRole="button">
      {content}
    </TouchableOpacity>
  );
}

export function ToggleRow({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconColor={iconColor}
      disabled={disabled}
      right={(
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.fillStrong }}
          thumbColor="#ffffff"
          ios_backgroundColor={colors.fillStrong}
          accessibilityLabel={title}
        />
      )}
    />
  );
}

export function TextField({
  label,
  hint,
  multiline,
  style,
  onSurface,
  ...props
}: TextInputProps & { label?: string; hint?: string; onSurface?: boolean }) {
  const colors = useColors();
  const scheme = useColorSchemeName();
  return (
    <View className="mb-4">
      {label ? <Text className="text-[13px] font-medium text-muted mb-1.5 ml-1">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.subtle}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        keyboardAppearance={scheme}
        className={`${onSurface ? 'bg-fill' : 'bg-surface'} rounded-xl px-4 text-[16px] text-ink ${multiline ? 'py-3 min-h-[96px]' : 'h-12'}`}
        style={style}
        {...props}
      />
      {hint ? <Text className="text-[12px] text-subtle mt-1.5 ml-1">{hint}</Text> : null}
    </View>
  );
}

export function CloseButton({ onPress, label = 'Close' }: { onPress: () => void; label?: string }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      className="w-8 h-8 rounded-full bg-fill items-center justify-center"
    >
      <X size={16} color={colors.body} strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

/**
 * One look for every pop-up. `page` slides up a full-height sheet; `bottom` is a card anchored
 * to the bottom that sizes to its content.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  variant = 'page',
  scroll = true,
  headerRight,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  variant?: 'page' | 'bottom';
  scroll?: boolean;
  headerRight?: React.ReactNode;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const header = (title || headerRight) ? (
    <View className="flex-row items-start justify-between px-5 pt-5 pb-3">
      <View className="flex-1 pr-3">
        {title ? <Text className="text-[20px] font-bold text-ink tracking-tight">{title}</Text> : null}
        {subtitle ? <Text className="text-[14px] text-muted mt-0.5 leading-5">{subtitle}</Text> : null}
      </View>
      {headerRight}
      <CloseButton onPress={onClose} label={closeLabel} />
    </View>
  ) : null;

  if (variant === 'bottom') {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Dismiss" />
          <View className="bg-surface rounded-t-[28px] max-h-[88%]">
            <View className="w-9 h-1 bg-fill-strong rounded-full self-center mt-2.5" />
            {header}
            {scroll ? (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: header ? 0 : 16 }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <SafeAreaView edges={['bottom']} className="px-5 pb-4">{children}</SafeAreaView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-canvas">
        {header}
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1">{children}</View>
        )}
      </View>
    </Modal>
  );
}

/** A tappable person row used by follower lists, invite lists, and attendee lists. */
export function PersonRow({
  name,
  avatarUrl,
  subtitle,
  onPress,
  right,
  avatarSize = 44,
  accessibilityLabel,
}: {
  name: string;
  avatarUrl?: string | null;
  subtitle?: React.ReactNode;
  onPress?: () => void;
  right?: React.ReactNode;
  avatarSize?: number;
  /** Defaults to "View <name>'s profile". */
  accessibilityLabel?: string;
}) {
  return (
    <View className="flex-row items-center py-2.5">
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.6}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? accessibilityLabel ?? `View ${name}'s profile` : undefined}
        className="flex-1 flex-row items-center"
      >
        <Avatar name={name} uri={avatarUrl} size={avatarSize} />
        <View className="flex-1 ml-3">
          <Text numberOfLines={1} className="text-[16px] font-semibold text-ink">{name}</Text>
          {typeof subtitle === 'string' ? (
            <Text numberOfLines={1} className="text-[13px] text-muted mt-0.5">{subtitle}</Text>
          ) : subtitle}
        </View>
      </TouchableOpacity>
      {right}
    </View>
  );
}

/** Compact pill button for inline actions like Follow or Invite. */
export function PillButton({
  label,
  onPress,
  icon: Icon,
  active,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  icon?: LucideIcon;
  /** Active pills (e.g. Following) are quiet; inactive ones are the call to action. */
  active?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const textColor = active ? colors.ink : colors.canvas;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`h-8 px-3.5 rounded-full flex-row items-center ${active ? 'bg-fill' : 'bg-ink'}`}
    >
      {Icon && <Icon size={14} color={textColor} />}
      <Text style={{ color: textColor }} className={`text-[13px] font-semibold ${Icon ? 'ml-1' : ''}`}>{label}</Text>
    </TouchableOpacity>
  );
}
