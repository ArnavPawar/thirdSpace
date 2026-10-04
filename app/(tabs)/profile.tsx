import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftRight,
  ChevronRight,
  Heart,
  KeyRound,
  LogIn,
  MapPin,
  Medal,
  Save,
  Settings,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react-native';
import SpaceCard from '@/components/SpaceCard';
import VibeSheet from '@/components/VibeSheet';
import { Avatar, EmptyState, IconButton, ProgressBar, ScorePill, ScreenHeader, SegmentedControl, VibeTitleChip } from '@/components/ui';
import { demoUserLabel, useAuth } from '@/lib/auth';
import {
  getProfile,
  listIncomingSecretRequests,
  listSecretSpots,
  listSocialProfiles,
  listUserRankings,
  listUserRatingHistory,
  respondToSecretRequest,
  setVibeTitle,
  toggleFavorite,
  toggleFollow,
  updateProfile,
} from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { CATEGORY_META, colors } from '@/lib/theme';
import type {
  CategoryPurpose,
  Profile,
  ProfileWithStats,
  RatingHistoryEntry,
  SecretSpotPreview,
  SecretSpotRequest,
  SpaceWithAttributes,
  UserRanking,
} from '@/types/space';
import { getVibeIdentityState, getVibeProgress } from '@/types/vibes';

type RankingWithSpace = UserRanking & { space: SpaceWithAttributes };
type ProfileTab = 'rankings' | 'saved' | 'secrets';

