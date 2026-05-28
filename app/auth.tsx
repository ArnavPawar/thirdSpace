import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';

export default function AuthScreen() {
  const { signIn, signUp, isDemoMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAuth = async (mode: 'sign-in' | 'sign-up') => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Missing Info', 'Enter an email and a password with at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }

      router.replace('/(tabs)/profile');
    } catch (error) {
      Alert.alert('Authentication Error', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 px-4 justify-center">
      <View className="bg-white rounded-2xl border border-gray-200 p-5">
        <Text className="text-3xl font-bold text-gray-900 mb-2">Welcome to Third Space</Text>
        <Text className="text-gray-600 mb-6">
          Sign in to save rankings, comment on reviews, and build your local space graph.
        </Text>

        {isDemoMode && (
          <View className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
            <Text className="text-blue-800 text-sm">
              Demo mode is active until Supabase credentials are configured.
            </Text>
          </View>
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          className="border border-gray-300 rounded-xl px-4 py-3 mb-3 text-base bg-white"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          className="border border-gray-300 rounded-xl px-4 py-3 mb-5 text-base bg-white"
        />

        <TouchableOpacity
          onPress={() => handleAuth('sign-in')}
          disabled={isSubmitting}
          className="bg-primary rounded-xl py-4 items-center mb-3"
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold">{isSubmitting ? 'Working...' : 'Sign In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAuth('sign-up')}
          disabled={isSubmitting}
          className="bg-gray-100 rounded-xl py-4 items-center"
          activeOpacity={0.8}
        >
          <Text className="text-gray-800 font-semibold">Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
