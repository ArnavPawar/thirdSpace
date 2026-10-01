import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/lib/theme';

// Android can deliver the OAuth redirect as a deep link instead of returning it to the auth session.
export default function AuthCallbackScreen() {
  useEffect(() => {
    router.replace('/(tabs)/profile');
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
