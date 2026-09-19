import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Award, Heart, LogIn, MapPin, Save, Settings, Star, TrendingUp, UserPlus, X } from 'lucide-react-native';
import SpaceCard from '@/components/SpaceCard';
import { demoUserLabel, useAuth } from '@/lib/auth';
import { getProfile, listSocialProfiles, listUserRankings, toggleFavorite, toggleFollow, updateProfile } from '@/lib/data';
import type { CategoryPurpose, Profile, ProfileWithStats, SpaceWithAttributes, UserRanking } from '@/types/space';

type RankingWithSpace = UserRanking & { space: SpaceWithAttributes };

export default function ProfileScreen() {
  const { userId, isDemoMode, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [rankings, setRankings] = useState<RankingWithSpace[]>([]);
  const [activeTab, setActiveTab] = useState<'rankings' | 'favorites'>('rankings');
  const [selectedPurpose, setSelectedPurpose] = useState<CategoryPurpose | 'All Purposes'>('All Purposes');
  const [socialModalType, setSocialModalType] = useState<'followers' | 'following' | null>(null);
  const [socialProfiles, setSocialProfiles] = useState<Profile[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ full_name: '', username: '', bio: '', location: '' });
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const [profileResult, rankingResult] = await Promise.all([
        getProfile(userId),
        listUserRankings(userId),
      ]);
      setProfile(profileResult);
      setRankings(rankingResult);
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
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const purposeOptions = useMemo(() => Array.from(
    new Set(rankings.map((ranking) => ranking.space.primary_purpose).filter(Boolean))
  ) as CategoryPurpose[], [rankings]);

  const filteredRankings = (activeTab === 'favorites'
    ? rankings.filter((ranking) => ranking.is_favorite)
    : rankings
  ).filter((ranking) => selectedPurpose === 'All Purposes' || ranking.space.primary_purpose === selectedPurpose);

  const openSocialModal = async (type: 'followers' | 'following') => {
    setSocialModalType(type);
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
    try {
      await toggleFavorite(userId, space);
      await loadProfile();
    } catch {
      Alert.alert('Favorite Error', 'Could not update favorite.');
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

  const formatLastVisited = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString();
  };

  if (isLoading || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color="#3b82f6" />
        <Text className="text-gray-500 mt-3">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        <View className="bg-white border-b border-gray-200">
          <View className="px-4 py-6">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center flex-1">
                <View className="w-20 h-20 bg-primary rounded-full items-center justify-center mr-4">
                  <Text className="text-white font-bold text-2xl">
                    {(profile.full_name || profile.username || demoUserLabel).split(' ').map((name) => name[0]).join('')}
                  </Text>
                </View>

                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">{profile.full_name || demoUserLabel}</Text>
                  <Text className="text-gray-600 mb-1">@{profile.username || 'thirdspace_user'}</Text>
                  <View className="flex-row items-center">
                    <MapPin size={14} color="#9ca3af" />
                    <Text className="text-sm text-gray-500 ml-1">{profile.location || 'Set your location'}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity onPress={() => setShowSettings(true)} className="p-2" activeOpacity={0.7}>
                <Settings size={24} color="#4b5563" />
              </TouchableOpacity>
            </View>

            {isDemoMode && (
              <TouchableOpacity
                onPress={() => router.push('/auth' as never)}
                className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex-row items-center mb-4"
              >
                <LogIn size={16} color="#1d4ed8" />
                <Text className="text-blue-800 text-sm font-medium flex-1 ml-2">
                  Demo mode is active. Configure Supabase and sign in to persist changes.
                </Text>
              </TouchableOpacity>
            )}

            <Text className="text-gray-700 leading-relaxed mb-4">{profile.bio}</Text>

            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">{profile.stats.spaces_rated}</Text>
                <Text className="text-xs text-gray-600">Spaces Rated</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">{profile.stats.reviews_written}</Text>
                <Text className="text-xs text-gray-600">Reviews</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">{profile.stats.helpful_votes}</Text>
                <Text className="text-xs text-gray-600">Helpful Votes</Text>
              </View>
              <View className="items-center">
                <Text className="text-2xl font-bold text-primary">#{profile.stats.rank_in_area}</Text>
                <Text className="text-xs text-gray-600">Local Rank</Text>
              </View>
            </View>

            <View className="flex-row mt-5 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
              <TouchableOpacity onPress={() => openSocialModal('followers')} className="flex-1 py-3 items-center border-r border-gray-200">
                <Text className="text-xl font-bold text-gray-900">{profile.stats.followers}</Text>
                <Text className="text-xs text-gray-600">Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openSocialModal('following')} className="flex-1 py-3 items-center">
                <Text className="text-xl font-bold text-gray-900">{profile.stats.following}</Text>
                <Text className="text-xs text-gray-600">Following</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-row items-center">
              <Award size={16} color="#ca8a04" />
              <Text className="text-yellow-800 text-sm font-medium flex-1 ml-2">
                Arlington Explorer - keep rating spaces to climb the local board.
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-white border-b border-gray-200 px-4">
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => setActiveTab('rankings')}
              className={`flex-1 py-3 border-b-2 ${activeTab === 'rankings' ? 'border-primary' : 'border-transparent'}`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center justify-center">
                <TrendingUp size={16} color={activeTab === 'rankings' ? '#3b82f6' : '#6b7280'} />
                <Text className={`ml-2 font-medium ${activeTab === 'rankings' ? 'text-primary' : 'text-gray-600'}`}>
                  My Rankings ({rankings.length})
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('favorites')}
              className={`flex-1 py-3 border-b-2 ${activeTab === 'favorites' ? 'border-primary' : 'border-transparent'}`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center justify-center">
                <Heart size={16} color={activeTab === 'favorites' ? '#3b82f6' : '#6b7280'} />
                <Text className={`ml-2 font-medium ${activeTab === 'favorites' ? 'text-primary' : 'text-gray-600'}`}>
                  Favorites ({rankings.filter((ranking) => ranking.is_favorite).length})
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-4 pt-4">
          <Text className="text-sm font-semibold text-gray-700 mb-2">Filter by Purpose</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {(['All Purposes', ...purposeOptions] as (CategoryPurpose | 'All Purposes')[]).map((purpose) => (
              <TouchableOpacity
                key={purpose}
                onPress={() => setSelectedPurpose(purpose)}
                className={`px-3 py-2 rounded-full border mr-2 ${
                  selectedPurpose === purpose ? 'bg-primary border-primary' : 'bg-white border-gray-300'
                }`}
                activeOpacity={0.7}
              >
                <Text className={`text-sm font-medium ${selectedPurpose === purpose ? 'text-white' : 'text-gray-700'}`}>
                  {purpose}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredRankings.length > 0 ? (
            <>
              <Text className="text-lg font-semibold text-gray-800 mb-4">
                {activeTab === 'rankings' ? 'Your Personal Space Rankings' : 'Your Favorite Spaces'}
              </Text>

              {filteredRankings.map((ranking) => (
                <View key={ranking.id} className="mb-4">
                  <View className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <View className="absolute top-3 left-3 z-10">
                      <View className="bg-primary rounded-full w-8 h-8 items-center justify-center">
                        <Text className="text-white font-bold text-sm">#{ranking.personal_rank}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleToggleFavorite(ranking.space)}
                      className="absolute top-3 right-3 z-10"
                    >
                      <View className={`${ranking.is_favorite ? 'bg-red-500' : 'bg-gray-300'} rounded-full w-8 h-8 items-center justify-center`}>
                        <Heart size={14} color="white" fill={ranking.is_favorite ? 'white' : 'transparent'} />
                      </View>
                    </TouchableOpacity>

                    <View className="pt-6">
                      <SpaceCard space={ranking.space} showDistance onPress={() => router.push(`/space/${ranking.space.id}` as never)} />
                    </View>

                    <View className="px-4 pb-4">
                      {ranking.notes && (
                        <View className="bg-gray-50 rounded-lg p-3 mb-3">
                          <Text className="text-sm font-medium text-gray-700 mb-1">My Notes</Text>
                          <Text className="text-sm text-gray-600 italic">"{ranking.notes}"</Text>
                        </View>
                      )}

                      <View className="flex-row justify-between items-center">
                        <Text className="text-xs text-gray-500">
                          Last visited: {formatLastVisited(ranking.last_visited || ranking.created_at)}
                        </Text>
                        <View className="flex-row items-center">
                          <Star size={12} color="#eab308" />
                          <Text className="text-xs text-gray-500 ml-1">
                            Rated {ranking.space.attributes?.overall_score || 'N/A'}/100
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <View className="bg-white rounded-xl border border-gray-200 p-8 items-center">
              <Heart size={48} color="#d1d5db" />
              <Text className="text-lg font-semibold text-gray-900 mb-2 text-center">
                No {activeTab === 'favorites' ? 'Favorites' : 'Rankings'} Yet
              </Text>
              <Text className="text-gray-600 text-center leading-relaxed">
                {activeTab === 'favorites' ? 'Heart spaces you love to add them here.' : 'Rate spaces to build your ranking list.'}
              </Text>
            </View>
          )}
        </View>

        <View className="h-20" />
      </ScrollView>

      <Modal visible={socialModalType !== null} transparent animationType="fade" onRequestClose={() => setSocialModalType(null)}>
        <View className="flex-1 bg-black/40 justify-center px-4">
          <View className="bg-white rounded-2xl overflow-hidden">
            <View className="px-4 py-4 border-b border-gray-100 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-900">
                {socialModalType === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity onPress={() => setSocialModalType(null)} className="p-1" activeOpacity={0.7}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View className="p-4">
              {socialProfiles.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-900 font-semibold mb-1">
                    No {socialModalType === 'followers' ? 'followers' : 'following'} yet
                  </Text>
                  <Text className="text-gray-500 text-center text-sm">
                    {socialModalType === 'followers'
                      ? 'People who follow you will appear here.'
                      : 'Follow people from the feed to see them here.'}
                  </Text>
                </View>
              ) : socialProfiles.map((item) => (
                <View key={item.id} className="flex-row items-center mb-4">
                  <View className="w-11 h-11 bg-primary rounded-full items-center justify-center mr-3">
                    <Text className="text-white font-bold">
                      {(item.full_name || item.username || '?').split(' ').map((name) => name[0]).join('')}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">{item.full_name}</Text>
                    <Text className="text-xs text-gray-500">@{item.username}</Text>
                    <Text className="text-xs text-gray-600 mt-1" numberOfLines={1}>{item.bio}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleFollow(item.user_id)}
                    className={`px-3 py-2 rounded-full flex-row items-center ${item.is_following ? 'bg-gray-100' : 'bg-primary'}`}
                    activeOpacity={0.7}
                  >
                    <UserPlus size={14} color={item.is_following ? '#4b5563' : 'white'} />
                    <Text className={`ml-1 text-xs font-semibold ${item.is_following ? 'text-gray-700' : 'text-white'}`}>
                      {item.is_following ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl p-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {(['full_name', 'username', 'location', 'bio'] as const).map((field) => (
              <View key={field} className="mb-3">
                <Text className="text-sm font-semibold text-gray-700 mb-1">
                  {field.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </Text>
                <TextInput
                  value={profileDraft[field]}
                  onChangeText={(value) => setProfileDraft((current) => ({ ...current, [field]: value }))}
                  multiline={field === 'bio'}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
                />
              </View>
            ))}

            <TouchableOpacity onPress={handleSaveProfile} className="bg-primary rounded-xl py-4 items-center flex-row justify-center">
              <Save size={18} color="white" />
              <Text className="text-white font-semibold ml-2">Save Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={signOut} className="py-4 items-center">
              <Text className="text-red-600 font-semibold">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
