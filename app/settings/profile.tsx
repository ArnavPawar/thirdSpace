import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, Check, ImageIcon, Trash2 } from 'lucide-react-native';
import { pickSquarePhoto } from '@/components/PhotoPickerRow';
import { Avatar, ListGroup, ListRow, PrimaryButton, Sheet, TextField } from '@/components/ui';
import { demoUserLabel, useAuth } from '@/lib/auth';
import { AVATAR_PRESETS, parseAvatar, presetAvatarValue } from '@/lib/avatars';
import { uploadAvatar } from '@/lib/data';
import { useMyProfile } from '@/lib/myProfile';
import { useColors } from '@/lib/theme';

type Draft = { full_name: string; username: string; bio: string; location: string };

const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;

export default function EditProfileScreen() {
  const colors = useColors();
  const { userId } = useAuth();
  const { profile, save } = useMyProfile();
  const [draft, setDraft] = useState<Draft>({ full_name: '', username: '', bio: '', location: '' });
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDraft({
      full_name: profile.full_name || '',
      username: profile.username || '',
      bio: profile.bio || '',
      location: profile.location || '',
    });
  }, [profile]);

  if (!profile) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const displayName = draft.full_name || profile.full_name || demoUserLabel;
  const current = parseAvatar(profile.avatar_url);
  const usernameChanged = draft.username.trim() !== (profile.username || '');
  const username = usernameChanged ? draft.username.trim().toLowerCase() : profile.username || '';
  const usernameError = usernameChanged && username && !USERNAME_PATTERN.test(username)
    ? 'Use 3 to 30 lowercase letters, numbers, dots, or underscores.'
    : undefined;

  const setAvatar = async (value: string) => {
    setIsUpdatingPhoto(true);
    try {
      await save({ avatar_url: value });
    } catch {
      Alert.alert('Photo not saved', 'Could not update your profile picture. Please try again.');
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const choosePhoto = async (source: 'library' | 'camera') => {
    setShowPicker(false);
    const photo = await pickSquarePhoto(source).catch(() => null);
    if (!photo) return;
    setIsUpdatingPhoto(true);
    try {
      await save({ avatar_url: await uploadAvatar(userId, photo) });
    } catch {
      Alert.alert('Photo not saved', 'Could not upload that picture. If this keeps happening, run supabase/avatars.sql.');
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (usernameError) return;
    setIsSaving(true);
    try {
      await save({
        full_name: draft.full_name.trim(),
        username,
        bio: draft.bio.trim(),
        location: draft.location.trim(),
      });
      router.back();
    } catch {
      Alert.alert('Profile not saved', 'Could not save your changes. That username may already be taken.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className="items-center mt-2 mb-7">
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            <Avatar name={displayName} uri={profile.avatar_url} size={96} />
            {isUpdatingPhoto && (
              <View className="absolute inset-0 rounded-full bg-black/40 items-center justify-center">
                <ActivityIndicator color="white" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPicker(true)} hitSlop={8} className="mt-3">
            <Text className="text-primary font-semibold text-[15px]">
              {current.kind === 'none' ? 'Add a photo' : 'Change photo'}
            </Text>
          </TouchableOpacity>
        </View>

        <TextField
          label="Name"
          value={draft.full_name}
          onChangeText={(full_name) => setDraft((value) => ({ ...value, full_name }))}
          placeholder="Your name"
          autoCapitalize="words"
          textContentType="name"
        />
        <TextField
          label="Username"
          value={draft.username}
          onChangeText={(next) => setDraft((value) => ({ ...value, username: next }))}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          hint={usernameError ?? 'People can find and mention you with this.'}
        />
        <TextField
          label="Home area"
          value={draft.location}
          onChangeText={(location) => setDraft((value) => ({ ...value, location }))}
          placeholder="e.g. Arlington, VA"
          autoCapitalize="words"
        />
        <TextField
          label="Bio"
          value={draft.bio}
          onChangeText={(bio) => setDraft((value) => ({ ...value, bio }))}
          placeholder="What kind of spots are you into?"
          multiline
          maxLength={160}
          hint={`${draft.bio.length}/160`}
        />

        <View className="mt-2">
          <PrimaryButton label="Save" onPress={handleSave} loading={isSaving} disabled={Boolean(usernameError)} />
        </View>
      </ScrollView>

      <Sheet visible={showPicker} onClose={() => setShowPicker(false)} title="Profile picture" variant="bottom">
        <ListGroup>
          <ListRow icon={ImageIcon} title="Choose from library" onPress={() => choosePhoto('library')} showChevron={false} />
          {Platform.OS !== 'web' && (
            <ListRow icon={Camera} title="Take photo" onPress={() => choosePhoto('camera')} showChevron={false} />
          )}
          {current.kind !== 'none' && (
            <ListRow
              icon={Trash2}
              title="Remove photo"
              destructive
              showChevron={false}
              onPress={() => {
                setShowPicker(false);
                setAvatar('');
              }}
            />
          )}
        </ListGroup>

        <Text className="text-[13px] font-medium text-muted px-1 mb-3">Or pick an icon</Text>
        <View className="flex-row flex-wrap -mx-1.5">
          {AVATAR_PRESETS.map((preset) => {
            const isSelected = current.kind === 'preset' && current.preset.id === preset.id;
            const Icon = preset.icon;
            return (
              <View key={preset.id} className="w-1/5 px-1.5 mb-3 items-center">
                <TouchableOpacity
                  onPress={() => {
                    setShowPicker(false);
                    setAvatar(presetAvatarValue(preset.id));
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${preset.label} icon`}
                  style={{ borderColor: isSelected ? colors.ink : 'transparent' }}
                  className="rounded-full border-2 p-0.5"
                >
                  <View style={{ backgroundColor: preset.color }} className="w-14 h-14 rounded-full items-center justify-center">
                    <Icon size={26} color="white" strokeWidth={1.75} />
                  </View>
                  {isSelected && (
                    <View className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-ink items-center justify-center border-2 border-surface">
                      <Check size={10} color={colors.canvas} strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
