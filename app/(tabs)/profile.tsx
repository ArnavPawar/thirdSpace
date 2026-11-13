import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
  MessageCircle,
  Settings,
  TrendingUp,
  UsersRound,
} from 'lucide-react-native';
import LeaderboardSheet from '@/components/LeaderboardSheet';
import ProfileStatsCard from '@/components/ProfileStatsCard';
import SpaceCard from '@/components/SpaceCard';
import VibeSheet from '@/components/VibeSheet';
import {
  Avatar,
  Chip,
  EmptyState,
  GroupLabel,
  IconButton,
  ListGroup,
  ListRow,
  PersonRow,
  PillButton,
  PrimaryButton,
  ProgressBar,
  ScorePill,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  VibeTitleChip,
} from '@/components/ui';
import { demoUserLabel, useAuth } from '@/lib/auth';
import {
  listIncomingInvites,
  listIncomingSecretRequests,
  listSecretSpots,
  listSocialProfiles,
  listUserRankings,
  listUserRatingHistory,
  respondToEventInvite,
  respondToGroupInvite,
  respondToSecretRequest,
  toggleFavorite,
  toggleFollow,
} from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { openEvent, openProfile } from '@/lib/links';
import { useMyProfile } from '@/lib/myProfile';
import { CATEGORY_META, useColors, withAlpha } from '@/lib/theme';
import type {
  CategoryPurpose,
  IncomingInvite,
  LeaderboardKind,
  Profile,
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
  const colors = useColors();
  const { userId, isDemoMode } = useAuth();
  const { profile, refresh, save } = useMyProfile();
  const [rankings, setRankings] = useState<RankingWithSpace[]>([]);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [secretSpots, setSecretSpots] = useState<SecretSpotPreview[]>([]);
  const [secretRequests, setSecretRequests] = useState<SecretSpotRequest[]>([]);
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('rankings');
  const [selectedPurpose, setSelectedPurpose] = useState<CategoryPurpose | 'All'>('All');
  const [socialModalType, setSocialModalType] = useState<'followers' | 'following' | null>(null);
  const [socialProfiles, setSocialProfiles] = useState<Profile[]>([]);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [boardKind, setBoardKind] = useState<LeaderboardKind | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const [profileResult, rankingResult, historyResult, secretResult, requestResult, inviteResult] = await Promise.all([
        refresh(),
        listUserRankings(userId),
        listUserRatingHistory(userId),
        listSecretSpots(userId),
        listIncomingSecretRequests(userId),
        listIncomingInvites(userId).catch(() => [] as IncomingInvite[]),
      ]);
      if (!profileResult) throw new Error('Profile missing');
      setRankings(rankingResult);
      setHistory(historyResult);
      setSecretSpots(secretResult);
      setSecretRequests(requestResult);
      setInvites(inviteResult);
    } catch {
      Alert.alert('Profile Error', 'Could not load your profile.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [refresh, userId]);

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

  const handleSelectTitle = async (title: string) => {
    try {
      await save({ vibe_title: title });
    } catch {
      Alert.alert('Vibe Error', 'Could not save your vibe title.');
    }
  };

  const handleInvite = async (invite: IncomingInvite, accept: boolean) => {
    setInvites((items) => items.filter((item) => item !== invite));
    try {
      if (invite.kind === 'group' && invite.group) {
        await respondToGroupInvite(userId, invite.group.id, accept ? 'accepted' : 'declined');
        if (accept) router.push(`/groups/${invite.group.id}` as never);
      } else if (invite.event) {
        await respondToEventInvite(userId, invite.event.id, accept ? 'accepted' : 'declined');
        if (accept) openEvent(invite.event.id, invite.event.visibility === 'private' ? invite.event.invite_token : undefined);
      }
    } catch {
      loadProfile();
      Alert.alert('Invite', 'Could not update that invite.');
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

  if ((isLoading && !profile) || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }

  const displayName = profile.full_name || demoUserLabel;
  const stats = [
    { label: 'Spots', value: profile.stats.spaces_rated },
    { label: 'Reviews', value: profile.stats.reviews_written },
    { label: 'Followers', value: profile.stats.followers, onPress: () => openSocialModal('followers') },
    { label: 'Following', value: profile.stats.following, onPress: () => openSocialModal('following') },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(); }} tintColor={colors.muted} />}
      >
        <ScreenHeader
          title="Profile"
          right={<IconButton icon={Settings} onPress={() => router.push('/settings' as never)} accessibilityLabel="Settings" />}
        />

        <View className="px-5">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => router.push('/settings/profile' as never)}
              activeOpacity={0.8}
              accessibilityLabel="Change profile picture"
            >
              <Avatar name={displayName} uri={profile.avatar_url} size={84} ringColor={progress.current.ringColor} />
            </TouchableOpacity>
            <View className="flex-1 flex-row justify-between ml-5">
              {stats.map((stat) => (
                <TouchableOpacity
                  key={stat.label}
                  disabled={!stat.onPress}
                  onPress={stat.onPress}
                  activeOpacity={0.6}
                  accessibilityRole={stat.onPress ? 'button' : undefined}
                  className="items-center"
                >
                  <Text className="text-[18px] font-semibold text-ink">{stat.value}</Text>
                  <Text className="text-[12px] text-muted mt-0.5">{stat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text className="text-[20px] font-bold text-ink tracking-tight mt-4">{displayName}</Text>
          <View className="flex-row items-center flex-wrap mt-0.5">
            <Text className="text-[14px] text-muted">@{profile.username || 'thirdspace_user'}</Text>
            {profile.location ? (
              <View className="flex-row items-center ml-2">
                <MapPin size={12} color={colors.subtle} />
                <Text className="text-[14px] text-muted ml-0.5">{profile.location}</Text>
              </View>
            ) : null}
          </View>
          {identity.selected ? (
            <TouchableOpacity onPress={() => setShowVibeSheet(true)} activeOpacity={0.7} className="mt-2.5 self-start">
              <VibeTitleChip title={identity.selected.title} size="md" />
            </TouchableOpacity>
          ) : null}
          {profile.bio ? <Text className="text-[15px] text-body leading-[21px] mt-2.5">{profile.bio}</Text> : null}

          <View className="flex-row gap-2 mt-4">
            <View className="flex-1">
              <PrimaryButton label="Edit profile" tone="neutral" size="md" onPress={() => router.push('/settings/profile' as never)} />
            </View>
            <IconButton icon={UsersRound} onPress={() => router.push('/groups' as never)} accessibilityLabel="Your groups" />
            <IconButton icon={MessageCircle} onPress={() => router.push('/chats' as never)} accessibilityLabel="Chats" />
          </View>
        </View>

        <View className="px-4 mt-6">
          {isDemoMode && (
            <ListGroup>
              <ListRow
                icon={LogIn}
                iconColor={colors.primary}
                title="Sign in to save your spots"
                subtitle="You're exploring demo data."
                onPress={() => router.push('/auth' as never)}
              />
            </ListGroup>
          )}

          {invites.length > 0 && (
            <View className="mb-6">
              <GroupLabel>{`Invites · ${invites.length}`}</GroupLabel>
              <View className="bg-surface rounded-2xl">
                {invites.map((invite, index) => {
                  const label = invite.kind === 'group'
                    ? invite.group?.name || 'A group'
                    : invite.event?.title || 'A hangout';
                  const from = getDisplayName(invite.invited_by);
                  return (
                    <View key={`${invite.kind}-${invite.kind === 'group' ? invite.group?.id : invite.event?.id}`}>
                      {index > 0 && <View className="h-px bg-line-soft ml-4" />}
                      <View className="px-4 py-3 flex-row items-center">
                        <View className="flex-1 pr-3">
                          <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>{label}</Text>
                          <Text className="text-[13px] text-muted mt-0.5" numberOfLines={2}>
                            {invite.invited_by?.user_id ? (
                              <Text className="font-medium text-body" onPress={() => openProfile(invite.invited_by!.user_id, userId)}>{from}</Text>
                            ) : from}
                            {' '}invited you to this {invite.kind === 'group' ? 'group' : 'hangout'}
                          </Text>
                        </View>
                        <View className="flex-row gap-1.5">
                          <PillButton label="Decline" active onPress={() => handleInvite(invite, false)} />
                          <PillButton label={invite.kind === 'group' ? 'Join' : 'Open'} onPress={() => handleInvite(invite, true)} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={() => setShowVibeSheet(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Vibe level ${progress.current.name}. See perks`}
            className="bg-surface rounded-2xl p-4"
          >
            <View className="flex-row items-center">
              <View style={{ backgroundColor: withAlpha(progress.current.ringColor, 0.16) }} className="w-10 h-10 rounded-xl items-center justify-center">
                <Medal size={20} color={progress.current.ringColor} />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-[13px] text-muted">Vibe level</Text>
                <Text className="text-[16px] font-semibold text-ink">{progress.current.name}</Text>
              </View>
              <Text className="text-[14px] text-muted mr-0.5">Perks</Text>
              <ChevronRight size={16} color={colors.faint} />
            </View>
            {progress.next ? (
              <>
                <View className="mt-3.5">
                  <ProgressBar progress={progress.progress} color={progress.next.ringColor} />
                </View>
                <Text className="text-[13px] text-muted mt-2 leading-[18px]">
                  <Text className="font-semibold text-ink">{progress.remaining} more {progress.remaining === 1 ? 'spot' : 'spots'}</Text>
                  {' '}to {progress.next.name}: {progress.next.perks[0]}
                </Text>
              </>
            ) : (
              <Text className="text-[13px] text-muted mt-3">You've unlocked every milestone. Legend status.</Text>
            )}
          </TouchableOpacity>

          <View className="mt-3">
            <ProfileStatsCard stats={profile.stats} onOpenBoard={setBoardKind} />
          </View>
        </View>

        <View className="mx-4 mt-6">
          <SegmentedControl
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setSelectedPurpose('All');
            }}
            options={[
              { value: 'rankings', label: `Ranked · ${rankings.length}`, icon: TrendingUp },
              { value: 'saved', label: 'Saved', icon: Heart },
              { value: 'secrets', label: secretRequests.length > 0 ? `Secret · ${secretRequests.length}` : 'Secret', icon: KeyRound },
            ]}
          />
        </View>

        <View className="px-4 pt-4">
          {activeTab !== 'secrets' ? (
            <>
              {purposeOptions.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3 -mx-4 px-4">
                  {(['All', ...purposeOptions] as (CategoryPurpose | 'All')[]).map((purpose) => (
                    <Chip
                      key={purpose}
                      label={purpose}
                      selected={selectedPurpose === purpose}
                      onPress={() => setSelectedPurpose(purpose)}
                    />
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
              ) : (
                <View className="bg-surface rounded-2xl overflow-hidden">
                  {listedRankings.map((ranking, index) => (
                    <View key={ranking.id}>
                      {index > 0 && <View className="h-px bg-line-soft ml-[52px]" />}
                      <View className="flex-row items-center">
                        <Text className="w-10 text-center text-[15px] font-semibold text-subtle ml-1">
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
                                  hitSlop={6}
                                  className="ml-1 w-9 h-9 items-center justify-center"
                                >
                                  <Heart size={18} color={ranking.is_favorite ? colors.like : colors.faint} fill={ranking.is_favorite ? colors.like : 'transparent'} />
                                </TouchableOpacity>
                              </View>
                            }
                          />
                        </View>
                      </View>
                      {ranking.notes && (
                        <Text className="text-[13px] text-muted px-4 pb-3 -mt-1 ml-10">“{ranking.notes}”</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {secretRequests.length > 0 && (
                <View className="mb-6">
                  <GroupLabel>Waiting on you</GroupLabel>
                  {secretRequests.map((request) => {
                    const requesterName = getDisplayName(request.requester);
                    return (
                      <View key={request.id} className="bg-surface rounded-2xl p-4 mb-2">
                        <View className="flex-row items-center">
                          <TouchableOpacity
                            onPress={() => openProfile(request.requester_id, userId)}
                            accessibilityLabel={`View ${requesterName}'s profile`}
                            className="flex-row items-center flex-1"
                          >
                            <Avatar name={requesterName} uri={request.requester?.avatar_url} size={36} />
                            <View className="flex-1 ml-3">
                              <Text className="text-[15px] text-ink">
                                <Text className="font-semibold">{requesterName}</Text>
                                {request.kind === 'trade' ? ' wants to trade' : ' wants in'}
                              </Text>
                              <Text className="text-[13px] text-muted">for {request.space_name || 'your secret spot'}</Text>
                            </View>
                          </TouchableOpacity>
                          {request.kind === 'trade' && <ArrowLeftRight size={18} color={colors.secret} />}
                        </View>
                        {request.message && (
                          <Text className="text-[14px] text-body mt-3 bg-fill rounded-xl px-3 py-2">“{request.message}”</Text>
                        )}
                        {request.kind === 'trade' && (
                          <Text className="text-[13px] text-muted mt-3">
                            In exchange you'd unlock their secret{' '}
                            <Text className="font-semibold text-body">
                              {request.offered_space_category ? CATEGORY_META[request.offered_space_category].short.toLowerCase() : ''}
                            </Text>{' '}spot.
                          </Text>
                        )}
                        <View className="flex-row gap-2 mt-4">
                          <View className="flex-1">
                            <PrimaryButton label="Decline" tone="neutral" size="md" onPress={() => handleRespond(request, false)} />
                          </View>
                          <View className="flex-1">
                            <PrimaryButton
                              label={request.kind === 'trade' ? 'Accept trade' : 'Let them in'}
                              tone="secret"
                              size="md"
                              onPress={() => handleRespond(request, true)}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View className="flex-row items-center justify-between px-4 mb-1.5">
                <Text className="text-[13px] font-medium text-muted">Your secret spots</Text>
                <Text className="text-[13px] text-subtle">
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
              ) : (
                <View className="bg-surface rounded-2xl overflow-hidden mb-6">
                  {ownedSecrets.map((spot, index) => spot.space && (
                    <View key={spot.id}>
                      {index > 0 && <View className="h-px bg-line-soft ml-[64px]" />}
                      <SpaceCard space={spot.space} compact bordered={false} onPress={() => router.push(`/space/${spot.id}` as never)} />
                    </View>
                  ))}
                </View>
              )}

              <GroupLabel>Unlocked for you</GroupLabel>
              {unlockedSecrets.length === 0 ? (
                <Text className="text-[14px] text-muted px-4 mb-4">Nothing yet. Ask or trade for spots on the map.</Text>
              ) : (
                <View className="bg-surface rounded-2xl overflow-hidden mb-4">
                  {unlockedSecrets.map((spot, index) => spot.space && (
                    <View key={spot.id}>
                      {index > 0 && <View className="h-px bg-line-soft ml-[64px]" />}
                      <SpaceCard
                        space={spot.space}
                        compact
                        bordered={false}
                        onPress={() => router.push(`/space/${spot.id}` as never)}
                        accessory={(
                          <TouchableOpacity onPress={() => openProfile(spot.owner.user_id, userId)} accessibilityLabel={`View ${getDisplayName(spot.owner)}'s profile`}>
                            <Text className="text-[13px] text-muted">from <Text className="font-medium text-ink">{getDisplayName(spot.owner).split(' ')[0]}</Text></Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                onPress={() => router.push({ pathname: '/map', params: { mode: 'secret' } } as never)}
                activeOpacity={0.7}
                className="mt-2 h-12 rounded-xl bg-secret/10 flex-row items-center justify-center"
              >
                <KeyRound size={16} color={colors.secret} />
                <Text className="text-secret font-semibold ml-2 text-[15px]">Find secret spots on the map</Text>
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

      <LeaderboardSheet
        kind={boardKind}
        onChangeKind={setBoardKind}
        onClose={() => setBoardKind(null)}
        ownerId={userId}
        ownerFirstName={displayName.split(' ')[0]}
        viewerId={userId}
      />

      <Sheet
        visible={socialModalType !== null}
        onClose={() => setSocialModalType(null)}
        title={socialModalType === 'followers' ? 'Followers' : 'Following'}
      >
        {socialProfiles.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={socialModalType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            body={socialModalType === 'followers'
              ? 'People who follow you will show up here.'
              : 'Follow people from the feed to see them here.'}
          />
        ) : (
          <View className="bg-surface rounded-2xl px-4 py-1">
            {socialProfiles.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View className="h-px bg-line-soft ml-[56px]" />}
                <PersonRow
                  name={getDisplayName(item)}
                  avatarUrl={item.avatar_url}
                  onPress={() => {
                    setSocialModalType(null);
                    openProfile(item.user_id, userId);
                  }}
                  subtitle={(
                    <View className="flex-row items-center mt-0.5">
                      <Text className="text-[13px] text-muted mr-2">@{item.username}</Text>
                      <VibeTitleChip title={item.vibe_title} />
                    </View>
                  )}
                  right={(
                    <PillButton
                      label={item.is_following ? 'Following' : 'Follow'}
                      active={item.is_following}
                      onPress={() => handleToggleFollow(item.user_id)}
                    />
                  )}
                />
              </View>
            ))}
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
