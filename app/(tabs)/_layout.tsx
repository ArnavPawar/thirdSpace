import React from 'react';
import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, House, Map as MapIcon, SquarePlus } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { demoUserLabel } from '@/lib/auth';
import { getDisplayName } from '@/lib/format';
import { useMyProfile } from '@/lib/myProfile';
import { useColors } from '@/lib/theme';

const ICON_SIZE = 24;

function ProfileTabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
  const { profile } = useMyProfile();
  const name = profile ? getDisplayName(profile) : demoUserLabel;
  return (
    <View
      style={{ borderColor: focused ? color : 'transparent' }}
      className="w-[30px] h-[30px] rounded-full border-2 items-center justify-center"
    >
      <Avatar name={name} uri={profile?.avatar_url} size={24} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 0.5,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, focused }) => <House size={ICON_SIZE} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => <MapIcon size={ICON_SIZE} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => <CalendarDays size={ICON_SIZE} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          title: 'Rate',
          tabBarIcon: ({ color, focused }) => <SquarePlus size={ICON_SIZE} color={color} strokeWidth={focused ? 2.25 : 1.75} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <ProfileTabIcon focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}
