import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { ProgressBar, Sheet } from '@/components/ui';
import { useColors, withAlpha } from '@/lib/theme';
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
  const colors = useColors();
  const options = identity.options.length > 0 ? identity.options : VIBE_IDENTITIES.slice(0, 4);

  return (
    <Sheet visible={visible} onClose={onClose} title="Your vibe" subtitle={`${progress.current.name} · ${spacesRated} ${spacesRated === 1 ? 'spot' : 'spots'} rated`}>
      <Text className="text-[13px] font-medium text-muted px-1 mb-1.5">Title</Text>
      <View className="bg-surface rounded-2xl p-4">
        {identity.isUnlocked ? (
          <>
            <Text className="text-[16px] font-semibold text-ink">Pick the title that defines you</Text>
            <Text className="text-[14px] text-muted mt-1 leading-5">
              It shows next to your name on every review. Options are based on the spots you rate.
            </Text>
            <View className="mt-4 gap-2">
              {options.map((option) => {
                const isSelected = identity.selected?.id === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => onSelectTitle(option.title)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      borderColor: isSelected ? option.color : colors.line,
                      backgroundColor: isSelected ? withAlpha(option.color, 0.08) : 'transparent',
                    }}
                    className="rounded-xl border p-3 flex-row items-center"
                  >
                    <View style={{ backgroundColor: option.color }} className="w-2.5 h-2.5 rounded-full ml-1" />
                    <View className="flex-1 mx-3">
                      <View className="flex-row items-center">
                        <Text className="font-semibold text-ink text-[15px]">{option.title}</Text>
                        {identity.suggested?.id === option.id && (
                          <View className="ml-2 bg-fill rounded-full px-2 py-0.5">
                            <Text className="text-[11px] font-medium text-muted">Best match</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-[13px] text-muted mt-0.5">{option.tagline}</Text>
                    </View>
                    {isSelected && <Check size={18} color={option.color} strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text className="text-[16px] font-semibold text-ink">Unlocks at {VIBE_IDENTITY_UNLOCK} spots</Text>
            <Text className="text-[14px] text-muted mt-1 leading-5">
              Rate {VIBE_IDENTITY_UNLOCK - spacesRated} more to claim a title like Late Night Viber, Work Junkie, or Party Animal.
            </Text>
            <View className="mt-3">
              <ProgressBar progress={spacesRated / VIBE_IDENTITY_UNLOCK} color={colors.secret} />
            </View>
            {identity.suggested && (
              <View className="mt-4 rounded-xl bg-fill p-3 flex-row items-center">
                <Lock size={14} color={colors.muted} />
                <Text className="text-[14px] text-body ml-2 flex-1">
                  You're trending toward <Text style={{ color: identity.suggested.color }} className="font-semibold">{identity.suggested.title}</Text>
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      <Text className="text-[13px] font-medium text-muted px-1 mb-1.5 mt-6">Milestones & perks</Text>
      <View className="bg-surface rounded-2xl">
        {VIBE_MILESTONES.filter((milestone) => milestone.threshold > 0).map((milestone, index) => {
          const isAchieved = spacesRated >= milestone.threshold;
          const isNext = progress.next?.threshold === milestone.threshold;
          return (
            <View key={milestone.name}>
              {index > 0 && <View className="h-px bg-line-soft ml-[60px]" />}
              <View className="p-4 flex-row">
                <View
                  style={{ backgroundColor: isAchieved ? milestone.ringColor : colors.fill }}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  {isAchieved ? <Check size={16} color="white" strokeWidth={2.5} /> : <Lock size={14} color={colors.subtle} />}
                </View>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center">
                    <Text className={`font-semibold text-[15px] flex-1 ${isAchieved ? 'text-ink' : 'text-muted'}`}>{milestone.name}</Text>
                    {isNext && (
                      <View className="bg-secret/10 rounded-full px-2 py-0.5">
                        <Text className="text-[11px] font-semibold text-secret">Next</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[13px] text-subtle mt-0.5">
                    {isAchieved
                      ? `Unlocked at ${milestone.threshold} ${milestone.threshold === 1 ? 'spot' : 'spots'}`
                      : `${milestone.threshold - spacesRated} more to go`}
                  </Text>
                  <View className="mt-2 gap-1">
                    {milestone.perks.map((perk) => (
                      <Text key={perk} className={`text-[14px] leading-5 ${isAchieved ? 'text-body' : 'text-subtle'}`}>
                        {perk}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
