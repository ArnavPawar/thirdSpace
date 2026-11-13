import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUp, Heart, ImagePlus, KeyRound, MessageCircle, X } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import PhotoGrid from '@/components/PhotoGrid';
import { PhotoThumbnails, pickPhotos } from '@/components/PhotoPickerRow';
import PhotoViewer from '@/components/PhotoViewer';
import { Avatar, CategoryIcon, PillButton, ScorePill, VibeTitleChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addComment, listComments, removeReviewCompanion, toggleLike } from '@/lib/data';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import { openGroup, openProfile } from '@/lib/links';
import { CATEGORY_META, useColors, useColorSchemeName } from '@/lib/theme';
import { MAX_PHOTOS_PER_POST, type FeedActivity, type LocalPhoto, type ReviewComment, type ReviewPhoto } from '@/types/space';

interface FeedCardProps {
  item: FeedActivity;
  onToggleFollow?: (userId: string) => void;
  showSpace?: boolean;
  linkAuthor?: boolean;
}

export default function FeedCard({ item, onToggleFollow, showSpace = true, linkAuthor = true }: FeedCardProps) {
  const colors = useColors();
  const scheme = useColorSchemeName();
  const { userId } = useAuth();
  const [liked, setLiked] = useState(Boolean(item.current_user_liked));
  const [likes, setLikes] = useState(item.likes_count || 0);
  const [commentCount, setCommentCount] = useState(item.comments_count || 0);
  const [comments, setComments] = useState<ReviewComment[] | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftPhotos, setDraftPhotos] = useState<LocalPhoto[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [viewer, setViewer] = useState<{ photos: ReviewPhoto[]; index: number } | null>(null);
  const [removedCompanionIds, setRemovedCompanionIds] = useState<string[]>([]);

  const name = getDisplayName(item.profile);
  const companions = (item.companions || []).filter((profile) => !removedCompanionIds.includes(profile.user_id));
  const groups = item.groups || [];

  const removeCompanion = async (companionId: string) => {
    setRemovedCompanionIds((current) => [...current, companionId]);
    try {
      await removeReviewCompanion(userId, item.id);
    } catch (error) {
      setRemovedCompanionIds((current) => current.filter((id) => id !== companionId));
      Alert.alert('Could not remove you', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  const isOwnReview = item.user_id === userId;

  const handleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    try {
      await toggleLike(userId, item.id);
    } catch {
      setLiked(!nextLiked);
      setLikes((count) => Math.max(0, count + (nextLiked ? -1 : 1)));
      Alert.alert('Like Error', 'Could not update like.');
    }
  };

  const handleToggleComments = async () => {
    const isOpening = !isCommentsOpen;
    setIsCommentsOpen(isOpening);
    if (isOpening && comments === null) {
      try {
        setComments(await listComments(item.id));
      } catch {
        Alert.alert('Comments Error', 'Could not load comments.');
      }
    }
  };

  const handleAddCommentPhotos = async () => {
    const picked = await pickPhotos(MAX_PHOTOS_PER_POST - draftPhotos.length);
    if (picked.length > 0) setDraftPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS_PER_POST));
  };

  const handleAddComment = async () => {
    const body = draft.trim();
    if (!body || isPosting) return;
    setIsPosting(true);
    try {
      const { failedPhotos } = await addComment(userId, item, body, draftPhotos);
      setDraft('');
      setDraftPhotos([]);
      setComments(await listComments(item.id));
      setCommentCount((count) => count + 1);
      if (failedPhotos > 0) {
        Alert.alert('Some photos did not upload', 'Your comment was posted, but not every photo could be saved.');
      }
    } catch {
      Alert.alert('Comment Error', 'Could not post your comment.');
    } finally {
      setIsPosting(false);
    }
  };

  const canSend = Boolean(draft.trim()) && !isPosting;

  return (
    <View className="bg-surface rounded-2xl overflow-hidden">
      <View className="px-4 pt-4 flex-row items-center">
        <TouchableOpacity
          onPress={() => openProfile(item.user_id, userId)}
          disabled={!linkAuthor}
          activeOpacity={0.6}
          accessibilityLabel={linkAuthor ? `View ${name}'s profile` : undefined}
          className="flex-1 flex-row items-center"
        >
          <Avatar name={name} uri={item.profile.avatar_url} size={40} />
          <View className="flex-1 ml-3">
            <View className="flex-row items-center flex-wrap">
              <Text className="font-semibold text-ink text-[15px] mr-2">{isOwnReview ? 'You' : name}</Text>
              <VibeTitleChip title={item.profile.vibe_title} />
            </View>
            <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>
              {formatTimeAgo(item.created_at)} · for {item.primary_purpose}
            </Text>
          </View>
        </TouchableOpacity>

        {!isOwnReview && onToggleFollow && (
          <PillButton
            label={item.is_following ? 'Following' : 'Follow'}
            active={item.is_following}
            onPress={() => onToggleFollow(item.user_id)}
          />
        )}
      </View>

      {(companions.length > 0 || groups.length > 0) && (
        <View className="px-4 mt-2 flex-row flex-wrap items-center">
          <Text className="text-[13px] text-muted mr-1">with</Text>
          {companions.map((profile, index) => {
            const companionName = getDisplayName(profile);
            const mine = profile.user_id === userId;
            return (
              <View key={profile.user_id} className="flex-row items-center">
                <TouchableOpacity onPress={() => openProfile(profile.user_id, userId)} disabled={!linkAuthor}>
                  <Text className="text-[13px] font-semibold text-ink">
                    {companionName}
                    {index < companions.length - 1 ? <Text className="font-normal text-muted">, </Text> : null}
                  </Text>
                </TouchableOpacity>
                {mine && (
                  <TouchableOpacity
                    onPress={() => removeCompanion(profile.user_id)}
                    accessibilityLabel="Remove yourself from this review"
                    hitSlop={8}
                    className="ml-1"
                  >
                    <X size={12} color={colors.subtle} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {groups.map((group, index) => (
            <View key={group.id} className="flex-row items-center">
              {(companions.length > 0 || index > 0) && <Text className="text-[13px] text-muted mx-1">·</Text>}
              <TouchableOpacity onPress={() => openGroup(group.id)}>
                <Text className="text-[13px] font-semibold text-primary">{group.name}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {showSpace && (
        <TouchableOpacity
          onPress={() => router.push(`/space/${item.space.id}` as never)}
          activeOpacity={0.7}
          className="mx-4 mt-3 p-2.5 rounded-xl bg-fill flex-row items-center"
        >
          <CategoryIcon category={item.space.category} size={38} />
          <View className="flex-1 mx-3">
            <View className="flex-row items-center">
              <Text className="font-semibold text-ink text-[15px] flex-shrink" numberOfLines={1}>{item.space.name}</Text>
              {item.space.is_secret && (
                <View className="ml-1.5">
                  <KeyRound size={13} color={colors.secret} />
                </View>
              )}
            </View>
            <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>
              {CATEGORY_META[item.space.category].short} · {item.space.address.split(',').slice(0, 2).join(',')}
            </Text>
          </View>
          <ScorePill score={item.overall_score} />
        </TouchableOpacity>
      )}

      {!showSpace && (
        <View className="px-4 mt-3 flex-row">
          <ScorePill score={item.overall_score} size="sm" />
        </View>
      )}

      {item.review_text && (
        <Text className="px-4 mt-3 text-[15px] text-ink leading-[22px]">{item.review_text}</Text>
      )}

      {item.photos && item.photos.length > 0 && (
        <View className="px-4 mt-3">
          <PhotoGrid photos={item.photos} onPressPhoto={(index) => setViewer({ photos: item.photos!, index })} />
        </View>
      )}

      <View className="px-4 mt-3.5">
        <AttributeBars category={item.category} scores={item.attribute_scores} />
      </View>

      <View className="px-2 pb-1 flex-row items-center">
        <TouchableOpacity
          onPress={handleLike}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: liked }}
          className="flex-row items-center px-2 h-10"
        >
          <Heart size={20} color={liked ? colors.like : colors.muted} fill={liked ? colors.like : 'transparent'} />
          <Text style={{ color: liked ? colors.like : colors.muted }} className="text-[14px] ml-1.5 font-medium">{likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleToggleComments}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={isCommentsOpen ? 'Hide comments' : 'Show comments'}
          className="flex-row items-center px-2 h-10 ml-1"
        >
          <MessageCircle size={20} color={isCommentsOpen ? colors.ink : colors.muted} />
          <Text className={`text-[14px] ml-1.5 font-medium ${isCommentsOpen ? 'text-ink' : 'text-muted'}`}>{commentCount}</Text>
        </TouchableOpacity>
      </View>

      {isCommentsOpen && (
        <View className="px-4 pb-4 pt-1 border-t border-line-soft">
          <View className="h-2" />
          {(comments || []).map((comment) => (
            <View key={comment.id} className="flex-row mb-2.5">
              <TouchableOpacity onPress={() => openProfile(comment.user_id, userId)} activeOpacity={0.6}>
                <Avatar name={getDisplayName(comment.profile)} uri={comment.profile?.avatar_url} size={28} />
              </TouchableOpacity>
              <View className="flex-1 ml-2 bg-fill rounded-2xl px-3 py-2">
                <Text onPress={() => openProfile(comment.user_id, userId)} className="text-[13px] font-semibold text-ink self-start">
                  {getDisplayName(comment.profile)}
                </Text>
                <Text className="text-[14px] text-body mt-0.5 leading-5">{comment.body}</Text>
                {comment.photos && comment.photos.length > 0 && (
                  <View className="mt-2">
                    <PhotoGrid
                      photos={comment.photos}
                      size={56}
                      onPressPhoto={(index) => setViewer({ photos: comment.photos!, index })}
                    />
                  </View>
                )}
              </View>
            </View>
          ))}
          {comments?.length === 0 && (
            <Text className="text-[14px] text-muted mb-3">No comments yet. Start the conversation.</Text>
          )}
          {draftPhotos.length > 0 && (
            <View className="flex-row gap-2 mb-2">
              <PhotoThumbnails
                photos={draftPhotos}
                size={56}
                disabled={isPosting}
                onRemove={(index) => setDraftPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
              />
            </View>
          )}
          <View className="flex-row items-center bg-fill rounded-full pl-1 pr-1 h-10">
            {draftPhotos.length < MAX_PHOTOS_PER_POST && (
              <TouchableOpacity
                onPress={handleAddCommentPhotos}
                disabled={isPosting}
                accessibilityLabel="Add photos to comment"
                className="w-8 h-8 rounded-full items-center justify-center"
              >
                <ImagePlus size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              returnKeyType="send"
              onSubmitEditing={handleAddComment}
              className="flex-1 px-2 h-10 text-[14px] text-ink"
            />
            <TouchableOpacity
              onPress={handleAddComment}
              disabled={!canSend}
              accessibilityLabel="Post comment"
              style={{ backgroundColor: canSend ? colors.primary : 'transparent' }}
              className="w-8 h-8 rounded-full items-center justify-center"
            >
              <ArrowUp size={16} color={canSend ? colors.onPrimary : colors.faint} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PhotoViewer photos={viewer?.photos || []} initialIndex={viewer?.index ?? null} onClose={() => setViewer(null)} />
    </View>
  );
}
