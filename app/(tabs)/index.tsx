import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Clock, MessageCircle, Send, ThumbsUp, UserPlus } from 'lucide-react-native';
import SpaceCard from '@/components/SpaceCard';
import { addComment, listComments, listRecentActivity, toggleFollow, toggleLike } from '@/lib/data';
import { useAuth } from '@/lib/auth';
import { CATEGORY_CONFIG, type FeedActivity, type ReviewComment, type UserRating } from '@/types/space';

export default function FeedScreen() {
  const { userId } = useAuth();
  const [activity, setActivity] = useState<FeedActivity[]>([]);
  const [feedScope, setFeedScope] = useState<'public' | 'following'>('public');
  const [comments, setComments] = useState<Record<string, ReviewComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadActivity = useCallback(async () => {
    try {
      const items = await listRecentActivity({ currentUserId: userId, scope: feedScope });
      setActivity(items);
    } catch {
      Alert.alert('Feed Error', 'Could not load recent reviews.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [feedScope, userId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActivity();
  }, [loadActivity]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  const renderRatingBadges = (rating: UserRating) => {
    const badges = CATEGORY_CONFIG[rating.category].attributes.flatMap((attribute) => {
      const value = rating.attribute_scores[attribute.key];
      return typeof value === 'number' ? [{ label: attribute.label, value }] : [];
    });

    return (
      <View className="flex-row flex-wrap gap-2 mt-2 mb-3">
        {badges.map((badge) => (
          <View key={badge.label} className="bg-gray-100 px-2 py-1 rounded-full">
            <Text className="text-xs font-medium text-gray-700">
              {badge.label} {badge.value}/5
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const handleToggleFollow = async (targetUserId: string) => {
    try {
      const isFollowing = await toggleFollow(userId, targetUserId);
      setActivity((items) => items.map((item) =>
        item.user_id === targetUserId ? { ...item, is_following: isFollowing } : item
      ));
    } catch {
      Alert.alert('Follow Error', 'Could not update follow state.');
    }
  };

  const handleToggleLike = async (ratingId: string) => {
    const target = activity.find((item) => item.id === ratingId);
    if (!target) return;

    setActivity((items) => items.map((item) => item.id === ratingId
      ? {
          ...item,
          current_user_liked: !item.current_user_liked,
          likes_count: Math.max(0, (item.likes_count || 0) + (item.current_user_liked ? -1 : 1)),
        }
      : item
    ));

    try {
      await toggleLike(userId, ratingId);
    } catch {
      setActivity((items) => items.map((item) => item.id === ratingId ? target : item));
      Alert.alert('Like Error', 'Could not update like.');
    }
  };

  const handleToggleComments = async (ratingId: string) => {
    const isOpening = !expandedComments[ratingId];
    setExpandedComments((current) => ({ ...current, [ratingId]: isOpening }));

    if (isOpening && !comments[ratingId]) {
      try {
        const nextComments = await listComments(ratingId);
        setComments((current) => ({ ...current, [ratingId]: nextComments }));
      } catch {
        Alert.alert('Comments Error', 'Could not load comments.');
      }
    }
  };

  const handleAddComment = async (ratingId: string) => {
    const draft = commentDrafts[ratingId]?.trim();
    if (!draft) return;

    try {
      await addComment(userId, ratingId, draft);
      const nextComments = await listComments(ratingId);
      setCommentDrafts((current) => ({ ...current, [ratingId]: '' }));
      setComments((current) => ({ ...current, [ratingId]: nextComments }));
      setActivity((items) => items.map((item) => item.id === ratingId
        ? { ...item, comments_count: (item.comments_count || 0) + 1 }
        : item
      ));
    } catch {
      Alert.alert('Comment Error', 'Could not post your comment.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-4 pt-2">
          <Text className="text-2xl font-bold text-gray-900 mb-2">Recent Reviews</Text>
          <Text className="text-gray-600 mb-6">See what the community is saying about local spaces</Text>
          <View className="flex-row bg-white rounded-xl border border-gray-200 p-1 mb-4">
            {(['public', 'following'] as const).map((scope) => (
              <TouchableOpacity
                key={scope}
                onPress={() => setFeedScope(scope)}
                className={`flex-1 py-3 rounded-lg items-center ${
                  feedScope === scope ? 'bg-primary' : 'bg-transparent'
                }`}
                activeOpacity={0.8}
              >
                <Text className={`font-semibold ${feedScope === scope ? 'text-white' : 'text-gray-600'}`}>
                  {scope === 'public' ? 'Public' : 'Following'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#3b82f6" />
            <Text className="text-gray-500 mt-3">Loading reviews...</Text>
          </View>
        ) : (
          <View className="px-4">
            {activity.length === 0 ? (
              <View className="bg-white rounded-xl border border-gray-200 p-8 items-center">
                <Text className="text-lg font-semibold text-gray-900 mb-2">
                  No {feedScope === 'following' ? 'following' : 'public'} reviews yet
                </Text>
                <Text className="text-gray-600 text-center">
                  {feedScope === 'following'
                    ? 'Follow people from the Public feed to build this view.'
                    : 'Seed demo reviews or rate a space to start the feed.'}
                </Text>
              </View>
            ) : activity.map((item) => (
              <View key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                <View className="p-4 pb-2 flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <View className="w-10 h-10 bg-primary rounded-full items-center justify-center mr-3">
                      <Text className="text-white font-bold text-sm">
                        {(item.profile.full_name || item.profile.username || '?').split(' ').map((name) => name[0]).join('')}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900">{item.profile.full_name || item.profile.username}</Text>
                      <View className="flex-row items-center">
                        <Clock size={12} color="#9ca3af" />
                        <Text className="text-sm text-gray-500 ml-1">{formatTimeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                  </View>

                  {item.user_id !== userId && (
                    <TouchableOpacity
                      onPress={() => handleToggleFollow(item.user_id)}
                      className={`flex-row items-center px-3 py-2 rounded-full ${
                        item.is_following ? 'bg-gray-100' : 'bg-primary/10'
                      }`}
                      activeOpacity={0.7}
                    >
                      <UserPlus size={14} color={item.is_following ? '#4b5563' : '#3b82f6'} />
                      <Text className={`font-semibold text-xs ml-1 ${item.is_following ? 'text-gray-700' : 'text-primary'}`}>
                        {item.is_following ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View className="px-4 pb-2">
                  <SpaceCard space={item.space} compact onPress={() => router.push(`/space/${item.space.id}` as never)} />
                </View>

                <View className="px-4">{renderRatingBadges(item)}</View>

                {item.review_text && (
                  <View className="px-4 pb-3">
                    <Text className="text-gray-700 leading-relaxed">{item.review_text}</Text>
                  </View>
                )}

                <View className="px-4 py-3 border-t border-gray-100">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-6">
                      <TouchableOpacity onPress={() => handleToggleLike(item.id)} className="flex-row items-center">
                        <ThumbsUp size={16} color={item.current_user_liked ? '#3b82f6' : '#9ca3af'} />
                        <Text className="text-sm text-gray-600 ml-2">{item.likes_count || 0}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleToggleComments(item.id)} className="flex-row items-center">
                        <MessageCircle size={16} color="#9ca3af" />
                        <Text className="text-sm text-gray-600 ml-2">{item.comments_count || 0}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text className="text-xs text-gray-400">{item.overall_score}/100 overall</Text>
                  </View>

                  {expandedComments[item.id] && (
                    <View className="mt-4">
                      {(comments[item.id] || []).map((comment) => (
                        <View key={comment.id} className="bg-gray-50 rounded-lg p-3 mb-2">
                          <Text className="text-xs font-semibold text-gray-700">
                            {comment.profile?.full_name || comment.profile?.username || 'Community member'}
                          </Text>
                          <Text className="text-sm text-gray-700 mt-1">{comment.body}</Text>
                        </View>
                      ))}
                      <View className="flex-row items-center mt-2">
                        <TextInput
                          value={commentDrafts[item.id] || ''}
                          onChangeText={(value) => setCommentDrafts((current) => ({ ...current, [item.id]: value }))}
                          placeholder="Add a comment..."
                          className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm bg-white"
                        />
                        <TouchableOpacity onPress={() => handleAddComment(item.id)} className="ml-2 bg-primary rounded-full p-3">
                          <Send size={16} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
