import React from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  Bell,
  ChevronRight,
  CircleHelp,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Newspaper,
  Shield,
  Smartphone,
  Sun,
  UserRound,
  UsersRound,
  MessageCircle,
} from 'lucide-react-native';
import { Avatar, ListGroup, ListRow, SegmentedControl } from '@/components/ui';
import { demoUserLabel, useAuth } from '@/lib/auth';
import { getDisplayName } from '@/lib/format';
import { useMyProfile } from '@/lib/myProfile';
import { usePreferences, type AppearancePreference } from '@/lib/preferences';
import { useColors } from '@/lib/theme';

const SUPPORT_EMAIL = 'support@thirdspace.app';

export default function SettingsScreen() {
  const colors = useColors();
  const { user, isDemoMode, signOut } = useAuth();
  const { profile } = useMyProfile();
  const { preferences, setAppearance, setDefaultFeed } = usePreferences();
  const name = profile ? getDisplayName(profile) : demoUserLabel;
  const notificationsSummary = preferences.notificationsPaused
    ? 'Paused'
    : `${Object.values(preferences.notifications).filter(Boolean).length} on`;

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(tabs)/profile');
          } catch {
            Alert.alert('Could not sign out', 'Please try again.');
          }
        },
      },
    ]);
  };

  const sendFeedback = () => {
    const subject = encodeURIComponent('Third Space feedback');
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {
      Alert.alert('Email not set up', `Write to us at ${SUPPORT_EMAIL}.`);
    });
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <TouchableOpacity
        onPress={() => router.push('/settings/profile' as never)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        className="bg-surface rounded-2xl p-4 flex-row items-center mb-6"
      >
        <Avatar name={name} uri={profile?.avatar_url} size={56} />
        <View className="flex-1 ml-3.5">
          <Text className="text-[18px] font-semibold text-ink" numberOfLines={1}>{name}</Text>
          <Text className="text-[14px] text-muted mt-0.5" numberOfLines={1}>
            {profile?.username ? `@${profile.username} · ` : ''}Edit profile and photo
          </Text>
        </View>
        <ChevronRight size={18} color={colors.faint} />
      </TouchableOpacity>

      {isDemoMode && (
        <ListGroup footer="You're exploring demo data. Sign in to keep your ratings, saved spots, and photo.">
          <ListRow icon={LogIn} iconColor={colors.primary} title="Sign in or create account" onPress={() => router.push('/auth' as never)} />
        </ListGroup>
      )}

      <ListGroup title="Account">
        <ListRow icon={UserRound} title="Sign-in & security" value={user?.email ?? undefined} onPress={() => router.push('/settings/account' as never)} />
        <ListRow icon={Bell} title="Notifications" value={notificationsSummary} onPress={() => router.push('/settings/notifications' as never)} />
        <ListRow icon={Shield} title="Privacy" onPress={() => router.push('/settings/privacy' as never)} />
      </ListGroup>

      <ListGroup title="Appearance">
        <View className="px-4 py-3">
          <SegmentedControl<AppearancePreference>
            value={preferences.appearance}
            onChange={setAppearance}
            options={[
              { value: 'system', label: 'System', icon: Smartphone },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
        </View>
      </ListGroup>

      <ListGroup title="Feed" footer="Which feed opens first when you launch the app.">
        <View className="px-4 py-3 flex-row items-center">
          <View className="flex-row items-center flex-1">
            <Newspaper size={17} color={colors.body} />
            <Text className="text-[16px] text-ink ml-3">Start on</Text>
          </View>
          <View className="w-[190px]">
            <SegmentedControl
              value={preferences.defaultFeed}
              onChange={setDefaultFeed}
              options={[
                { value: 'public', label: 'Public' },
                { value: 'following', label: 'Following' },
              ]}
            />
          </View>
        </View>
      </ListGroup>

      <ListGroup title="Your stuff">
        <ListRow icon={UsersRound} title="Groups" onPress={() => router.push('/groups' as never)} />
        <ListRow icon={MessageCircle} title="Chats" onPress={() => router.push('/chats' as never)} />
        <ListRow
          icon={KeyRound}
          iconColor={colors.secret}
          title="Find secret spots"
          onPress={() => router.push({ pathname: '/map', params: { mode: 'secret' } } as never)}
        />
        <ListRow icon={MapPin} title="Location access" onPress={() => Linking.openSettings()} />
      </ListGroup>

      <ListGroup title="Support">
        <ListRow icon={CircleHelp} title="Send feedback" subtitle="Report a bug or suggest a feature" onPress={sendFeedback} />
        <ListRow title="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
      </ListGroup>

      {user && (
        <ListGroup>
          <ListRow icon={LogOut} title="Sign out" destructive showChevron={false} onPress={confirmSignOut} />
        </ListGroup>
      )}
    </ScrollView>
  );
}
