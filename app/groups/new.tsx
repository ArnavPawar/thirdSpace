import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Globe, Lock } from 'lucide-react-native';
import { PrimaryButton, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createGroup } from '@/lib/data';
import { requireSignedIn } from '@/lib/links';
import { colors } from '@/lib/theme';
import type { GroupVisibility } from '@/types/space';

export default function NewGroupScreen() {
  const { user, userId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const publish = async () => {
    if (!requireSignedIn(Boolean(user), '/groups/new', 'Sign in to create a group.')) return;
    setIsSubmitting(true);
    try {
      const group = await createGroup(userId, {
        name,
        description: description.trim() || undefined,
        visibility,
      });
      router.replace(`/groups/${group.id}` as never);
    } catch (error) {
      Alert.alert('Could not create group', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Company hangout, Arlington girls..."
            placeholderTextColor={colors.subtle}
            maxLength={60}
            className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] text-base text-ink"
          />

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">What is this for?</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Friday hangs, or what's happening around Arlington"
            placeholderTextColor={colors.subtle}
            multiline
            maxLength={280}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[96px] text-base text-ink"
          />

          <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">Who can join</Text>
          <SegmentedControl
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'private', label: 'Private', icon: Lock },
              { value: 'public', label: 'Public', icon: Globe },
            ]}
          />
          <Text className="text-[13px] text-slate-500 mt-2">
            {visibility === 'private'
              ? 'Hidden from search. People join with your link or an invite from a member.'
              : 'Anyone can find this group and join. Use the description to say who it is for.'}
          </Text>

          <View className="mt-6">
            <PrimaryButton label="Create group" onPress={publish} loading={isSubmitting} disabled={!name.trim()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
