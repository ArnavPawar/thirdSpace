import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ExternalLink, Heart, MessageCircle, Phone, Send, Share2, ThumbsUp } from 'lucide-react-native';
import SpaceCard from '@/components/SpaceCard';
import { useAuth } from '@/lib/auth';
import { addComment, getSpaceDetails, listComments, toggleFavorite, toggleLike } from '@/lib/data';
import { openDirections, openExternalUrl, shareSpace } from '@/lib/links';
import type { ReviewComment, SpaceDetails } from '@/types/space';

export default function SpaceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [space, setSpace] = useState<SpaceDetails | null>(null);
  const [comments, setComments] = useState<Record<string, ReviewComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadSpace = useCallback(async () => {
    try {
      if (!id) return;
      setSpace(await getSpaceDetails(id));
    } catch {
      Alert.alert('Space Error', 'Could not load this space.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpace();
  }, [loadSpace]);

  const handleToggleLike = async (ratingId: string) => {
    if (!space) return;

    setSpace({
      ...space,
      reviews: space.reviews.map((review) => review.id === ratingId
        ? {
            ...review,
            current_user_liked: !review.current_user_liked,
            likes_count: Math.max(0, (review.likes_count || 0) + (review.current_user_liked ? -1 : 1)),
          }
        : review
      ),
    });

    try {
      await toggleLike(userId, ratingId);
    } catch {
      loadSpace();
    }
  };

  const handleLoadComments = async (ratingId: string) => {
    try {
      const nextComments = await listComments(ratingId);
      setComments((current) => ({ ...current, [ratingId]: nextComments }));
    } catch {
      Alert.alert('Comments Error', 'Could not load comments.');
    }
  };

  const handleAddComment = async (ratingId: string) => {
    const draft = commentDrafts[ratingId]?.trim();
    if (!draft) return;

    try {
      await addComment(userId, ratingId, draft);
      setCommentDrafts((current) => ({ ...current, [ratingId]: '' }));
      await handleLoadComments(ratingId);
    } catch {
      Alert.alert('Comment Error', 'Could not post your comment.');
    }
  };

  const handleFavorite = async () => {
    if (!space) return;

    try {
      await toggleFavorite(userId, space);
      setSpace({ ...space, current_user_favorited: !space.current_user_favorited });
    } catch {
      Alert.alert('Favorite Error', 'Could not update favorite.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color="#3b82f6" />
        <Text className="text-gray-500 mt-3">Loading space...</Text>
      </SafeAreaView>
    );
  }

  if (!space) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-xl font-bold text-gray-900 mb-2">Space Not Found</Text>
        <Text className="text-gray-600 text-center">This space may have been removed or is not available yet.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 px-4 pt-4">
        <SpaceCard space={space} showDistance />

        <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-2">About</Text>
          <Text className="text-gray-700 leading-relaxed">{space.description || 'No description yet.'}</Text>
          {space.hours && (
            <View className="mt-3 bg-gray-50 rounded-lg p-3">
              <Text className="text-sm font-semibold text-gray-800 mb-1">Hours</Text>
              <Text className="text-sm text-gray-600">{space.hours}</Text>
            </View>
          )}
        </View>

        <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">Actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <TouchableOpacity onPress={() => openDirections(space)} className="bg-primary rounded-xl px-4 py-3">
              <Text className="text-white font-semibold">Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleFavorite} className="bg-red-50 rounded-xl px-4 py-3 flex-row items-center">
              <Heart size={16} color="#dc2626" fill={space.current_user_favorited ? '#dc2626' : 'transparent'} />
              <Text className="text-red-600 font-semibold ml-2">Favorite</Text>
            </TouchableOpacity>
            {space.website && (
              <TouchableOpacity onPress={() => openExternalUrl(space.website)} className="bg-gray-100 rounded-xl px-4 py-3 flex-row items-center">
                <ExternalLink size={16} color="#374151" />
                <Text className="text-gray-800 font-semibold ml-2">Website</Text>
              </TouchableOpacity>
            )}
            {space.phone && (
              <TouchableOpacity onPress={() => openExternalUrl(`tel:${space.phone}`)} className="bg-gray-100 rounded-xl px-4 py-3 flex-row items-center">
                <Phone size={16} color="#374151" />
                <Text className="text-gray-800 font-semibold ml-2">Call</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => shareSpace(space)} className="bg-gray-100 rounded-xl px-4 py-3 flex-row items-center">
              <Share2 size={16} color="#374151" />
              <Text className="text-gray-800 font-semibold ml-2">Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-white rounded-xl border border-gray-200 p-4 mb-8">
          <Text className="text-lg font-bold text-gray-900 mb-3">Reviews</Text>
          {space.reviews.length === 0 ? (
            <Text className="text-gray-600">No reviews yet. Be the first to rate this space.</Text>
          ) : (
            space.reviews.map((review) => (
              <View key={review.id} className="border-b border-gray-100 pb-4 mb-4">
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="font-semibold text-gray-900">{review.profile.full_name || review.profile.username}</Text>
                    <Text className="text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text className="text-primary font-bold">{review.overall_score}/100</Text>
                </View>
                {review.review_text && <Text className="text-gray-700 mt-3 leading-relaxed">{review.review_text}</Text>}

                <View className="flex-row items-center gap-6 mt-3">
                  <TouchableOpacity onPress={() => handleToggleLike(review.id)} className="flex-row items-center">
                    <ThumbsUp size={16} color={review.current_user_liked ? '#3b82f6' : '#9ca3af'} />
                    <Text className="text-sm text-gray-600 ml-2">{review.likes_count || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleLoadComments(review.id)} className="flex-row items-center">
                    <MessageCircle size={16} color="#9ca3af" />
                    <Text className="text-sm text-gray-600 ml-2">{review.comments_count || 0}</Text>
                  </TouchableOpacity>
                </View>

                {(comments[review.id] || []).map((comment) => (
                  <View key={comment.id} className="bg-gray-50 rounded-lg p-3 mt-3">
                    <Text className="text-xs font-semibold text-gray-700">
                      {comment.profile?.full_name || comment.profile?.username || 'Community member'}
                    </Text>
                    <Text className="text-sm text-gray-700 mt-1">{comment.body}</Text>
                  </View>
                ))}

                <View className="flex-row items-center mt-3">
                  <TextInput
                    value={commentDrafts[review.id] || ''}
                    onChangeText={(value) => setCommentDrafts((current) => ({ ...current, [review.id]: value }))}
                    placeholder="Add a comment..."
                    className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm bg-white"
                  />
                  <TouchableOpacity onPress={() => handleAddComment(review.id)} className="ml-2 bg-primary rounded-full p-3">
                    <Send size={16} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
