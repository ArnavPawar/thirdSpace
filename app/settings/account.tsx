import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { AtSign, KeyRound, LogIn, LogOut, Mail } from 'lucide-react-native';
import { GroupLabel, ListGroup, ListRow, PrimaryButton, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/myProfile';
import { useColors } from '@/lib/theme';

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email and password',
  apple: 'Apple',
  google: 'Google',
  facebook: 'Facebook',
};

const MIN_PASSWORD_LENGTH = 8;

export default function AccountSettingsScreen() {
  const colors = useColors();
  const { user, signOut, updatePassword } = useAuth();
  const { profile } = useMyProfile();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return (
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16 }}>
        <ListGroup footer="Sign in to keep your ratings, saved spots, groups, and profile picture across devices.">
          <ListRow icon={LogIn} iconColor={colors.primary} title="Sign in or create account" onPress={() => router.push('/auth' as never)} />
        </ListGroup>
      </ScrollView>
    );
  }

  const provider = String(user.app_metadata?.provider || 'email');
  const usesPassword = provider === 'email';
  const passwordError = password && password.length < MIN_PASSWORD_LENGTH
    ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : confirm && confirm !== password
      ? 'Passwords do not match.'
      : undefined;

  const handleChangePassword = async () => {
    if (passwordError || !password) return;
    setIsSaving(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      Alert.alert('Password updated', 'Use your new password next time you sign in.');
    } catch (error) {
      Alert.alert('Password not changed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          signOut()
            .then(() => router.replace('/(tabs)/profile'))
            .catch(() => Alert.alert('Could not sign out', 'Please try again.'));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <ListGroup title="Signed in as">
          <ListRow icon={Mail} title="Email" value={user.email ?? 'Not shared'} />
          <ListRow icon={AtSign} title="Username" value={profile?.username ? `@${profile.username}` : 'Not set'} onPress={() => router.push('/settings/profile' as never)} />
          <ListRow icon={KeyRound} title="Sign-in method" value={PROVIDER_LABELS[provider] ?? provider} />
        </ListGroup>

        {usesPassword && (
          <>
            <GroupLabel>Change password</GroupLabel>
            <TextField
              placeholder="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
            />
            <TextField
              placeholder="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              hint={passwordError}
            />
            <PrimaryButton
              label="Update password"
              tone="neutral"
              onPress={handleChangePassword}
              loading={isSaving}
              disabled={!password || !confirm || Boolean(passwordError)}
            />
          </>
        )}

        <ListGroup style={{ marginTop: 32 }}>
          <ListRow icon={LogOut} title="Sign out" destructive showChevron={false} onPress={confirmSignOut} />
        </ListGroup>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
