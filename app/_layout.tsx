import '../global.css';
import React, { useMemo } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { MyProfileProvider } from '@/lib/myProfile';
import { PreferencesProvider } from '@/lib/preferences';
import { palettes, useColorSchemeName } from '@/lib/theme';

function ThemedStack() {
  const scheme = useColorSchemeName();
  const colors = palettes[scheme];

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.canvas,
        card: colors.canvas,
        text: colors.ink,
        border: colors.line,
        notification: colors.like,
      },
    };
  }, [colors, scheme]);

  const pushed = {
    headerShown: true,
    title: '',
    headerBackTitle: 'Back',
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: 17 },
    headerStyle: { backgroundColor: colors.canvas },
  };
  const modal = { ...pushed, presentation: 'modal' as const, headerBackTitle: 'Close' };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ ...modal, title: 'Sign in' }} />
        <Stack.Screen name="auth/reset" options={{ ...pushed, title: 'Reset password' }} />
        <Stack.Screen name="space/[id]" options={pushed} />
        <Stack.Screen name="event/new" options={{ ...modal, title: 'Host an event' }} />
        <Stack.Screen name="event/[id]" options={pushed} />
        <Stack.Screen name="event/chat/[id]" options={{ ...pushed, title: 'Group chat' }} />
        <Stack.Screen name="messages/[id]" options={{ ...pushed, title: 'Message' }} />
        <Stack.Screen name="chats/index" options={{ ...pushed, title: 'Chats' }} />
        <Stack.Screen name="groups/index" options={{ ...pushed, title: 'Groups' }} />
        <Stack.Screen name="groups/new" options={{ ...modal, title: 'New group' }} />
        <Stack.Screen name="groups/[id]" options={pushed} />
        <Stack.Screen name="user/[id]" options={pushed} />
        <Stack.Screen name="settings/index" options={{ ...pushed, title: 'Settings' }} />
        <Stack.Screen name="settings/profile" options={{ ...pushed, title: 'Edit profile' }} />
        <Stack.Screen name="settings/notifications" options={{ ...pushed, title: 'Notifications' }} />
        <Stack.Screen name="settings/account" options={{ ...pushed, title: 'Sign-in & security' }} />
        <Stack.Screen name="settings/privacy" options={{ ...pushed, title: 'Privacy' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <MyProfileProvider>
          <ThemedStack />
        </MyProfileProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}
