import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Globe, Lock } from 'lucide-react-native';
import { PrimaryButton, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createGroup } from '@/lib/data';
import { requireSignedIn } from '@/lib/links';
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
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Company hangout, Arlington girls..."
            maxLength={60}
          />

          <TextField
            label="What is this for?"
            value={description}
            onChangeText={setDescription}
            placeholder="Friday hangs, or what's happening around Arlington"
            multiline
            maxLength={280}
          />

          <Text className="text-[13px] font-medium text-muted mb-1.5 ml-1 mt-2">Who can join</Text>
          <SegmentedControl
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'private', label: 'Private', icon: Lock },
              { value: 'public', label: 'Public', icon: Globe },
            ]}
          />
          <Text className="text-[13px] text-muted mt-2 ml-1 leading-[18px]">
            {visibility === 'private'
              ? 'Hidden from search. People join with your link or an invite from a member.'
              : 'Anyone can find this group and join. Use the description to say who it is for.'}
          </Text>

          <View className="mt-8">
            <PrimaryButton label="Create group" onPress={publish} loading={isSubmitting} disabled={!name.trim()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
