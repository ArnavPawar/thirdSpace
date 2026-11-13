import React, { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeftRight, Check, Clock, EyeOff, KeyRound, Lock, Send } from 'lucide-react-native';
import { Avatar, CategoryIcon, CloseButton, PrimaryButton, ScorePill, SegmentedControl, Sheet } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { requestSecretSpot } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { CATEGORY_META, useColors, useColorSchemeName } from '@/lib/theme';
import type { SecretAccessStatus, SecretSpotPreview } from '@/types/space';

interface SecretSpotSheetProps {
  spot: SecretSpotPreview | null;
  mySecretSpots: SecretSpotPreview[];
  onClose: () => void;
  onAccessChange: (spotId: string, access: SecretAccessStatus) => void;
}

export default function SecretSpotSheet({ spot, mySecretSpots, onClose, onAccessChange }: SecretSpotSheetProps) {
  const colors = useColors();
  const scheme = useColorSchemeName();
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
    <Sheet visible onClose={onClose} variant="bottom">
      <View className="flex-row items-start">
        <View className="w-12 h-12 rounded-xl bg-secret/10 items-center justify-center">
          <Lock size={22} color={colors.secret} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[13px] font-medium text-secret">Secret spot</Text>
          <Text className="text-[20px] font-bold text-ink tracking-tight mt-0.5">
            A hidden {meta.short.toLowerCase()} spot
          </Text>
          <Text className="text-[14px] text-muted mt-0.5">{spot.primary_purpose || meta.blurb}</Text>
        </View>
        <CloseButton onPress={onClose} />
      </View>

      <View className="bg-fill rounded-2xl p-4 mt-4">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              onClose();
              openProfile(spot.owner.user_id, userId);
            }}
            accessibilityLabel={`View ${ownerName}'s profile`}
            className="flex-1 flex-row items-center"
          >
            <Avatar name={ownerName} uri={spot.owner.avatar_url} size={32} />
            <Text className="flex-1 ml-2 text-[14px] text-body">
              Gatekept by <Text className="font-semibold text-ink">{ownerName}</Text>
            </Text>
          </TouchableOpacity>
          {spot.overall_score !== undefined && <ScorePill score={spot.overall_score} size="sm" />}
        </View>
        {spot.area_hint && (
          <Text className="text-[15px] text-ink mt-3 leading-[21px]">“{spot.area_hint}”</Text>
        )}
        <View className="flex-row items-center mt-3">
          <EyeOff size={14} color={colors.subtle} />
          <Text className="text-[13px] text-muted ml-1.5 flex-1">
            Name and exact location stay hidden until {ownerName.split(' ')[0]} lets you in.
          </Text>
        </View>
      </View>

      {spot.access === 'pending' ? (
        <View className="mt-5 bg-warning-soft rounded-2xl p-4 flex-row items-center">
          <Clock size={18} color={colors.warning} />
          <Text className="flex-1 ml-2 text-warning font-medium">
            Request sent. Waiting on {ownerName.split(' ')[0]} to respond.
          </Text>
        </View>
      ) : (
        <>
          <Text className="text-[15px] font-semibold text-ink mt-5 mb-2">How do you want in?</Text>
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
              keyboardAppearance={scheme}
              multiline
              maxLength={200}
              className="mt-3 bg-fill rounded-xl px-4 py-3 min-h-[80px] text-[15px] text-ink"
              textAlignVertical="top"
            />
          ) : mySecretSpots.length === 0 ? (
            <View className="mt-3 bg-secret/5 rounded-xl p-4">
              <Text className="text-[14px] text-body leading-5">
                You need a secret spot of your own to trade. Rate a place and turn on
                <Text className="font-semibold"> Gatekeeper mode</Text> to create one.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/rank' as never);
                }}
                className="mt-3 self-start"
              >
                <Text className="text-secret font-semibold">Create a secret spot</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mt-3">
              <Text className="text-[13px] text-muted mb-2">
                Offer one of yours. If {ownerName.split(' ')[0]} accepts, you both unlock each other's spot.
              </Text>
              {mySecretSpots.map((mine) => {
                const isSelected = offeredSpaceId === mine.id;
                return (
                  <TouchableOpacity
                    key={mine.id}
                    onPress={() => setOfferedSpaceId(mine.id)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    className={`flex-row items-center p-3 rounded-xl border mb-2 ${
                      isSelected ? 'border-secret bg-secret/5' : 'border-line bg-surface'
                    }`}
                  >
                    <CategoryIcon category={mine.category} size={36} />
                    <Text className="flex-1 ml-3 font-medium text-ink" numberOfLines={1}>
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
    </Sheet>
  );
}
