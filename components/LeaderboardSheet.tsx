import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { LEADERBOARDS } from '@/components/ProfileStatsCard';
import { Avatar, EmptyState, SegmentedControl, Sheet } from '@/components/ui';
import { cityLabel } from '@/lib/cities';
import { getLeaderboard } from '@/lib/data';
import { getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { useColors } from '@/lib/theme';
import type { Leaderboard, LeaderboardKind } from '@/types/space';

const scoreLabel = (kind: LeaderboardKind, score: number) =>
  kind === 'rankers' ? `${score} ${score === 1 ? 'spot' : 'spots'}` : `${score} hosted`;

/** The board behind a profile's rank badge. `ownerId` is whose city or friends the board is built around. */
export default function LeaderboardSheet({
  kind,
  onChangeKind,
  onClose,
  ownerId,
  ownerFirstName,
  viewerId,
}: {
  /** Null hides the sheet. */
  kind: LeaderboardKind | null;
  onChangeKind: (kind: LeaderboardKind) => void;
  onClose: () => void;
  ownerId: string;
  ownerFirstName: string;
  viewerId: string;
}) {
  const colors = useColors();
  const [boards, setBoards] = useState<Partial<Record<LeaderboardKind, Leaderboard>>>({});
  const [failed, setFailed] = useState(false);
  const [shownKind, setShownKind] = useState<LeaderboardKind>('rankers');
  const isOwn = ownerId === viewerId;

  useEffect(() => {
    setBoards({});
  }, [ownerId]);

  useEffect(() => {
    if (!kind) return;
    setShownKind(kind);
    setFailed(false);
    let cancelled = false;
    getLeaderboard(ownerId, kind)
      .then((next) => {
        if (!cancelled) setBoards((current) => ({ ...current, [kind]: next }));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, ownerId]);

  const board = boards[shownKind];
  const noun = LEADERBOARDS[shownKind].label.toLowerCase();
  const title = board ? (board.scope === 'city' && board.city ? cityLabel(board.city) : 'Among friends') : 'Leaderboard';
  const subtitle = board
    ? board.scope === 'city' && board.city
      ? `Most ${noun} in ${board.city}`
      : `Most ${noun}, compared with the people ${isOwn ? 'you follow' : `${ownerFirstName} follows`}`
    : undefined;
  const ownerOnBoard = board?.entries.some((entry) => entry.profile.user_id === ownerId);

  return (
    <Sheet visible={kind !== null} onClose={onClose} title={title} subtitle={subtitle}>
      <SegmentedControl
        value={shownKind}
        onChange={onChangeKind}
        options={(Object.keys(LEADERBOARDS) as LeaderboardKind[]).map((value) => ({
          value,
          label: LEADERBOARDS[value].label,
          icon: LEADERBOARDS[value].icon,
        }))}
      />

      <View className="mt-4">
        {!board ? (
          failed ? (
            <Text className="text-[15px] text-muted text-center py-12">Could not load the leaderboard.</Text>
          ) : (
            <ActivityIndicator color={colors.muted} style={{ paddingVertical: 48 }} />
          )
        ) : board.entries.length === 0 ? (
          <EmptyState
            icon={LEADERBOARDS[shownKind].icon}
            title="Nobody on this board yet"
            body={shownKind === 'rankers' ? 'Rate a spot to get on the board.' : 'Host a hangout to get on the board.'}
          />
        ) : (
          <View className="bg-surface rounded-2xl overflow-hidden">
            {board.entries.map((entry, index) => {
              const name = getDisplayName(entry.profile);
              const isOwner = entry.profile.user_id === ownerId;
              return (
                <View key={entry.profile.user_id}>
                  {index === 10 ? (
                    <Text className="text-[15px] text-subtle text-center py-1">···</Text>
                  ) : index > 0 ? (
                    <View className="h-px bg-line-soft ml-[92px]" />
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      openProfile(entry.profile.user_id, viewerId);
                    }}
                    activeOpacity={0.6}
                    accessibilityLabel={`Number ${entry.rank}, ${name}, ${scoreLabel(shownKind, entry.score)}`}
                    className={`flex-row items-center px-4 py-2.5 ${isOwner ? 'bg-primary-soft' : ''}`}
                  >
                    <Text
                      style={entry.rank === 1 ? { color: colors.warning } : undefined}
                      className="w-8 text-[15px] font-bold text-muted"
                    >
                      {entry.rank}
                    </Text>
                    <Avatar name={name} uri={entry.profile.avatar_url} size={40} />
                    <View className="flex-1 ml-3 pr-2">
                      <Text numberOfLines={1} className="text-[15px] font-semibold text-ink">{isOwner && isOwn ? 'You' : name}</Text>
                      {entry.profile.username ? (
                        <Text numberOfLines={1} className="text-[13px] text-muted">@{entry.profile.username}</Text>
                      ) : null}
                    </View>
                    <Text className="text-[15px] font-semibold text-ink">{scoreLabel(shownKind, entry.score)}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {board && board.entries.length > 0 && !ownerOnBoard && isOwn ? (
          <Text className="text-[13px] text-muted px-4 mt-2 leading-[18px]">
            {shownKind === 'rankers' ? 'Rate a spot to get on the board.' : 'Host a hangout to get on the board.'}
          </Text>
        ) : null}
        {board ? (
          <Text className="text-[13px] text-muted px-4 mt-2 leading-[18px]">
            {board.scope === 'friends'
              ? 'City rankings show up once enough people in a city are on the board.'
              : `${board.total} people on this board`}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
