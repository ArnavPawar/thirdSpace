import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import type { LatLng, LongPressEvent, MarkerDragStartEndEvent, Region } from 'react-native-maps';
import { ChevronDown, LocateFixed, MapPin, Search, Send } from 'lucide-react-native';
import VibeSlider from '@/components/VibeSlider';
import { useAuth } from '@/lib/auth';
import { submitRating } from '@/lib/data';
import {
  calculateOverallScore,
  CATEGORY_CONFIG,
  createDefaultAttributeScores,
  normalizePurposeForCategory,
  SPACE_CATEGORIES,
  type CategoryPurpose,
  type RatingFormData,
  type SpaceCategory,
  type ThirdSpace,
} from '@/types/space';

interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface NominatimReverseResult {
  display_name?: string;
  name?: string;
}

const DEFAULT_CATEGORY: SpaceCategory = 'Cafe & Coworking';
const DEFAULT_REGION: Region = {
  latitude: 38.8816,
  longitude: -77.1081,
  latitudeDelta: 0.035,
  longitudeDelta: 0.02,
};

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ThirdSpaceExpoApp/1.0',
};

const createInitialRatings = (): RatingFormData => ({
  category: DEFAULT_CATEGORY,
  primary_purpose: CATEGORY_CONFIG[DEFAULT_CATEGORY].purposes[0],
  attribute_scores: createDefaultAttributeScores(DEFAULT_CATEGORY),
  review_text: '',
});

