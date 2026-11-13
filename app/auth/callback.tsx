import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/lib/theme';

// Android can deliver the OAuth redirect as a deep link instead of returning it to the auth session.
export default function AuthCallbackScreen() {
  const colors = useColors();
  useEffect(() => {
    router.replace('/(tabs)/profile');
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}
