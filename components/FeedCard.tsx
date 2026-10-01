import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Heart, KeyRound, MessageCircle, Send, UserCheck, UserPlus } from 'lucide-react-native';
import AttributeBars from '@/components/AttributeBars';
import { Avatar, CategoryIcon, ScorePill, VibeTitleChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addComment, listComments, toggleLike } from '@/lib/data';
import { formatTimeAgo, getDisplayName } from '@/lib/format';
import { CATEGORY_META, colors } from '@/lib/theme';
import type { FeedActivity, ReviewComment } from '@/types/space';

interface FeedCardProps {
  item: FeedActivity;
  onToggleFollow?: (userId: string) => void;
  showSpace?: boolean;
}

export default function FeedCard({ item, onToggleFollow, showSpace = true }: FeedCardProps) {
  const { userId } = useAuth();
  const [liked, setLiked] = useState(Boolean(item.current_user_liked));
  const [likes, setLikes] = useState(item.likes_count || 0);
  const [commentCount, setCommentCount] = useState(item.comments_count || 0);
  const [comments, setComments] = useState<ReviewComment[] | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const name = getDisplayName(item.profile);
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

  const handleAddComment = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await addComment(userId, item.id, body);
      setDraft('');
      setComments(await listComments(item.id));
      setCommentCount((count) => count + 1);
    } catch {
      Alert.alert('Comment Error', 'Could not post your comment.');
    }
  };

  return (
    <View className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
      <View className="px-4 pt-4 flex-row items-center">
        <Avatar name={name} size={40} />
        <View className="flex-1 ml-3">
          <View className="flex-row items-center flex-wrap">
            <Text className="font-bold text-ink text-[15px] mr-2">{isOwnReview ? 'You' : name}</Text>
            <VibeTitleChip title={item.profile.vibe_title} />
          </View>
          <Text className="text-xs text-slate-400 mt-0.5">
            {formatTimeAgo(item.created_at)} · for {item.primary_purpose}
          </Text>
        </View>

        {!isOwnReview && onToggleFollow && (
          <TouchableOpacity
            onPress={() => onToggleFollow(item.user_id)}
            activeOpacity={0.7}
            className={`flex-row items-center px-3 h-8 rounded-full ${item.is_following ? 'bg-slate-100' : 'bg-primary'}`}
          >
            {item.is_following
              ? <UserCheck size={14} color={colors.muted} />
              : <UserPlus size={14} color="white" />}
            <Text className={`font-semibold text-xs ml-1 ${item.is_following ? 'text-slate-600' : 'text-white'}`}>
              {item.is_following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showSpace && (
        <TouchableOpacity
          onPress={() => router.push(`/space/${item.space.id}` as never)}
          activeOpacity={0.75}
          className="mx-4 mt-3 p-3 rounded-2xl flex-row items-center"
          style={{ backgroundColor: CATEGORY_META[item.space.category].tint + '80' }}
        >
          <CategoryIcon category={item.space.category} size={40} />
          <View className="flex-1 mx-3">
            <View className="flex-row items-center">
              <Text className="font-bold text-ink text-[15px] flex-shrink" numberOfLines={1}>{item.space.name}</Text>
              {item.space.is_secret && (
                <View className="ml-1.5">
                  <KeyRound size={13} color={colors.secret} />
                </View>
              )}
            </View>
            <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
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
        <Text className="px-4 mt-3 text-[15px] text-slate-700 leading-[22px]">{item.review_text}</Text>
      )}

      <View className="px-4 mt-3">
        <AttributeBars category={item.category} scores={item.attribute_scores} />
      </View>

      <View className="px-2 py-1 border-t border-slate-100 flex-row items-center">
        <TouchableOpacity onPress={handleLike} activeOpacity={0.7} className="flex-row items-center px-2 h-10">
          <Heart size={18} color={liked ? colors.like : colors.subtle} fill={liked ? colors.like : 'transparent'} />
          <Text className={`text-sm ml-1.5 font-medium ${liked ? 'text-rose-600' : 'text-slate-500'}`}>{likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleToggleComments} activeOpacity={0.7} className="flex-row items-center px-2 h-10 ml-2">
          <MessageCircle size={18} color={isCommentsOpen ? colors.primary : colors.subtle} />
          <Text className="text-sm ml-1.5 font-medium text-slate-500">{commentCount}</Text>
        </TouchableOpacity>
      </View>

      {isCommentsOpen && (
        <View className="px-4 pb-4">
          {(comments || []).map((comment) => (
            <View key={comment.id} className="flex-row mb-2.5">
              <Avatar name={getDisplayName(comment.profile)} size={28} />
              <View className="flex-1 ml-2 bg-slate-50 rounded-2xl px-3 py-2">
                <Text className="text-xs font-bold text-slate-700">{getDisplayName(comment.profile)}</Text>
                <Text className="text-sm text-slate-700 mt-0.5">{comment.body}</Text>
              </View>
            </View>
          ))}
          {comments?.length === 0 && (
            <Text className="text-sm text-slate-400 mb-3">No comments yet. Start the conversation.</Text>
          )}
          <View className="flex-row items-center">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColor={colors.subtle}
              returnKeyType="send"
              onSubmitEditing={handleAddComment}
              className="flex-1 bg-slate-100 rounded-full px-4 h-10 text-sm text-ink"
            />
            <TouchableOpacity
              onPress={handleAddComment}
              disabled={!draft.trim()}
              className={`ml-2 w-10 h-10 rounded-full items-center justify-center ${draft.trim() ? 'bg-primary' : 'bg-slate-200'}`}
            >
              <Send size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
