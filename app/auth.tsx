import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { PrimaryButton } from '@/components/ui';
import { completePasswordResetFromLink, isAppleSignInAvailable, useAuth, type OAuthProvider } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type PendingAction = 'sign-in' | 'sign-up' | 'reset' | 'paste' | 'apple' | OAuthProvider | null;

const PROVIDER_BUTTONS: { provider: OAuthProvider; label: string; mark: string; markColor: string; background: string; textColor: string; border?: string }[] = [
  { provider: 'google', label: 'Continue with Google', mark: 'G', markColor: '#4285F4', background: '#ffffff', textColor: colors.ink, border: '#e2e8f0' },
  { provider: 'facebook', label: 'Continue with Facebook', mark: 'f', markColor: '#ffffff', background: '#1877F2', textColor: '#ffffff' },
];

export default function AuthScreen() {
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const { signIn, signUp, requestPasswordReset, resendConfirmation, signInWithApple, signInWithProvider } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const finish = () => {
    const destination = Array.isArray(next) ? next[0] : next;
    if (destination && destination.startsWith('/') && !destination.startsWith('//') && !destination.includes('://')) {
      router.replace(destination as never);
      return;
    }
    router.replace('/(tabs)/profile');
  };

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
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (mode === 'sign-in' && /email not confirmed/i.test(message)) {
        Alert.alert(
          'Confirm your email',
          'This account has to be confirmed before the password will work. Send the confirmation email again?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Resend email',
              onPress: () => {
                resendConfirmation(email.trim())
                  .then(() => Alert.alert('Email sent', 'Open the confirmation link in that email, then come back and sign in.'))
                  .catch((resendError: unknown) => {
                    Alert.alert('Could not resend', resendError instanceof Error ? resendError.message : 'Please try again.');
                  });
              },
            },
          ],
        );
        return;
      }
      Alert.alert('Authentication Error', message);
    } finally {
      setPending(null);
    }
  };

  const handleForgotPassword = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Not configured', 'Add your Supabase URL and anon key to .env to enable sign-in.');
      return;
    }

    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      Alert.alert('Enter your email', 'Type the email for the account, then tap Forgot password.');
      return;
    }

    setPending('reset');
    try {
      await requestPasswordReset(trimmed);
      setResetSentTo(trimmed);
      setResetLink('');
      Alert.alert(
        'Check your email',
        `A reset link is on its way to ${trimmed}. Copy that link and paste it below. Tapping it in Mail tries to open the app and fails.`,
      );
    } catch (error) {
      Alert.alert('Could not send reset email', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handlePastedResetLink = async () => {
    if (!resetLink.trim()) {
      Alert.alert('Paste the link', 'Copy the reset link from the email and paste it here.');
      return;
    }

    setPending('paste');
    try {
      await completePasswordResetFromLink(resetLink);
      router.replace('/auth/reset' as never);
    } catch (error) {
      Alert.alert('Could not use that link', error instanceof Error ? error.message : 'Send a new reset email and paste the new link.');
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
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] mb-2 text-base text-ink"
          />
          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={pending !== null}
            accessibilityRole="button"
            className="self-end mb-5 py-2"
          >
            {pending === 'reset' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text className="text-primary font-semibold text-sm">Forgot password?</Text>
            )}
          </TouchableOpacity>

          {resetSentTo && (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
              <Text className="text-[15px] font-bold text-ink">Paste the reset link</Text>
              <Text className="text-[13px] text-slate-500 mt-1 mb-3 leading-5">
                Copy the link from the email to {resetSentTo}. Leave the link untapped. Opening it uses it up, and Mail cannot hand it to the app.
              </Text>
              <TextInput
                value={resetLink}
                onChangeText={setResetLink}
                placeholder="Paste the reset link"
                placeholderTextColor={colors.subtle}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 mb-3 text-[13px] text-ink min-h-[72px]"
              />
              <PrimaryButton
                label="Continue"
                onPress={handlePastedResetLink}
                loading={pending === 'paste'}
                disabled={pending !== null}
              />
            </View>
          )}

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
