import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Check, CircleCheck, Lock, Sparkles, X } from 'lucide-react-native';
import { ProgressBar } from '@/components/ui';
import { colors } from '@/lib/theme';
import {
  VIBE_IDENTITIES,
  VIBE_IDENTITY_UNLOCK,
  VIBE_MILESTONES,
  type VibeIdentityState,
  type VibeProgress,
} from '@/types/vibes';

interface VibeSheetProps {
  visible: boolean;
  onClose: () => void;
  spacesRated: number;
  progress: VibeProgress;
  identity: VibeIdentityState;
  onSelectTitle: (title: string) => void;
}

export default function VibeSheet({ visible, onClose, spacesRated, progress, identity, onSelectTitle }: VibeSheetProps) {
  const options = identity.options.length > 0 ? identity.options : VIBE_IDENTITIES.slice(0, 4);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-50">
        <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
          <Text className="text-2xl font-extrabold text-ink">Your vibe</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className="w-9 h-9 rounded-full bg-slate-200 items-center justify-center">
            <X size={18} color={colors.body} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 48 }}>
          <View className="bg-white rounded-3xl border border-slate-200 p-5">
            <View className="flex-row items-center">
              <Sparkles size={16} color={colors.secret} />
              <Text className="text-xs font-bold text-secret uppercase tracking-wider ml-1.5">Vibe identity</Text>
            </View>

            {identity.isUnlocked ? (
              <>
                <Text className="text-lg font-bold text-ink mt-2">Pick the title that defines you</Text>
                <Text className="text-[13px] text-slate-500 mt-1">
                  It shows next to your name on every review. Options are based on the spots you rate.
                </Text>
                <View className="mt-4 gap-2">
                  {options.map((option) => {
                    const isSelected = identity.selected?.id === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => onSelectTitle(option.title)}
                        activeOpacity={0.8}
                        style={{ borderColor: isSelected ? option.color : '#e2e8f0', backgroundColor: isSelected ? `${option.color}12` : 'white' }}
                        className="rounded-2xl border-2 p-4 flex-row items-center"
                      >
                        <View style={{ backgroundColor: option.color }} className="w-10 h-10 rounded-xl items-center justify-center">
                          <Sparkles size={18} color="white" />
                        </View>
                        <View className="flex-1 mx-3">
                          <View className="flex-row items-center">
                            <Text className="font-bold text-ink text-[15px]">{option.title}</Text>
                            {identity.suggested?.id === option.id && (
                              <View className="ml-2 bg-slate-100 rounded-full px-2 py-0.5">
                                <Text className="text-[10px] font-bold text-slate-500">BEST MATCH</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-xs text-slate-500 mt-0.5">{option.tagline}</Text>
                        </View>
                        {isSelected && <Check size={20} color={option.color} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text className="text-lg font-bold text-ink mt-2">
                  Unlocks at {VIBE_IDENTITY_UNLOCK} spots
                </Text>
                <Text className="text-[13px] text-slate-500 mt-1">
                  Rate {VIBE_IDENTITY_UNLOCK - spacesRated} more to claim a title like Late Night Viber, Work Junkie, or Party Animal.
                </Text>
                <View className="mt-3">
                  <ProgressBar progress={spacesRated / VIBE_IDENTITY_UNLOCK} color={colors.secret} />
                </View>
                {identity.suggested && (
                  <View
                    style={{ backgroundColor: `${identity.suggested.color}12` }}
                    className="mt-4 rounded-2xl p-4 flex-row items-center"
                  >
                    <Lock size={16} color={identity.suggested.color} />
                    <Text className="text-[13px] text-slate-600 ml-2 flex-1">
                      You're trending toward <Text style={{ color: identity.suggested.color }} className="font-bold">{identity.suggested.title}</Text>
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          <Text className="text-[17px] font-bold text-ink mt-7 mb-3">Milestones & perks</Text>
          {VIBE_MILESTONES.filter((milestone) => milestone.threshold > 0).map((milestone) => {
            const isAchieved = spacesRated >= milestone.threshold;
            const isNext = progress.next?.threshold === milestone.threshold;
            return (
              <View
                key={milestone.name}
                className={`bg-white rounded-2xl p-4 mb-2.5 border ${isNext ? 'border-secret' : 'border-slate-200'}`}
              >
                <View className="flex-row items-center">
                  <View
                    style={{ backgroundColor: isAchieved ? milestone.ringColor : '#f1f5f9' }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                  >
                    {isAchieved ? <Check size={18} color="white" /> : <Lock size={16} color={colors.subtle} />}
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className={`font-bold text-[15px] ${isAchieved ? 'text-ink' : 'text-slate-500'}`}>{milestone.name}</Text>
                    <Text className="text-xs text-slate-400">
                      {isAchieved
                        ? `Unlocked at ${milestone.threshold} ${milestone.threshold === 1 ? 'spot' : 'spots'}`
                        : `${milestone.threshold - spacesRated} more to go`}
                    </Text>
                  </View>
                  {isNext && (
                    <View className="bg-secret/10 rounded-full px-2.5 py-1">
                      <Text className="text-[11px] font-bold text-secret">NEXT</Text>
                    </View>
                  )}
                </View>
                <View className="mt-3 pl-[52px]">
                  {milestone.perks.map((perk) => (
                    <View key={perk} className="flex-row items-center mb-1">
                      <CircleCheck size={13} color={isAchieved ? colors.success : '#cbd5e1'} />
                      <Text className={`text-[13px] ml-1.5 flex-1 ${isAchieved ? 'text-slate-700' : 'text-slate-400'}`}>{perk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
