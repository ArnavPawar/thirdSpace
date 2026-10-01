import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeftRight, Check, Clock, EyeOff, KeyRound, Lock, Send, X } from 'lucide-react-native';
import { Avatar, CategoryIcon, PrimaryButton, ScorePill, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { requestSecretSpot } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { SecretAccessStatus, SecretSpotPreview } from '@/types/space';

interface SecretSpotSheetProps {
  spot: SecretSpotPreview | null;
  mySecretSpots: SecretSpotPreview[];
  onClose: () => void;
  onAccessChange: (spotId: string, access: SecretAccessStatus) => void;
}

export default function SecretSpotSheet({ spot, mySecretSpots, onClose, onAccessChange }: SecretSpotSheetProps) {
  const { userId } = useAuth();
  const [mode, setMode] = useState<'request' | 'trade'>('request');
  const [message, setMessage] = useState('');
  const [offeredSpaceId, setOfferedSpaceId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setMode('request');
    setMessage('');
    setOfferedSpaceId(mySecretSpots[0]?.id || null);
  }, [spot?.id, mySecretSpots]);

  if (!spot) return null;

  const ownerName = getDisplayName(spot.owner);
  const meta = CATEGORY_META[spot.category];

  const handleSend = async () => {
    setIsSending(true);
    try {
      const access = await requestSecretSpot(userId, spot, {
        kind: mode,
        message,
        offeredSpaceId: mode === 'trade' ? offeredSpaceId || undefined : undefined,
      });
      onAccessChange(spot.id, access);

      if (access === 'unlocked') {
        Alert.alert('Trade accepted', `${ownerName} accepted your trade. The spot is now unlocked for you.`, [
          { text: 'Later', onPress: onClose },
          {
            text: 'Open spot',
            onPress: () => {
              onClose();
              router.push(`/space/${spot.id}` as never);
            },
          },
        ]);
      } else {
        Alert.alert('Request sent', `${ownerName} will get your request. You'll see the spot here once they let you in.`);
        onClose();
      }
    } catch (error) {
      Alert.alert('Could not send', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 bg-black/40" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] px-5 pt-3 pb-10">
          <View className="w-10 h-1.5 bg-slate-200 rounded-full self-center mb-4" />

          <View className="flex-row items-start">
            <View className="w-14 h-14 rounded-2xl bg-secret items-center justify-center">
              <Lock size={26} color="white" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-xs font-bold text-secret uppercase tracking-wider">Secret spot</Text>
              <Text className="text-xl font-extrabold text-ink mt-0.5">
                A hidden {meta.short.toLowerCase()} spot
              </Text>
              <Text className="text-sm text-slate-500 mt-0.5">{spot.primary_purpose || meta.blurb}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1" accessibilityLabel="Close">
              <X size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View className="bg-slate-50 rounded-2xl p-4 mt-4">
            <View className="flex-row items-center">
              <Avatar name={ownerName} size={32} />
              <Text className="flex-1 ml-2 text-sm text-slate-600">
                Gatekept by <Text className="font-bold text-ink">{ownerName}</Text>
              </Text>
              {spot.overall_score !== undefined && <ScorePill score={spot.overall_score} size="sm" />}
            </View>
            {spot.area_hint && (
              <Text className="text-[15px] text-slate-700 mt-3 italic">"{spot.area_hint}"</Text>
            )}
            <View className="flex-row items-center mt-3">
              <EyeOff size={14} color={colors.subtle} />
              <Text className="text-xs text-slate-400 ml-1.5 flex-1">
                Name and exact location stay hidden until {ownerName.split(' ')[0]} lets you in.
              </Text>
            </View>
          </View>

          {spot.access === 'pending' ? (
            <View className="mt-5 bg-amber-50 rounded-2xl p-4 flex-row items-center">
              <Clock size={18} color={colors.warning} />
              <Text className="flex-1 ml-2 text-amber-800 font-medium">
                Request sent. Waiting on {ownerName.split(' ')[0]} to respond.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-[15px] font-bold text-ink mt-5 mb-2">How do you want in?</Text>
              <SegmentedControl
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'request', label: 'Ask nicely', icon: Send },
                  { value: 'trade', label: 'Trade a spot', icon: ArrowLeftRight },
                ]}
              />

              {mode === 'request' ? (
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder={`Say hi to ${ownerName.split(' ')[0]} (optional)`}
                  placeholderTextColor={colors.subtle}
                  multiline
                  maxLength={200}
                  className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 min-h-[72px] text-[15px] text-ink"
                  textAlignVertical="top"
                />
              ) : mySecretSpots.length === 0 ? (
                <View className="mt-3 bg-secret/5 border border-secret/20 rounded-2xl p-4">
                  <Text className="text-sm text-slate-700 leading-5">
                    You need a secret spot of your own to trade. Rate a place and turn on
                    <Text className="font-bold"> Gatekeeper mode</Text> to create one.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      router.push('/rank' as never);
                    }}
                    className="mt-3 self-start"
                  >
                    <Text className="text-secret font-bold">Create a secret spot</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="mt-3">
                  <Text className="text-xs text-slate-500 mb-2">
                    Offer one of yours. If {ownerName.split(' ')[0]} accepts, you both unlock each other's spot.
                  </Text>
                  {mySecretSpots.map((mine) => {
                    const isSelected = offeredSpaceId === mine.id;
                    return (
                      <TouchableOpacity
                        key={mine.id}
                        onPress={() => setOfferedSpaceId(mine.id)}
                        activeOpacity={0.8}
                        className={`flex-row items-center p-3 rounded-2xl border mb-2 ${
                          isSelected ? 'border-secret bg-secret/5' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <CategoryIcon category={mine.category} size={36} />
                        <Text className="flex-1 ml-3 font-semibold text-ink" numberOfLines={1}>
                          {mine.space?.name || 'Your secret spot'}
                        </Text>
                        {isSelected ? <Check size={18} color={colors.secret} /> : <KeyRound size={16} color={colors.subtle} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View className="mt-4">
                <PrimaryButton
                  tone="secret"
                  label={mode === 'request' ? 'Send request' : 'Offer trade'}
                  icon={mode === 'request' ? Send : ArrowLeftRight}
                  loading={isSending}
                  disabled={mode === 'trade' && !offeredSpaceId}
                  onPress={handleSend}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