export default function ProfileScreen() {
  const { userId, user, isDemoMode, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [rankings, setRankings] = useState<RankingWithSpace[]>([]);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [secretSpots, setSecretSpots] = useState<SecretSpotPreview[]>([]);
  const [secretRequests, setSecretRequests] = useState<SecretSpotRequest[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('rankings');
  const [selectedPurpose, setSelectedPurpose] = useState<CategoryPurpose | 'All'>('All');
  const [socialModalType, setSocialModalType] = useState<'followers' | 'following' | null>(null);
  const [socialProfiles, setSocialProfiles] = useState<Profile[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ full_name: '', username: '', bio: '', location: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const [profileResult, rankingResult, historyResult, secretResult, requestResult] = await Promise.all([
        getProfile(userId),
        listUserRankings(userId),
        listUserRatingHistory(userId),
        listSecretSpots(userId),
        listIncomingSecretRequests(userId),
      ]);
      setProfile(profileResult);
      setRankings(rankingResult);
      setHistory(historyResult);
      setSecretSpots(secretResult);
      setSecretRequests(requestResult);
      setProfileDraft({
        full_name: profileResult.full_name || '',
        username: profileResult.username || '',
        bio: profileResult.bio || '',
        location: profileResult.location || '',
      });
    } catch {
      Alert.alert('Profile Error', 'Could not load your profile.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const spacesRated = profile?.stats.spaces_rated || 0;
  const progress = useMemo(() => getVibeProgress(spacesRated), [spacesRated]);
  const identity = useMemo(
    () => getVibeIdentityState(history, spacesRated, profile?.vibe_title),
    [history, profile?.vibe_title, spacesRated]
  );

  const purposeOptions = useMemo(() => Array.from(
    new Set(rankings.map((ranking) => ranking.space.primary_purpose).filter(Boolean))
  ) as CategoryPurpose[], [rankings]);

  const listedRankings = (activeTab === 'saved' ? rankings.filter((ranking) => ranking.is_favorite) : rankings)
    .filter((ranking) => selectedPurpose === 'All' || ranking.space.primary_purpose === selectedPurpose);

  const ownedSecrets = secretSpots.filter((spot) => spot.access === 'owner');
  const unlockedSecrets = secretSpots.filter((spot) => spot.access === 'unlocked');
  const secretSlots = progress.current.secretSlots;

  const openSocialModal = async (type: 'followers' | 'following') => {
    setSocialModalType(type);
    setSocialProfiles([]);
    try {
      setSocialProfiles(await listSocialProfiles(type, userId));
    } catch {
      Alert.alert('Social Error', 'Could not load profiles.');
    }
  };

  const handleToggleFollow = async (targetUserId: string) => {
    try {
      const isFollowing = await toggleFollow(userId, targetUserId);
      setSocialProfiles((profiles) => profiles.map((item) =>
        item.user_id === targetUserId ? { ...item, is_following: isFollowing } : item
      ));
    } catch {
      Alert.alert('Follow Error', 'Could not update follow state.');
    }
  };

  const handleToggleFavorite = async (space: SpaceWithAttributes) => {
    setRankings((items) => items.map((item) => item.space_id === space.id ? { ...item, is_favorite: !item.is_favorite } : item));
    try {
      await toggleFavorite(userId, space);
    } catch {
      loadProfile();
      Alert.alert('Save Error', 'Could not update saved spots.');
    }
  };

  const handleSaveProfile = async () => {
    try {
      setProfile(await updateProfile(userId, profileDraft));
      setShowSettings(false);
    } catch {
      Alert.alert('Profile Error', 'Could not save profile changes.');
    }
  };

  const handleSelectTitle = async (title: string) => {
    setProfile((current) => current ? { ...current, vibe_title: title } : current);
    try {
      await setVibeTitle(userId, title);
    } catch {
      Alert.alert('Vibe Error', 'Could not save your vibe title.');
    }
  };

  const handleRespond = async (request: SecretSpotRequest, accept: boolean) => {
    setSecretRequests((items) => items.filter((item) => item.id !== request.id));
    try {
      await respondToSecretRequest(userId, request, accept);
      if (accept) loadProfile();
    } catch {
      loadProfile();
      Alert.alert('Request Error', 'Could not respond to this request.');
    }
  };

  if (isLoading || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const displayName = profile.full_name || demoUserLabel;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(); }} tintColor={colors.primary} />}
      >
        <ScreenHeader
          title="Profile"
          right={<IconButton icon={Settings} onPress={() => setShowSettings(true)} accessibilityLabel="Edit profile" />}
        />

        <View className="mx-4 bg-white rounded-3xl border border-slate-200 p-5">
          <View className="flex-row items-center">
            <Avatar name={displayName} size={72} ringColor={progress.current.ringColor} />
            <View className="flex-1 ml-4">
              <Text className="text-xl font-extrabold text-ink">{displayName}</Text>
              <Text className="text-slate-500">@{profile.username || 'thirdspace_user'}</Text>
              {profile.location && (
                <View className="flex-row items-center mt-1">
                  <MapPin size={12} color={colors.subtle} />
                  <Text className="text-[13px] text-slate-400 ml-1">{profile.location}</Text>
                </View>
              )}
            </View>
          </View>

          {identity.selected ? (
            <TouchableOpacity onPress={() => setShowVibeSheet(true)} activeOpacity={0.8} className="mt-4">
              <VibeTitleChip title={identity.selected.title} size="md" />
            </TouchableOpacity>
          ) : null}

          {profile.bio && <Text className="text-[15px] text-slate-700 leading-[21px] mt-3">{profile.bio}</Text>}

          <View className="flex-row mt-5 pt-4 border-t border-slate-100">
            {[
              { label: 'Spots', value: profile.stats.spaces_rated },
              { label: 'Reviews', value: profile.stats.reviews_written },
              { label: 'Followers', value: profile.stats.followers, onPress: () => openSocialModal('followers') },
              { label: 'Following', value: profile.stats.following, onPress: () => openSocialModal('following') },
            ].map((stat) => (
              <TouchableOpacity
                key={stat.label}
                disabled={!stat.onPress}
                onPress={stat.onPress}
                activeOpacity={0.7}
                className="flex-1 items-center"
              >
                <Text className="text-xl font-extrabold text-ink">{stat.value}</Text>
                <Text className="text-xs text-slate-500 mt-0.5">{stat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isDemoMode && (
          <TouchableOpacity
            onPress={() => router.push('/auth' as never)}
            activeOpacity={0.8}
            className="mx-4 mt-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex-row items-center"
          >
            <LogIn size={16} color={colors.primary} />
            <Text className="text-[13px] text-primary font-medium flex-1 ml-2">
              You're exploring demo data. Sign in to save your spots.
            </Text>
            <ChevronRight size={16} color={colors.primary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => setShowVibeSheet(true)}
          activeOpacity={0.85}
          className="mx-4 mt-3 bg-ink rounded-3xl p-5"
        >
          <View className="flex-row items-center">
            <View style={{ backgroundColor: progress.current.ringColor }} className="w-11 h-11 rounded-2xl items-center justify-center">
              <Medal size={22} color="white" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vibe level</Text>
              <Text className="text-lg font-extrabold text-white">{progress.current.name}</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-slate-300 font-semibold text-sm mr-1">Perks</Text>
              <ChevronRight size={16} color="#cbd5e1" />
            </View>
          </View>
          {progress.next ? (
            <>
              <View className="mt-4">
                <ProgressBar progress={progress.progress} color={progress.next.ringColor} height={6} />
              </View>
              <Text className="text-[13px] text-slate-300 mt-2">
                <Text className="font-bold text-white">{progress.remaining} more {progress.remaining === 1 ? 'spot' : 'spots'}</Text>
                {' '}to {progress.next.name}: {progress.next.perks[0]}
              </Text>
            </>
          ) : (
            <Text className="text-[13px] text-slate-300 mt-3">You've unlocked every milestone. Legend status.</Text>
          )}
        </TouchableOpacity>

        <View className="mx-4 mt-6">
          <SegmentedControl
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setSelectedPurpose('All');
            }}
            options={[
              { value: 'rankings', label: `Ranked (${rankings.length})`, icon: TrendingUp },
              { value: 'saved', label: 'Saved', icon: Heart },
              { value: 'secrets', label: secretRequests.length > 0 ? `Secret (${secretRequests.length})` : 'Secret', icon: KeyRound },
            ]}
          />
        </View>

        <View className="px-4 pt-4">
          {activeTab !== 'secrets' ? (
            <>
              {purposeOptions.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-4">
                  {(['All', ...purposeOptions] as (CategoryPurpose | 'All')[]).map((purpose) => (
                    <TouchableOpacity
                      key={purpose}
                      onPress={() => setSelectedPurpose(purpose)}
                      className={`px-3.5 h-8 rounded-full items-center justify-center ${selectedPurpose === purpose ? 'bg-ink' : 'bg-white border border-slate-200'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-[13px] font-semibold ${selectedPurpose === purpose ? 'text-white' : 'text-slate-600'}`}>
                        {purpose}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {listedRankings.length === 0 ? (
                <EmptyState
                  icon={activeTab === 'saved' ? Heart : TrendingUp}
                  title={activeTab === 'saved' ? 'Nothing saved yet' : 'No ranked spots yet'}
                  body={activeTab === 'saved' ? 'Tap the heart on any spot to keep it here.' : 'Every spot you rate lands on your personal ranking.'}
                  actionLabel={activeTab === 'saved' ? 'Explore the map' : 'Rate a spot'}
                  onAction={() => router.push((activeTab === 'saved' ? '/map' : '/rank') as never)}
                />
              ) : listedRankings.map((ranking, index) => (
                <View key={ranking.id} className="bg-white rounded-2xl border border-slate-200 mb-2.5 overflow-hidden">
                  <View className="flex-row items-center">
                    <Text className="w-9 text-center text-lg font-extrabold text-slate-300 ml-1">
                      {activeTab === 'rankings' ? index + 1 : ''}
                    </Text>
                    <View className="flex-1">
                      <SpaceCard
                        space={ranking.space}
                        compact
                        bordered={false}
                        onPress={() => router.push(`/space/${ranking.space.id}` as never)}
                        accessory={
                          <View className="flex-row items-center">
                            {ranking.space.attributes && <ScorePill score={ranking.space.attributes.overall_score} size="sm" />}
                            <TouchableOpacity
                              onPress={() => handleToggleFavorite(ranking.space)}
                              accessibilityLabel={ranking.is_favorite ? 'Remove from saved' : 'Save spot'}
                              className="ml-2 w-9 h-9 items-center justify-center"
                            >
                              <Heart size={18} color={ranking.is_favorite ? colors.like : '#cbd5e1'} fill={ranking.is_favorite ? colors.like : 'transparent'} />
                            </TouchableOpacity>
                          </View>
                        }
                      />
                    </View>
                  </View>
                  {ranking.notes && (
                    <Text className="text-[13px] text-slate-500 italic px-4 pb-3 -mt-1 ml-9">"{ranking.notes}"</Text>
                  )}
                </View>
              ))}
            </>
          ) : (
            <>
              {secretRequests.length > 0 && (
                <View className="mb-5">
                  <Text className="text-[17px] font-bold text-ink mb-3">Waiting on you</Text>
                  {secretRequests.map((request) => {
                    const requesterName = getDisplayName(request.requester);
                    return (
                      <View key={request.id} className="bg-white rounded-2xl border-2 border-secret/30 p-4 mb-2.5">
                        <View className="flex-row items-center">
                          <Avatar name={requesterName} size={36} />
                          <View className="flex-1 ml-3">
                            <Text className="text-[15px] text-ink">
                              <Text className="font-bold">{requesterName}</Text>
                              {request.kind === 'trade' ? ' wants to trade' : ' wants in'}
                            </Text>
                            <Text className="text-xs text-slate-500">for {request.space_name || 'your secret spot'}</Text>
                          </View>
                          {request.kind === 'trade' && <ArrowLeftRight size={18} color={colors.secret} />}
                        </View>
                        {request.message && (
                          <Text className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-xl px-3 py-2">"{request.message}"</Text>
                        )}
                        {request.kind === 'trade' && (
                          <Text className="text-[13px] text-slate-600 mt-3">
                            In exchange you'd unlock their secret{' '}
                            <Text className="font-bold">
                              {request.offered_space_category ? CATEGORY_META[request.offered_space_category].short.toLowerCase() : ''}
                            </Text>{' '}spot.
                          </Text>
                        )}
                        <View className="flex-row gap-2 mt-4">
                          <TouchableOpacity
                            onPress={() => handleRespond(request, false)}
                            className="flex-1 h-10 rounded-xl bg-slate-100 items-center justify-center"
                            activeOpacity={0.8}
                          >
                            <Text className="font-semibold text-slate-700">Decline</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleRespond(request, true)}
                            className="flex-1 h-10 rounded-xl bg-secret items-center justify-center"
                            activeOpacity={0.8}
                          >
                            <Text className="font-semibold text-white">{request.kind === 'trade' ? 'Accept trade' : 'Let them in'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-[17px] font-bold text-ink">Your secret spots</Text>
                <Text className="text-[13px] text-slate-500">
                  {ownedSecrets.length} of {Number.isFinite(secretSlots) ? secretSlots : 'unlimited'} slots
                </Text>
              </View>
              {ownedSecrets.length === 0 ? (
                <EmptyState
                  icon={KeyRound}
                  title="No secret spots yet"
                  body="Rate a place and turn on Gatekeeper mode. Only people you let in will see it."
                  actionLabel="Create one"
                  onAction={() => router.push('/rank' as never)}
                />
              ) : ownedSecrets.map((spot) => spot.space && (
                <View key={spot.id} className="mb-2.5">
                  <SpaceCard space={spot.space} compact onPress={() => router.push(`/space/${spot.id}` as never)} />
                </View>
              ))}

              <Text className="text-[17px] font-bold text-ink mt-5 mb-3">Unlocked for you</Text>
              {unlockedSecrets.length === 0 ? (
                <Text className="text-sm text-slate-500 mb-3">Nothing yet. Ask or trade for spots on the map.</Text>
              ) : unlockedSecrets.map((spot) => spot.space && (
                <View key={spot.id} className="mb-2.5">
                  <SpaceCard
                    space={spot.space}
                    compact
                    onPress={() => router.push(`/space/${spot.id}` as never)}
                    accessory={<Text className="text-xs text-slate-400">from {getDisplayName(spot.owner).split(' ')[0]}</Text>}
                  />
                </View>
              ))}

              <TouchableOpacity
                onPress={() => router.push({ pathname: '/map', params: { mode: 'secret' } } as never)}
                activeOpacity={0.8}
                className="mt-2 h-12 rounded-2xl border-2 border-dashed border-secret/40 flex-row items-center justify-center"
              >
                <KeyRound size={16} color={colors.secret} />
                <Text className="text-secret font-bold ml-2">Find secret spots on the map</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <VibeSheet
        visible={showVibeSheet}
        onClose={() => setShowVibeSheet(false)}
        spacesRated={spacesRated}
        progress={progress}
        identity={identity}
        onSelectTitle={handleSelectTitle}
      />

      <Modal visible={socialModalType !== null} transparent animationType="slide" onRequestClose={() => setSocialModalType(null)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setSocialModalType(null)} />
        <View className="bg-white rounded-t-[32px] px-5 pt-3 pb-10 max-h-[70%]">
          <View className="w-10 h-1.5 bg-slate-200 rounded-full self-center mb-4" />
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-extrabold text-ink">
              {socialModalType === 'followers' ? 'Followers' : 'Following'}
            </Text>
            <TouchableOpacity onPress={() => setSocialModalType(null)} accessibilityLabel="Close">
              <X size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            {socialProfiles.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-ink font-semibold mb-1">
                  {socialModalType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </Text>
                <Text className="text-slate-500 text-center text-sm">
                  {socialModalType === 'followers'
                    ? 'People who follow you will show up here.'
                    : 'Follow people from the feed to see them here.'}
                </Text>
              </View>
            ) : socialProfiles.map((item) => (
              <View key={item.id} className="flex-row items-center mb-4">
                <TouchableOpacity
                  onPress={() => {
                    setSocialModalType(null);
                    openProfile(item.user_id, userId);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`View ${getDisplayName(item)}'s profile`}
                  className="flex-1 flex-row items-center"
                >
                  <Avatar name={getDisplayName(item)} size={44} />
                  <View className="flex-1 ml-3">
                    <Text className="font-bold text-ink">{getDisplayName(item)}</Text>
                    <View className="flex-row items-center mt-0.5">
                      <Text className="text-xs text-slate-500 mr-2">@{item.username}</Text>
                      <VibeTitleChip title={item.vibe_title} />
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleToggleFollow(item.user_id)}
                  className={`px-3 h-8 rounded-full flex-row items-center ${item.is_following ? 'bg-slate-100' : 'bg-primary'}`}
                  activeOpacity={0.7}
                >
                  {item.is_following ? <UserCheck size={14} color={colors.muted} /> : <UserPlus size={14} color="white" />}
                  <Text className={`ml-1 text-xs font-semibold ${item.is_following ? 'text-slate-600' : 'text-white'}`}>
                    {item.is_following ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <View className="flex-1 bg-slate-50">
          <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
            <Text className="text-2xl font-extrabold text-ink">Edit profile</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)} accessibilityLabel="Close" className="w-9 h-9 rounded-full bg-slate-200 items-center justify-center">
              <X size={18} color={colors.body} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
            {([
              { field: 'full_name', label: 'Name', placeholder: 'Your name' },
              { field: 'username', label: 'Username', placeholder: 'username' },
              { field: 'location', label: 'Home area', placeholder: 'e.g. Arlington, VA' },
              { field: 'bio', label: 'Bio', placeholder: 'What kind of spots are you into?' },
            ] as const).map(({ field, label, placeholder }) => (
              <View key={field} className="mb-4">
                <Text className="text-[13px] font-semibold text-slate-500 mb-1.5">{label}</Text>
                <TextInput
                  value={profileDraft[field]}
                  onChangeText={(value) => setProfileDraft((current) => ({ ...current, [field]: value }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.subtle}
                  multiline={field === 'bio'}
                  autoCapitalize={field === 'username' ? 'none' : 'sentences'}
                  className={`bg-white border border-slate-200 rounded-2xl px-4 text-base text-ink ${field === 'bio' ? 'py-3 min-h-[88px]' : 'h-12'}`}
                  textAlignVertical={field === 'bio' ? 'top' : 'center'}
                />
              </View>
            ))}

            <TouchableOpacity onPress={handleSaveProfile} className="bg-primary rounded-2xl h-[52px] items-center flex-row justify-center mt-2" activeOpacity={0.85}>
              <Save size={18} color="white" />
              <Text className="text-white font-bold ml-2 text-base">Save changes</Text>
            </TouchableOpacity>

            {user ? (
              <TouchableOpacity onPress={() => { setShowSettings(false); signOut(); }} className="h-12 items-center justify-center mt-3">
                <Text className="text-rose-600 font-semibold">Sign out</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => { setShowSettings(false); router.push('/auth' as never); }}
                className="h-12 items-center justify-center mt-3"
              >
                <Text className="text-primary font-semibold">Sign in or create account</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
