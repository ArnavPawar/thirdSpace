import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, ChevronRight, Globe, Lock, MapPin, Plus, UserPlus, UsersRound } from 'lucide-react-native';
import EventCard from '@/components/EventCard';
import FeedCard from '@/components/FeedCard';
import InviteSheet from '@/components/InviteSheet';
import { Avatar, CategoryIcon, EmptyState, PersonRow, PrimaryButton, SegmentedControl, Sheet } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  getGroupDetail,
  joinGroup,
  leaveGroup,
  listOutgoingInvites,
  listSocialProfiles,
  listUserRankings,
  removeGroupMember,
  respondToGroupInvite,
  saveGroupSpot,
  sendGroupInvite,
} from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { copyInviteLink, groupShareUrl, openProfile, requireSignedIn, shareGroup } from '@/lib/links';
import { useColors, useColorSchemeName } from '@/lib/theme';
import type { CalendarOccurrence, GroupDetail, InviteStatus, Profile, SpaceWithAttributes } from '@/types/space';

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

type GroupTab = 'feed' | 'map' | 'events' | 'people';

function occurrenceFor(detail: GroupDetail, index: number): CalendarOccurrence {
  const event = detail.events[index];
  return {
    key: event.id,
    date: event.event_date || event.created_at.slice(0, 10),
    event,
    mention_count: event.mention_count || 1,
  };
}

