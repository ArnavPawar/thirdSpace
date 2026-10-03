import React from 'react';
import { Text, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, CirclePlus, Home, Map as MapIcon, User } from 'lucide-react-native';
import { colors } from '@/lib/theme';

const CALENDAR_BUTTON_SIZE = 58;

function CalendarTabButton({
  onPress,
  onLongPress,
  selected,
}: {
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: ((event: GestureResponderEvent) => void) | null;
  selected: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="box-none">
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress ?? undefined}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Calendar"
        accessibilityState={{ selected }}
        style={{
          marginTop: -18,
          width: CALENDAR_BUTTON_SIZE,
          height: CALENDAR_BUTTON_SIZE,
          borderRadius: CALENDAR_BUTTON_SIZE / 2,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 4,
          borderColor: selected ? '#c7d2fe' : colors.surface,
          shadowColor: colors.primary,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        <CalendarDays size={26} color="white" />
      </TouchableOpacity>
      <Text
        style={{ marginTop: 3, fontSize: 11, fontWeight: '600', color: selected ? colors.primary : colors.subtle }}
      >
        Calendar
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <MapIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarButton: (props) => (
            <CalendarTabButton
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              selected={Boolean(props['aria-selected'])}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="rank"
        options={{
          title: 'Rate',
          tabBarIcon: ({ color, size }) => <CirclePlus size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
