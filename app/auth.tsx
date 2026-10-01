import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { PrimaryButton } from '@/components/ui';
import { isAppleSignInAvailable, useAuth, type OAuthProvider } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type PendingAction = 'sign-in' | 'sign-up' | 'apple' | OAuthProvider | null;

const PROVIDER_BUTTONS: { provider: OAuthProvider; label: string; mark: string; markColor: string; background: string; textColor: string; border?: string }[] = [
  { provider: 'google', label: 'Continue with Google', mark: 'G', markColor: '#4285F4', background: '#ffffff', textColor: colors.ink, border: '#e2e8f0' },
  { provider: 'facebook', label: 'Continue with Facebook', mark: 'f', markColor: '#ffffff', background: '#1877F2', textColor: '#ffffff' },
];

export default function AuthScreen() {
  const { signIn, signUp, signInWithApple, signInWithProvider } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const finish = () => router.replace('/(tabs)/profile');

  const runSocial = async (action: 'apple' | OAuthProvider) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Not configured', 'Add your Supabase URL and anon key to .env to enable sign-in.');
      return;
    }

    setPending(action);
    try {
      const didSignIn = action === 'apple' ? await signInWithApple() : await signInWithProvider(action);
      if (didSignIn) finish();
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleEmailAuth = async (mode: 'sign-in' | 'sign-up') => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Missing Info', 'Enter an email and a password with at least 6 characters.');
      return;
    }

    setPending(mode);
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      finish();
    } catch (error) {
      Alert.alert('Authentication Error', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPending(null);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[32px] font-extrabold text-ink tracking-tight">Find your third space</Text>
          <Text className="text-[15px] text-slate-500 mt-2 mb-8 leading-5">
            Sign in to save your rankings, keep secret spots, and earn vibe perks.
          </Text>

          {!isSupabaseConfigured && (
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-5">
              <Text className="text-amber-800 text-[13px]">
                Supabase isn't configured yet, so the app is running on demo data.
              </Text>
            </View>
          )}

          <View className="gap-3">
            {appleAvailable && (
              <View pointerEvents={pending ? 'none' : 'auto'} style={{ opacity: pending && pending !== 'apple' ? 0.5 : 1 }}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={16}
                  style={{ height: 52, width: '100%' }}
                  onPress={() => runSocial('apple')}
                />
              </View>
            )}

            {PROVIDER_BUTTONS.map((button) => (
              <TouchableOpacity
                key={button.provider}
                onPress={() => runSocial(button.provider)}
                disabled={pending !== null}
                activeOpacity={0.85}
                style={{
                  backgroundColor: button.background,
                  borderColor: button.border || button.background,
                  opacity: pending && pending !== button.provider ? 0.5 : 1,
                }}
                className="h-[52px] rounded-2xl border flex-row items-center justify-center"
              >
                {pending === button.provider ? (
                  <ActivityIndicator color={button.textColor} />
                ) : (
                  <>
                    <Text style={{ color: button.markColor }} className="text-xl font-extrabold mr-2.5">{button.mark}</Text>
                    <Text style={{ color: button.textColor }} className="font-semibold text-base">{button.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row items-center my-6">
            <View className="flex-1 h-px bg-slate-200" />
            <Text className="mx-3 text-xs font-semibold text-slate-400">OR USE EMAIL</Text>
            <View className="flex-1 h-px bg-slate-200" />
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] mb-3 text-base text-ink"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (6+ characters)"
            placeholderTextColor={colors.subtle}
            secureTextEntry
            autoComplete="password"
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] mb-5 text-base text-ink"
          />

          <PrimaryButton
            label="Sign in"
            onPress={() => handleEmailAuth('sign-in')}
            loading={pending === 'sign-in'}
            disabled={pending !== null}
          />
          <View className="h-3" />
          <PrimaryButton
            tone="neutral"
            label="Create account"
            onPress={() => handleEmailAuth('sign-up')}
            loading={pending === 'sign-up'}
            disabled={pending !== null}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