export default function RankScreen() {
  const { userId, isDemoMode } = useAuth();
  const [selectedSpace, setSelectedSpace] = useState<ThirdSpace | null>(null);
  const [ratings, setRatings] = useState<RatingFormData>(createInitialRatings);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pinCoordinate, setPinCoordinate] = useState<LatLng | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categoryConfig = CATEGORY_CONFIG[ratings.category];
  const overallScore = useMemo(() => calculateOverallScore(ratings.attribute_scores), [ratings.attribute_scores]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 3 || selectedSpace?.name === trimmedQuery) {
      setSuggestions([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    const requestTimeout = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(trimmedQuery)}`,
          { headers: NOMINATIM_HEADERS, signal: abortController.signal }
        );

        if (!response.ok) throw new Error('Search request failed');
        setSuggestions((await response.json()) as NominatimSearchResult[]);
      } catch {
        if (!abortController.signal.aborted) {
          setSearchError('Could not load location suggestions.');
          setSuggestions([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 450);

    return () => {
      abortController.abort();
      clearTimeout(requestTimeout);
    };
  }, [searchQuery, selectedSpace?.name]);

  const buildSpace = (name: string, address: string, coordinate: LatLng): ThirdSpace => {
    const timestamp = new Date().toISOString();
    return {
      id: `draft-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
      name,
      category: ratings.category,
      primary_purpose: ratings.primary_purpose,
      address,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      created_at: timestamp,
      updated_at: timestamp,
    };
  };

  const selectCategory = (category: SpaceCategory) => {
    const primaryPurpose = CATEGORY_CONFIG[category].purposes[0];
    setRatings((prev) => ({
      ...prev,
      category,
      primary_purpose: primaryPurpose,
      attribute_scores: createDefaultAttributeScores(category),
    }));
    setSelectedSpace((prev) => prev ? { ...prev, category, primary_purpose: primaryPurpose } : prev);
  };

  const selectPurpose = (primaryPurpose: CategoryPurpose) => {
    const normalizedPurpose = normalizePurposeForCategory(ratings.category, primaryPurpose);
    setRatings((prev) => ({ ...prev, primary_purpose: normalizedPurpose }));
    setSelectedSpace((prev) => prev ? { ...prev, primary_purpose: normalizedPurpose } : prev);
  };

  const updateAttributeScore = (key: keyof RatingFormData['attribute_scores'], value: number) => {
    setRatings((prev) => ({
      ...prev,
      attribute_scores: { ...prev.attribute_scores, [key]: value },
    }));
  };

  const handleSelectSuggestion = (suggestion: NominatimSearchResult) => {
    const coordinate = { latitude: Number(suggestion.lat), longitude: Number(suggestion.lon) };
    const name = suggestion.name || suggestion.display_name.split(',')[0] || 'Selected Location';

    setSelectedSpace(buildSpace(name, suggestion.display_name, coordinate));
    setPinCoordinate(coordinate);
    setMapRegion({ ...coordinate, latitudeDelta: 0.015, longitudeDelta: 0.01 });
    setSearchQuery(name);
    setSuggestions([]);
  };

  const reverseGeocodeCoordinate = async (coordinate: LatLng) => {
    setIsReverseGeocoding(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinate.latitude}&lon=${coordinate.longitude}`,
        { headers: NOMINATIM_HEADERS }
      );

      if (!response.ok) throw new Error('Reverse geocode request failed');

      const result = (await response.json()) as NominatimReverseResult;
      const address = result.display_name || `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
      const name = result.name || address.split(',')[0] || 'Dropped Pin';

      setSelectedSpace(buildSpace(name, address, coordinate));
      setSearchQuery(name);
    } catch {
      setSelectedSpace(buildSpace('Dropped Pin', `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`, coordinate));
      Alert.alert('Address Lookup Failed', 'The pin was saved with coordinates because the closest street address could not be loaded.');
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleSubmitRating = async () => {
    if (isDemoMode) {
      Alert.alert(
        'Sign In Required',
        'Create an account or sign in before rating so your review can be saved to Supabase.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth' as never) },
        ]
      );
      return;
    }

    if (!selectedSpace) {
      Alert.alert('Choose a Space', 'Search for a location or drop a pin before submitting.');
      return;
    }

    if (!selectedSpace.address || !Number.isFinite(selectedSpace.latitude) || !Number.isFinite(selectedSpace.longitude)) {
      Alert.alert('Complete Location', 'The space needs an address and coordinates before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitRating(userId, { space: selectedSpace, rating: ratings });
      Alert.alert('Rating Submitted', `Thanks for rating ${selectedSpace.name}.`, [
        {
          text: 'Rate Another',
          onPress: () => {
            setSelectedSpace(null);
            setRatings(createInitialRatings());
            setSearchQuery('');
            setSuggestions([]);
            setPinCoordinate(null);
          },
        },
        { text: 'Done' },
      ]);
    } catch {
      Alert.alert('Error', 'Could not submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMapLongPress = (event: LongPressEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    setPinCoordinate(coordinate);
    reverseGeocodeCoordinate(coordinate);
  };

  const handleMarkerDragEnd = (event: MarkerDragStartEndEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    setPinCoordinate(coordinate);
    reverseGeocodeCoordinate(coordinate);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        <View className="px-4 pt-2">
          <Text className="text-2xl font-bold text-gray-900 mb-2">Rate a Space</Text>
          <Text className="text-gray-600 mb-6">Help the community by sharing your experience at a third space</Text>
        </View>

        <View className="px-4 mb-6">
          <Text className="text-lg font-semibold text-gray-800 mb-3">Choose a Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {SPACE_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category}
                onPress={() => selectCategory(category)}
                className={`px-3 py-2 rounded-full border ${
                  ratings.category === category ? 'bg-primary border-primary' : 'bg-white border-gray-300'
                }`}
                activeOpacity={0.7}
              >
                <Text className={`text-sm font-medium ${ratings.category === category ? 'text-white' : 'text-gray-700'}`}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-lg font-semibold text-gray-800 mb-3">Primary Purpose</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {categoryConfig.purposes.map((purpose) => (
              <TouchableOpacity
                key={purpose}
                onPress={() => selectPurpose(purpose)}
                className={`px-3 py-2 rounded-full border ${
                  ratings.primary_purpose === purpose ? 'bg-primary/10 border-primary' : 'bg-white border-gray-300'
                }`}
                activeOpacity={0.7}
              >
                <Text className={`text-sm font-medium ${ratings.primary_purpose === purpose ? 'text-primary' : 'text-gray-700'}`}>
                  {purpose}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-lg font-semibold text-gray-800 mb-3">Find or Drop a Location</Text>
          <View className="bg-white border border-gray-300 rounded-lg px-3 py-2 flex-row items-center">
            <Search size={18} color="#9ca3af" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search OpenStreetMap"
              autoCapitalize="words"
              autoCorrect={false}
              className="flex-1 ml-2 text-base text-gray-900"
            />
            {isSearching && <ActivityIndicator size="small" color="#3b82f6" />}
          </View>

          {(suggestions.length > 0 || searchError) && (
            <View className="bg-white border border-gray-200 rounded-lg mt-2 shadow-sm overflow-hidden">
              {searchError && <Text className="p-3 text-sm text-red-600">{searchError}</Text>}
              {suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={suggestion.place_id}
                  onPress={() => handleSelectSuggestion(suggestion)}
                  className={`p-3 ${index < suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
                  activeOpacity={0.7}
                >
                  <Text className="font-semibold text-gray-900" numberOfLines={1}>
                    {suggestion.name || suggestion.display_name.split(',')[0]}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>{suggestion.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setShowMapPicker((current) => !current)}
            className="bg-white border border-gray-300 rounded-lg p-4 flex-row items-center justify-between mt-3"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center flex-1">
              <LocateFixed size={18} color="#3b82f6" />
              <Text className="text-gray-800 font-semibold ml-2">
                {showMapPicker ? 'Hide Pin-Drop Map' : 'Open Pin-Drop Map'}
              </Text>
            </View>
            <ChevronDown size={20} color="#9ca3af" />
          </TouchableOpacity>

          {showMapPicker && (
            <View className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <MapView
                style={{ height: 220 }}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                onLongPress={handleMapLongPress}
              >
                {pinCoordinate && (
                  <Marker coordinate={pinCoordinate} draggable onDragEnd={handleMarkerDragEnd} title="Selected Space" />
                )}
              </MapView>
              <View className="p-3">
                <Text className="text-sm text-gray-600">Long-press the map to place a pin, then drag it to refine the spot.</Text>
                {isReverseGeocoding && <Text className="text-xs text-primary mt-2">Finding closest street address...</Text>}
              </View>
            </View>
          )}

          {selectedSpace && (
            <View className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
              <Text className="font-semibold text-gray-900 mb-1">{selectedSpace.name}</Text>
              <View className="flex-row items-start">
                <MapPin size={14} color="#9ca3af" />
                <Text className="text-sm text-gray-600 flex-1 ml-2" numberOfLines={2}>{selectedSpace.address}</Text>
              </View>
              <Text className="text-xs text-gray-500 mt-2">
                Lat {selectedSpace.latitude.toFixed(5)}, Lng {selectedSpace.longitude.toFixed(5)}
              </Text>
            </View>
          )}
        </View>

        {selectedSpace && (
          <View className="bg-white mx-4 rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
            <Text className="text-lg font-semibold text-gray-800 mb-4">Rate Your Experience</Text>

            {categoryConfig.attributes.map((attribute) => (
              <VibeSlider
                key={attribute.key}
                label={attribute.label}
                value={ratings.attribute_scores[attribute.key] || 3}
                onValueChange={(value) => updateAttributeScore(attribute.key, value)}
                description={attribute.description}
                disabled={isSubmitting}
              />
            ))}

            <Text className="text-sm font-semibold text-gray-800 mb-2">Review</Text>
            <TextInput
              value={ratings.review_text}
              onChangeText={(review_text) => setRatings((prev) => ({ ...prev, review_text }))}
              placeholder="What should people know before they go?"
              multiline
              className="border border-gray-200 rounded-xl px-4 py-3 min-h-24 text-base text-gray-900 mb-5"
              textAlignVertical="top"
            />

            <View className="bg-primary/5 rounded-lg p-4 mb-6">
              <Text className="text-center text-primary font-bold text-2xl">{overallScore}/100</Text>
              <Text className="text-center text-primary text-sm font-medium">Calculated Overall Score</Text>
            </View>

            <TouchableOpacity
              onPress={handleSubmitRating}
              disabled={isSubmitting}
              className={`py-4 rounded-lg flex-row items-center justify-center ${isSubmitting ? 'bg-gray-300' : 'bg-primary'}`}
              activeOpacity={0.8}
            >
              <Send size={18} color={isSubmitting ? '#6b7280' : 'white'} />
              <Text className={`ml-2 font-semibold text-base ${isSubmitting ? 'text-gray-500' : 'text-white'}`}>
                {isSubmitting ? 'Submitting Rating...' : 'Submit Rating'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!selectedSpace && (
          <View className="mx-4 bg-blue-50 rounded-xl p-6">
            <Text className="text-blue-800 font-semibold text-center mb-2">Ready to Rate?</Text>
            <Text className="text-blue-700 text-center text-sm leading-relaxed">
              Search for a place or long-press the mini-map to drop a pin.
            </Text>
          </View>
        )}

        <View className="h-20" />
      </ScrollView>
    </SafeAreaView>
  );
}
