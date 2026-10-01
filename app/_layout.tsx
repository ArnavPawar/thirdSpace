import '../global.css';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="auth"
          options={{
            headerShown: true,
            presentation: 'modal',
            title: 'Sign In',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="space/[id]"
          options={{
            headerShown: true,
            title: '',
            headerBackTitle: 'Back',
            headerShadowVisible: false,
            headerTintColor: colors.ink,
            headerStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
