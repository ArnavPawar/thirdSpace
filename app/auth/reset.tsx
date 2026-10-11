import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useURL } from 'expo-linking';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/ui';
import { preparePasswordReset, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type ResetStatus = 'working' | 'ready' | 'needs-link';

export default function ResetPasswordScreen() {
  const linkedUrl = useURL();
  const { updatePassword } = useAuth();
  const [status, setStatus] = useState<ResetStatus>('working');
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('Open the reset link from your email on this phone.');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const openedFrom = linkedUrl || await Linking.getInitialURL();
        const result = await preparePasswordReset(openedFrom);
        if (cancelled) return;
        setEmail(result.email);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : 'This reset link is invalid or expired.');
        setStatus('needs-link');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkedUrl]);

  const savePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Type the same password in both fields.');
      return;
    }

    setSaving(true);
    try {
      await updatePassword(password);
      router.replace('/(tabs)/profile' as never);
      Alert.alert('Password updated', 'You are signed in.');
    } catch (error) {
      Alert.alert('Could not update password', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {status === 'working' ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
            {status === 'needs-link' ? (
              <>
                <Text className="text-[32px] font-extrabold text-ink tracking-tight">Check your email</Text>
                <Text className="text-[15px] text-slate-500 mt-2 mb-8 leading-5">{message}</Text>
                <PrimaryButton label="Back to sign in" onPress={() => router.replace('/auth' as never)} />
              </>
            ) : (
              <>
                <Text className="text-[32px] font-extrabold text-ink tracking-tight">Choose a new password</Text>
                <Text className="text-[15px] text-slate-500 mt-2 mb-8 leading-5">
                  {email ? `This updates the password for ${email}.` : 'This updates the password for the account on this phone.'}
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New password (6+ characters)"
                  placeholderTextColor={colors.subtle}
                  secureTextEntry
                  autoComplete="new-password"
                  className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] mb-3 text-base text-ink"
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.subtle}
                  secureTextEntry
                  autoComplete="new-password"
                  className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] mb-5 text-base text-ink"
                />
                <PrimaryButton label="Update password" onPress={savePassword} loading={saving} disabled={saving} />
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
