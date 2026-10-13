import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Lock, MapPin, Plus, Users } from 'lucide-react-native';
import EventCard from '@/components/EventCard';
import FeedCard from '@/components/FeedCard';
import InviteSheet from '@/components/InviteSheet';
import { Avatar, EmptyState, PrimaryButton, SegmentedControl } from '@/components/ui';
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
import { colors } from '@/lib/theme';
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
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50 px-5 justify-center">
        <EmptyState icon={Lock} title="This group is private" body="You need an invite link or an invite from a member." />
      </SafeAreaView>
    );
  }

  const { group } = detail;
  const shareTarget = { ...group, invite_token: group.invite_token || token };
  const shareUrl = groupShareUrl(shareTarget);
  const canInvite = Boolean(group.viewer_role);

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-slate-50">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="flex-row items-center">
          <View className={`rounded-full px-2.5 py-1 ${group.visibility === 'private' ? 'bg-slate-200' : 'bg-primary/10'}`}>
            <Text className={`text-[12px] font-bold ${group.visibility === 'private' ? 'text-slate-600' : 'text-primary'}`}>
              {group.visibility === 'private' ? 'Private' : 'Public'}
            </Text>
          </View>
          <Text className="text-[13px] text-slate-500 ml-2">{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</Text>
        </View>
        <Text className="text-[32px] font-extrabold text-ink tracking-tight mt-2">{group.name}</Text>
        {group.description ? <Text className="text-[15px] text-slate-600 mt-2 leading-5">{group.description}</Text> : null}

        <View className="flex-row gap-2 mt-4">
          {group.viewer_role ? (
            <TouchableOpacity onPress={confirmLeave} disabled={isSaving} className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 items-center justify-center">
              <Text className="font-semibold text-ink">Leave</Text>
            </TouchableOpacity>
          ) : group.invite_status === 'pending' ? (
            <>
              <View className="flex-1">
                <PrimaryButton label="Accept" loading={isSaving} onPress={() => run(() => respondToGroupInvite(userId, group.id, 'accepted'))} />
              </View>
              <TouchableOpacity onPress={() => run(() => respondToGroupInvite(userId, group.id, 'declined'))} className="flex-1 h-12 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <Text className="font-semibold text-ink">Decline</Text>
              </TouchableOpacity>
            </>
          ) : group.visibility === 'public' || token ? (
            <View className="flex-1">
              <PrimaryButton label="Join" loading={isSaving} onPress={() => run(() => joinGroup(userId, group.id, token))} />
            </View>
          ) : null}
          {canInvite && (
            <TouchableOpacity onPress={openInvites} className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center">
              <Text className="font-semibold text-white">Invite</Text>
            </TouchableOpacity>
          )}
        </View>

        {!detail.content_visible ? (
          <View className="mt-6">
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
              <View className="mt-4">
                {detail.feed.length === 0 ? (
                  <EmptyState icon={Users} title="No posts yet" body="Reviews from members show up here." />
                ) : detail.feed.map((item) => (
                  <View key={item.id} className="mb-3">
                    <FeedCard item={item} />
                  </View>
                ))}
              </View>
            )}

            {tab === 'map' && (
              <View className="mt-4">
                {detail.spots.length === 0 ? (
                  <EmptyState icon={MapPin} title="No spots yet" body="Member reviews, hangouts, and saved places land on this map." />
                ) : (
                  <>
                    <View className="h-64 rounded-3xl overflow-hidden border border-slate-200">
                      <MapView
                        style={{ flex: 1 }}
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
                    {detail.spots.map((space) => (
                      <TouchableOpacity key={space.id} onPress={() => router.push(`/space/${space.id}` as never)} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mt-3">
                        <Text className="font-bold text-ink">{space.name}</Text>
                        <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>{space.address}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                {group.viewer_role && (
                  <TouchableOpacity onPress={openAddSpot} className="mt-3 h-12 rounded-2xl bg-white border border-slate-200 flex-row items-center justify-center">
                    <Plus size={16} color={colors.ink} />
                    <Text className="font-semibold text-ink ml-2">Save a spot</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {tab === 'events' && (
              <View className="mt-4">
                {detail.events.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No hangouts yet"
                    body="Post one to this group when you host it, instead of inviting each person."
                    actionLabel="Host an event"
                    onAction={() => router.push('/event/new' as never)}
                  />
                ) : detail.events.map((event, index) => (
                  <View key={event.id} className="mb-3">
                    <EventCard occurrence={occurrenceFor(detail, index)} />
                  </View>
                ))}
              </View>
            )}

            {tab === 'people' && (
              <View className="mt-4">
                {detail.members.map((member) => (
                  <View key={member.user_id} className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-3 mb-2">
                    <TouchableOpacity onPress={() => openProfile(member.user_id, userId)} className="flex-row items-center flex-1">
                      <Avatar name={getDisplayName(member.profile)} size={40} />
                      <View className="ml-3 flex-1">
                        <Text className="font-bold text-ink">{getDisplayName(member.profile)}</Text>
                        <Text className="text-[13px] text-slate-500">{member.role === 'owner' ? 'Owner' : 'Member'}</Text>
                      </View>
                    </TouchableOpacity>
                    {group.viewer_role === 'owner' && member.user_id !== userId && member.role !== 'owner' && (
                      <TouchableOpacity onPress={() => run(() => removeGroupMember(userId, group.id, member.user_id))}>
                        <Text className="text-rose-600 font-semibold text-[13px]">Remove</Text>
                      </TouchableOpacity>
                    )}
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

      <Modal visible={showSpots} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSpots(false)}>
        <SafeAreaView className="flex-1 bg-slate-50">
          <View className="px-5 pt-3 pb-4 flex-row items-center justify-between">
            <Text className="text-[22px] font-extrabold text-ink">Save a spot</Text>
            <TouchableOpacity onPress={() => setShowSpots(false)}><Text className="text-primary font-semibold">Done</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
            {rankings.length === 0 ? (
              <Text className="text-slate-500">Rate a place first, then you can pin it here.</Text>
            ) : rankings.map((space) => (
              <TouchableOpacity
                key={space.id}
                onPress={() => run(async () => {
                  await saveGroupSpot(userId, group.id, space.id);
                  setShowSpots(false);
                })}
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2"
              >
                <Text className="font-bold text-ink">{space.name}</Text>
                <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>{space.address}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