export default function GroupDetailScreen() {
  const colors = useColors();
  const scheme = useColorSchemeName();
  const params = useLocalSearchParams<{ id: string; token?: string | string[] }>();
  const groupId = firstParam(params.id) || '';
  const token = firstParam(params.token);
  const { user, userId } = useAuth();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [tab, setTab] = useState<GroupTab>('feed');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSpots, setShowSpots] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [invited, setInvited] = useState<Record<string, InviteStatus>>({});
  const [inviteLoading, setInviteLoading] = useState(false);
  const [rankings, setRankings] = useState<SpaceWithAttributes[]>([]);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      setDetail(await getGroupDetail(groupId, userId, token));
    } catch {
      Alert.alert('Group', 'Could not load this group.');
    } finally {
      setIsLoading(false);
    }
  }, [groupId, token, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openInvites = async () => {
    if (!detail) return;
    setShowInvite(true);
    setInviteLoading(true);
    try {
      const [following, statuses] = await Promise.all([
        listSocialProfiles('following', userId),
        listOutgoingInvites('group', detail.group.id, userId),
      ]);
      const memberIds = new Set(detail.members.map((member) => member.user_id));
      setPeople(following.filter((person) => !memberIds.has(person.user_id)));
      setInvited(statuses);
    } catch (error) {
      Alert.alert('Invites', error instanceof Error ? error.message : 'Could not load people you follow.');
    } finally {
      setInviteLoading(false);
    }
  };

  const invitePerson = async (inviteeId: string) => {
    if (!detail) return;
    setInvited((current) => ({ ...current, [inviteeId]: 'pending' }));
    try {
      await sendGroupInvite(userId, detail.group.id, inviteeId);
    } catch (error) {
      setInvited((current) => {
        const next = { ...current };
        delete next[inviteeId];
        return next;
      });
      Alert.alert('Invite', error instanceof Error ? error.message : 'Could not send that invite.');
    }
  };

  const run = async (action: () => Promise<void>) => {
    if (!requireSignedIn(Boolean(user), `/groups/${groupId}`, 'Sign in to do that.')) return;
    setIsSaving(true);
    try {
      await action();
      await load();
    } catch (error) {
      Alert.alert('Group', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmLeave = () => {
    if (!detail) return;
    const soleOwner = detail.group.viewer_role === 'owner' && detail.members.length <= 1;
    Alert.alert(
      soleOwner ? 'Delete this group?' : 'Leave this group?',
      soleOwner ? 'You are the only member, so leaving deletes it.' : 'You can rejoin later if it is public, or with a new invite.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: soleOwner ? 'Delete' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await leaveGroup(userId, detail.group.id);
              router.back();
            } catch (error) {
              Alert.alert('Group', error instanceof Error ? error.message : 'Please try again.');
              setIsSaving(false);
            }
          },
        },
      ],
    );
  };

  const openAddSpot = async () => {
    setShowSpots(true);
    try {
      const saved = new Set((detail?.spots || []).map((space) => space.id));
      const rows = await listUserRankings(userId);
      setRankings(rows.map((row) => row.space).filter((space) => !saved.has(space.id)));
    } catch {
      setRankings([]);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas px-5 justify-center">
        <EmptyState icon={Lock} title="This group is private" body="You need an invite link or an invite from a member." />
      </SafeAreaView>
    );
  }

  const { group } = detail;
  const shareTarget = { ...group, invite_token: group.invite_token || token };
  const shareUrl = groupShareUrl(shareTarget);
  const canInvite = Boolean(group.viewer_role);

  const VisibilityIcon = group.visibility === 'private' ? Lock : Globe;
  const stats = [
    { label: group.member_count === 1 ? 'Member' : 'Members', value: group.member_count },
    ...(detail.content_visible
      ? [
        { label: detail.spots.length === 1 ? 'Spot' : 'Spots', value: detail.spots.length },
        { label: detail.events.length === 1 ? 'Hangout' : 'Hangouts', value: detail.events.length },
        { label: detail.feed.length === 1 ? 'Post' : 'Posts', value: detail.feed.length },
      ]
      : []),
  ];

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
        <View className="items-center pt-2 px-1">
          <Avatar name={group.name} size={88} />
          <Text className="text-[24px] font-bold text-ink tracking-tight mt-3 text-center">{group.name}</Text>
          <View className="flex-row items-center mt-1">
            <VisibilityIcon size={13} color={colors.muted} />
            <Text className="text-[15px] text-muted ml-1">{group.visibility === 'private' ? 'Private group' : 'Public group'}</Text>
          </View>
          {group.description ? (
            <Text className="text-[15px] text-body mt-3 leading-[22px] text-center max-w-[340px]">{group.description}</Text>
          ) : null}
        </View>

        <View className="flex-row mt-5">
          {stats.map((stat) => (
            <View key={stat.label} className="flex-1 items-center">
              <Text className="text-[17px] font-semibold text-ink">{stat.value}</Text>
              <Text className="text-[13px] text-muted mt-0.5">{stat.label}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row gap-2 mt-5">
          {group.viewer_role ? (
            <View className="flex-1">
              <PrimaryButton label="Leave" tone="neutral" size="md" disabled={isSaving} onPress={confirmLeave} />
            </View>
          ) : group.invite_status === 'pending' ? (
            <>
              <View className="flex-1">
                <PrimaryButton label="Accept" size="md" loading={isSaving} onPress={() => run(() => respondToGroupInvite(userId, group.id, 'accepted'))} />
              </View>
              <View className="flex-1">
                <PrimaryButton label="Decline" tone="neutral" size="md" onPress={() => run(() => respondToGroupInvite(userId, group.id, 'declined'))} />
              </View>
            </>
          ) : group.visibility === 'public' || token ? (
            <View className="flex-1">
              <PrimaryButton label="Join" size="md" loading={isSaving} onPress={() => run(() => joinGroup(userId, group.id, token))} />
            </View>
          ) : null}
          {canInvite && (
            <View className="flex-1">
              <PrimaryButton label="Invite" icon={UserPlus} size="md" onPress={openInvites} />
            </View>
          )}
        </View>

        {!detail.content_visible ? (
          <View className="mt-4">
            <EmptyState icon={Lock} title="Members only" body="Accept the invite to see the feed, map, and hangouts." />
          </View>
        ) : (
          <>
            <View className="mt-6">
              <SegmentedControl
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'feed', label: 'Feed' },
                  { value: 'map', label: 'Map' },
                  { value: 'events', label: 'Events' },
                  { value: 'people', label: 'People' },
                ]}
              />
            </View>

            {tab === 'feed' && (
              <View className="mt-4 gap-3">
                {detail.feed.length === 0 ? (
                  <EmptyState icon={UsersRound} title="No posts yet" body="Reviews show up here when someone tags this group." />
                ) : detail.feed.map((item) => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </View>
            )}

            {tab === 'map' && (
              <View className="mt-4">
                {detail.spots.length === 0 ? (
                  <EmptyState icon={MapPin} title="No spots yet" body="Tagged reviews, hangouts posted here, and saved places land on this map." />
                ) : (
                  <>
                    <View className="h-64 rounded-2xl overflow-hidden bg-surface">
                      <MapView
                        style={{ flex: 1 }}
                        userInterfaceStyle={scheme}
                        initialRegion={{
                          latitude: detail.spots[0].latitude,
                          longitude: detail.spots[0].longitude,
                          latitudeDelta: 0.08,
                          longitudeDelta: 0.08,
                        }}
                      >
                        {detail.spots.map((space) => (
                          <Marker
                            key={space.id}
                            coordinate={{ latitude: space.latitude, longitude: space.longitude }}
                            title={space.name}
                            onCalloutPress={() => router.push(`/space/${space.id}` as never)}
                          />
                        ))}
                      </MapView>
                    </View>
                    <View className="mt-3">
                      <SpotList spots={detail.spots} onPressSpot={(space) => router.push(`/space/${space.id}` as never)} />
                    </View>
                  </>
                )}
                {group.viewer_role && (
                  <View className="mt-3">
                    <PrimaryButton label="Save a spot" icon={Plus} tone="neutral" size="md" onPress={openAddSpot} />
                  </View>
                )}
              </View>
            )}

            {tab === 'events' && (
              <View className="mt-4 gap-3">
                {detail.events.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No hangouts yet"
                    body="Hangouts someone posts to this group show up here. A member's own night out does not."
                    actionLabel="Host an event"
                    onAction={() => router.push('/event/new' as never)}
                  />
                ) : detail.events.map((event, index) => (
                  <EventCard key={event.id} occurrence={occurrenceFor(detail, index)} />
                ))}
              </View>
            )}

            {tab === 'people' && (
              <View className="mt-4 bg-surface rounded-2xl px-4 py-1">
                {detail.members.map((member, index) => (
                  <View key={member.user_id}>
                    {index > 0 && <View className="h-px bg-line-soft ml-[56px]" />}
                    <PersonRow
                      name={getDisplayName(member.profile)}
                      avatarUrl={member.profile.avatar_url}
                      subtitle={member.role === 'owner' ? 'Owner' : 'Member'}
                      onPress={() => openProfile(member.user_id, userId)}
                      right={group.viewer_role === 'owner' && member.user_id !== userId && member.role !== 'owner' ? (
                        <TouchableOpacity
                          onPress={() => run(() => removeGroupMember(userId, group.id, member.user_id))}
                          hitSlop={8}
                          className="h-8 px-3 rounded-full bg-danger-soft items-center justify-center ml-2"
                        >
                          <Text className="text-danger font-semibold text-[13px]">Remove</Text>
                        </TouchableOpacity>
                      ) : undefined}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <InviteSheet
        visible={showInvite}
        title={`Invite to ${group.name}`}
        url={shareUrl}
        people={people}
        invited={invited}
        loading={inviteLoading}
        onClose={() => setShowInvite(false)}
        onCopy={() => copyInviteLink(shareUrl)}
        onShare={() => shareGroup({ ...group, invite_token: group.invite_token || token })}
        onInvite={invitePerson}
      />

      <Sheet
        visible={showSpots}
        onClose={() => setShowSpots(false)}
        title="Save a spot"
        subtitle={`Pin a place you've rated to ${group.name}.`}
      >
        {rankings.length === 0 ? (
          <Text className="text-[15px] text-muted">Rate a place first, then you can pin it here.</Text>
        ) : (
          <SpotList
            spots={rankings}
            onPressSpot={(space) => run(async () => {
              await saveGroupSpot(userId, group.id, space.id);
              setShowSpots(false);
            })}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}

function SpotList({ spots, onPressSpot }: { spots: SpaceWithAttributes[]; onPressSpot: (space: SpaceWithAttributes) => void }) {
  const colors = useColors();
  return (
    <View className="bg-surface rounded-2xl overflow-hidden">
      {spots.map((space, index) => (
        <View key={space.id}>
          {index > 0 && <View className="h-px bg-line-soft ml-[64px]" />}
          <TouchableOpacity onPress={() => onPressSpot(space)} activeOpacity={0.6} className="flex-row items-center px-4 py-3">
            <CategoryIcon category={space.category} size={36} />
            <View className="flex-1 mx-3">
              <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{space.name}</Text>
              <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{space.address}</Text>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
