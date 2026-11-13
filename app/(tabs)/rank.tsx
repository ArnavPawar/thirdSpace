import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import type { LatLng, MapPressEvent, MarkerDragStartEndEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Globe,
  KeyRound,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  Send,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react-native';
import PhotoPickerRow from '@/components/PhotoPickerRow';
import VibeSlider from '@/components/VibeSlider';
import { Avatar, CategoryIcon, Chip, EmptyState, PrimaryButton, ProgressBar, ScorePill, Sheet } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getProfile, listMyGroups, listSecretSpots, listSocialProfiles, listSpaces, submitRating } from '@/lib/data';
import { formatDistance, getDisplayName } from '@/lib/format';
import { openProfile } from '@/lib/links';
import { buildViewbox, rankSearchResults } from '@/lib/search';
import { isSupabaseConfigured } from '@/lib/supabase';
import { CATEGORY_META, useColors, useColorSchemeName } from '@/lib/theme';
import {
  calculateDistanceMiles,
  calculateOverallScore,
  CATEGORY_CONFIG,
  createDefaultAttributeScores,
  MAX_PHOTOS_PER_POST,
  normalizePurposeForCategory,
  SPACE_CATEGORIES,
  type CategoryPurpose,
  type Group,
  type LocalPhoto,
  type Profile,
  type RatingFormData,
  type SpaceCategory,
  type SpaceWithAttributes,
  type ThirdSpace,
} from '@/types/space';
import { getSecretSlotsRemaining, getVibeProgress, VIBE_MILESTONES, type VibeProgress } from '@/types/vibes';

interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

type PlaceSuggestion = NominatimSearchResult & { distance: number; isFar: boolean };
type SearchScope = 'nearby' | 'anywhere';

const NEARBY_RADIUS_MILES = 15;

interface NominatimReverseResult {
  display_name?: string;
  name?: string;
}

type Step = 0 | 1 | 2;

const STEPS = [
  { title: 'Where is it?', subtitle: 'Search for a place or tap the map to drop a pin.' },
  { title: 'What kind of spot?', subtitle: 'Pick the category that fits best.' },
  { title: "How's the vibe?", subtitle: 'Score what matters for this kind of spot.' },
];

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

const createInitialRatings = (category: SpaceCategory = DEFAULT_CATEGORY): RatingFormData => ({
  category,
  primary_purpose: CATEGORY_CONFIG[category].purposes[0],
  attribute_scores: createDefaultAttributeScores(category),
  review_text: '',
});

export default function RateScreen() {
  const colors = useColors();
  const scheme = useColorSchemeName();
  const { userId, user } = useAuth();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const mapRef = useRef<MapView>(null);
  const mapCenterRef = useRef<LatLng>({ latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });

  const [step, setStep] = useState<Step>(0);
  const [selectedSpace, setSelectedSpace] = useState<ThirdSpace | null>(null);
  const [isExistingSpace, setIsExistingSpace] = useState(false);
  const [ratings, setRatings] = useState<RatingFormData>(() => createInitialRatings());
  const [knownSpaces, setKnownSpaces] = useState<SpaceWithAttributes[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchScope, setSearchScope] = useState<SearchScope>('nearby');
  const [userCoordinate, setUserCoordinate] = useState<LatLng | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pinCoordinate, setPinCoordinate] = useState<LatLng | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isSecret, setIsSecret] = useState(false);
  const [areaHint, setAreaHint] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [withGroupIds, setWithGroupIds] = useState<string[]>([]);
  const [withPeople, setWithPeople] = useState<Profile[]>([]);
  const [showWithPeople, setShowWithPeople] = useState(false);
  const [spacesRated, setSpacesRated] = useState(0);
  const [ownedSecretCount, setOwnedSecretCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ name: string; isSecret: boolean; before: VibeProgress; after: VibeProgress } | null>(null);

  const categoryConfig = CATEGORY_CONFIG[ratings.category];
  const categoryMeta = CATEGORY_META[ratings.category];
  const overallScore = useMemo(() => calculateOverallScore(ratings.attribute_scores), [ratings.attribute_scores]);
  const secretSlotsRemaining = getSecretSlotsRemaining(spacesRated, ownedSecretCount);
  const currentTier = getVibeProgress(spacesRated).current;
  const nextSlotMilestone = VIBE_MILESTONES.find((milestone) => milestone.secretSlots > currentTier.secretSlots);

  const loadContext = useCallback(async () => {
    try {
      const [spaces, profile, secrets, groups, people] = await Promise.all([
        listSpaces({ viewerId: userId }),
        getProfile(userId),
        listSecretSpots(userId),
        listMyGroups(userId).catch(() => [] as Group[]),
        listSocialProfiles('following', userId).catch(() => [] as Profile[]),
      ]);
      setKnownSpaces(spaces);
      setSpacesRated(profile.stats.spaces_rated);
      setOwnedSecretCount(secrets.filter((spot) => spot.access === 'owner').length);
      setMyGroups(groups);
      setFollowing(people.filter((person) => person.user_id !== userId));
    } catch {
      // The flow still works with OpenStreetMap search if known spaces fail to load.
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadContext();
    }, [loadContext])
  );

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (status !== 'granted') return;
        const position = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({});
        if (!position) return;
        const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserCoordinate(coordinate);
        mapCenterRef.current = coordinate;
        mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: DEFAULT_REGION.latitudeDelta, longitudeDelta: DEFAULT_REGION.longitudeDelta }, 0);
      })
      .catch(() => undefined);
  }, []);

  const selectExistingSpace = useCallback((space: SpaceWithAttributes) => {
    setSelectedSpace(space);
    setIsExistingSpace(true);
    setIsSecret(false);
    setRatings({
      ...createInitialRatings(space.category),
      primary_purpose: normalizePurposeForCategory(space.category, space.primary_purpose),
    });
    setSearchQuery(space.name);
    setSuggestions([]);
    const coordinate = { latitude: space.latitude, longitude: space.longitude };
    setPinCoordinate(coordinate);
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 }, 300);
  }, []);

  useEffect(() => {
    if (!params.spaceId || knownSpaces.length === 0) return;
    const space = knownSpaces.find((item) => item.id === params.spaceId);
    if (space) {
      setResult(null);
      selectExistingSpace(space);
      setStep(2);
    }
    router.setParams({ spaceId: undefined } as never);
  }, [knownSpaces, params.spaceId, selectExistingSpace]);

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
        const origin = userCoordinate || mapCenterRef.current;
        const fetchPlaces = async (bounded: boolean, limit: number) => {
          const response = await fetch(
            'https://nominatim.openstreetmap.org/search?format=json'
              + `&limit=${limit}&viewbox=${buildViewbox(origin, NEARBY_RADIUS_MILES)}&bounded=${bounded ? 1 : 0}`
              + `&q=${encodeURIComponent(trimmedQuery)}`,
            { headers: NOMINATIM_HEADERS, signal: abortController.signal }
          );
          if (!response.ok) throw new Error('Search request failed');
          return (await response.json()) as NominatimSearchResult[];
        };
        const withDistance = (results: NominatimSearchResult[]): PlaceSuggestion[] => results.map((result) => {
          const distance = calculateDistanceMiles(origin, { latitude: Number(result.lat), longitude: Number(result.lon) });
          return { ...result, distance, isFar: distance > NEARBY_RADIUS_MILES };
        });

        let results = searchScope === 'nearby'
          ? withDistance(await fetchPlaces(true, 8)).sort((first, second) => first.distance - second.distance)
          : withDistance(await fetchPlaces(false, 8));

        if (searchScope === 'nearby' && results.length < 3) {
          const seen = new Set(results.map((result) => result.place_id));
          const wider = withDistance(await fetchPlaces(false, 5)).filter((result) => !seen.has(result.place_id));
          results = [...results, ...wider];
        }

        setSuggestions(results);
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
  }, [searchQuery, searchScope, selectedSpace?.name, userCoordinate]);

  const knownMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2 || selectedSpace?.name.toLowerCase() === query) return [];
    return rankSearchResults(
      knownSpaces,
      query,
      (space) => ({ name: space.name, category: space.category, purpose: space.primary_purpose, address: space.address }),
      (space) => space,
      userCoordinate || { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude }
    ).slice(0, 3);
  }, [knownSpaces, searchQuery, selectedSpace?.name, userCoordinate]);

  const buildDraftSpace = (name: string, address: string, coordinate: LatLng): ThirdSpace => {
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

  const selectDraftSpace = (space: ThirdSpace) => {
    setSelectedSpace(space);
    setIsExistingSpace(false);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const coordinate = { latitude: Number(suggestion.lat), longitude: Number(suggestion.lon) };
    const name = suggestion.name || suggestion.display_name.split(',')[0] || 'Selected Location';

    selectDraftSpace(buildDraftSpace(name, suggestion.display_name, coordinate));
    setPinCoordinate(coordinate);
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 }, 300);
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

      const place = (await response.json()) as NominatimReverseResult;
      const address = place.display_name || `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
      const name = place.name || address.split(',')[0] || 'Dropped Pin';

      selectDraftSpace(buildDraftSpace(name, address, coordinate));
      setSearchQuery(name);
    } catch {
      selectDraftSpace(buildDraftSpace('Dropped Pin', `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`, coordinate));
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleMapPress = (event: MapPressEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    setPinCoordinate(coordinate);
    reverseGeocodeCoordinate(coordinate);
  };

  const handleMarkerDragEnd = (event: MarkerDragStartEndEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    setPinCoordinate(coordinate);
    reverseGeocodeCoordinate(coordinate);
  };

  const clearPlace = () => {
    setSelectedSpace(null);
    setIsExistingSpace(false);
    setPinCoordinate(null);
    setSearchQuery('');
    setRatings(createInitialRatings());
    setPhotos([]);
    setWithGroupIds([]);
    setWithPeople([]);
  };

  const selectCategory = (category: SpaceCategory) => {
    setRatings((prev) => ({
      ...createInitialRatings(category),
      review_text: prev.review_text,
    }));
    setSelectedSpace((prev) => prev ? { ...prev, category, primary_purpose: CATEGORY_CONFIG[category].purposes[0] } : prev);
  };

  const selectPurpose = (primaryPurpose: CategoryPurpose) => {
    const normalizedPurpose = normalizePurposeForCategory(ratings.category, primaryPurpose);
    setRatings((prev) => ({ ...prev, primary_purpose: normalizedPurpose }));
    setSelectedSpace((prev) => prev ? { ...prev, primary_purpose: normalizedPurpose } : prev);
  };

  const goToStep = (nextStep: Step) => {
    setStep(nextStep);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const goBack = () => {
    if (step === 2 && isExistingSpace) goToStep(0);
    else if (step > 0) goToStep((step - 1) as Step);
  };

  const goNext = () => {
    if (step === 0) goToStep(isExistingSpace ? 2 : 1);
    else if (step === 1) goToStep(2);
    else handleSubmitRating();
  };

  const resetFlow = () => {
    clearPlace();
    setIsSecret(false);
    setAreaHint('');
    setResult(null);
    goToStep(0);
  };

  const handleSubmitRating = async () => {
    if (isSupabaseConfigured && !user) {
      Alert.alert('Sign in to rate', 'Create an account or sign in so your rating is saved.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/auth' as never) },
      ]);
      return;
    }

    if (!selectedSpace) {
      goToStep(0);
      return;
    }

    setIsSubmitting(true);
    try {
      const shouldBeSecret = isSecret && !isExistingSpace;
      const before = getVibeProgress(spacesRated);
      const { failedPhotos, failedTags } = await submitRating(userId, {
        space: selectedSpace,
        rating: ratings,
        secret: shouldBeSecret ? { area_hint: areaHint } : undefined,
        photos,
        companionIds: withPeople.map((person) => person.user_id),
        groupIds: withGroupIds,
      });
      if (failedPhotos > 0) {
        Alert.alert(
          'Some photos did not upload',
          `Your rating was posted, but ${failedPhotos} ${failedPhotos === 1 ? 'photo' : 'photos'} could not be saved.`
        );
      }
      if (failedTags) {
        Alert.alert('Tags were not saved', 'Your rating was posted, but the people or groups you tagged could not be saved. Run review-tags.sql if you have not yet.');
      }
      const profile = await getProfile(userId);
      setSpacesRated(profile.stats.spaces_rated);
      if (shouldBeSecret) setOwnedSecretCount((count) => count + 1);
      setResult({
        name: selectedSpace.name,
        isSecret: shouldBeSecret,
        before,
        after: getVibeProgress(profile.stats.spaces_rated),
      });
    } catch {
      Alert.alert('Error', 'Could not submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    const unlockedMilestone = result.after.current.threshold > result.before.current.threshold ? result.after.current : null;
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 24 }}>
          <View className="items-center px-4">
            <View className={`w-16 h-16 rounded-full items-center justify-center ${result.isSecret ? 'bg-secret/10' : 'bg-success-soft'}`}>
              {result.isSecret ? <KeyRound size={28} color={colors.secret} /> : <Check size={30} color={colors.success} strokeWidth={2.5} />}
            </View>
            <Text className="text-[26px] font-bold text-ink tracking-tight mt-5 text-center">
              {result.isSecret ? 'Secret spot saved' : 'Spot rated'}
            </Text>
            <Text className="text-[15px] text-muted text-center mt-1.5 leading-[22px]">
              {result.isSecret
                ? `${result.name} is hidden from the map and feed. People have to ask you or trade to see it.`
                : `Thanks for putting ${result.name} on the map.`}
            </Text>
          </View>

          {unlockedMilestone ? (
            <View className="bg-surface rounded-2xl p-5 mt-8">
              <Text className="text-[13px] font-medium text-secret">Milestone unlocked</Text>
              <Text className="text-[20px] font-bold text-ink tracking-tight mt-1">{unlockedMilestone.name}</Text>
              <Text className="text-[15px] text-body mt-1 leading-[22px]">{unlockedMilestone.description}</Text>
              <View className="bg-fill rounded-xl px-3.5 py-1.5 mt-4">
                {unlockedMilestone.perks.map((perk) => (
                  <View key={perk} className="flex-row items-center py-1.5">
                    <CircleCheck size={16} color={colors.success} />
                    <Text className="text-[15px] text-body ml-2.5 flex-1">{perk}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : result.after.next ? (
            <View className="bg-surface rounded-2xl p-5 mt-8">
              <Text className="text-[13px] font-medium text-muted">Next milestone</Text>
              <Text className="text-[18px] font-semibold text-ink mt-0.5">{result.after.next.name}</Text>
              <View className="mt-3">
                <ProgressBar progress={result.after.progress} color={colors.ink} />
              </View>
              <Text className="text-[13px] text-muted mt-2 leading-[18px]">
                {result.after.remaining} more {result.after.remaining === 1 ? 'spot' : 'spots'} to unlock: {result.after.next.perks[0]}
              </Text>
            </View>
          ) : null}

          <View className="mt-8 gap-3">
            <PrimaryButton label="Rate another spot" icon={Plus} onPress={resetFlow} />
            <PrimaryButton
              tone="neutral"
              label={result.isSecret ? 'See my secret spots' : 'See it in the feed'}
              onPress={() => {
                resetFlow();
                router.push((result.isSecret ? '/profile' : '/') as never);
              }}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const canContinue = step === 0 ? Boolean(selectedSpace) && !isReverseGeocoding : true;
  const visibleStepIndex = step;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="px-5 pt-3 pb-5">
          <View className="flex-row items-center justify-between h-6">
            <Text className="text-[13px] font-medium text-muted">
              Step {visibleStepIndex + 1} of 3
            </Text>
            {selectedSpace && (
              <TouchableOpacity onPress={resetFlow} activeOpacity={0.6} hitSlop={8}>
                <Text className="text-[15px] font-medium text-primary">Start over</Text>
              </TouchableOpacity>
            )}
          </View>
          <View className="flex-row gap-1.5 mt-2">
            {STEPS.map((_, index) => (
              <View
                key={index}
                className={`flex-1 h-1 rounded-full ${index <= step ? 'bg-ink' : 'bg-fill-strong'}`}
              />
            ))}
          </View>
          <Text className="text-[26px] font-bold text-ink tracking-tight mt-4">{STEPS[step].title}</Text>
          <Text className="text-[15px] text-muted mt-1 leading-5">{STEPS[step].subtitle}</Text>
        </View>

        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <View className="bg-surface rounded-xl px-4 h-12 flex-row items-center">
                <Search size={18} color={colors.muted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search a cafe, park, court..."
                  placeholderTextColor={colors.subtle}
                  keyboardAppearance={scheme}
                  autoCapitalize="words"
                  autoCorrect={false}
                  className="flex-1 ml-2.5 text-[16px] text-ink"
                />
                {isSearching && <ActivityIndicator size="small" color={colors.muted} />}
                {!isSearching && searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={clearPlace}
                    accessibilityLabel="Clear"
                    hitSlop={8}
                    className="w-6 h-6 rounded-full bg-fill items-center justify-center"
                  >
                    <X size={14} color={colors.muted} strokeWidth={2.5} />
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row items-center gap-2 mt-3">
                <Chip
                  label={userCoordinate ? 'Near me' : 'Near map area'}
                  icon={LocateFixed}
                  selected={searchScope === 'nearby'}
                  onPress={() => setSearchScope('nearby')}
                />
                <Chip
                  label="Anywhere"
                  icon={Globe}
                  selected={searchScope === 'anywhere'}
                  onPress={() => setSearchScope('anywhere')}
                />
              </View>

              {(knownMatches.length > 0 || suggestions.length > 0 || searchError) && (
                <View className="bg-surface rounded-2xl mt-3 pb-1 overflow-hidden">
                  {knownMatches.length > 0 && (
                    <Text className="px-4 pt-3 pb-1 text-[13px] font-medium text-muted">On Third Space</Text>
                  )}
                  {knownMatches.map((space, index) => (
                    <View key={space.id}>
                      {index > 0 && <View className="h-px bg-line-soft ml-16" />}
                      <TouchableOpacity
                        onPress={() => selectExistingSpace(space)}
                        className="px-4 py-2.5 flex-row items-center"
                        activeOpacity={0.6}
                      >
                        <CategoryIcon category={space.category} size={36} />
                        <View className="flex-1 ml-3">
                          <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{space.name}</Text>
                          <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{space.address}</Text>
                        </View>
                        {space.attributes && <ScorePill score={space.attributes.overall_score} size="sm" />}
                      </TouchableOpacity>
                    </View>
                  ))}
                  {suggestions.length > 0 && (
                    <Text className={`px-4 pb-1 text-[13px] font-medium text-muted ${knownMatches.length > 0 ? 'pt-4' : 'pt-3'}`}>New place</Text>
                  )}
                  {searchError && <Text className="px-4 py-3 text-[14px] text-danger">{searchError}</Text>}
                  {suggestions.map((suggestion, index) => {
                    const startsFarGroup = suggestion.isFar && !suggestions[index - 1]?.isFar && searchScope === 'nearby';
                    return (
                      <React.Fragment key={suggestion.place_id}>
                        {startsFarGroup && (
                          <Text className="px-4 pt-4 pb-1 text-[13px] font-medium text-muted">Farther away</Text>
                        )}
                        {index > 0 && !startsFarGroup && <View className="h-px bg-line-soft ml-16" />}
                        <TouchableOpacity
                          onPress={() => handleSelectSuggestion(suggestion)}
                          className="px-4 py-2.5 flex-row items-center"
                          activeOpacity={0.6}
                        >
                          <View className="w-9 h-9 rounded-[10px] bg-fill items-center justify-center">
                            <MapPin size={17} color={colors.muted} />
                          </View>
                          <View className="flex-1 ml-3">
                            <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>
                              {suggestion.name || suggestion.display_name.split(',')[0]}
                            </Text>
                            <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{suggestion.display_name}</Text>
                          </View>
                          <Text className="text-[13px] text-muted ml-2">{formatDistance(suggestion.distance)}</Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}

              <Text className="text-[13px] font-medium text-muted px-4 mt-6 mb-1.5">Or drop a pin</Text>
              <View className="rounded-2xl overflow-hidden bg-surface">
                <MapView
                  ref={mapRef}
                  style={{ height: 240 }}
                  userInterfaceStyle={scheme}
                  initialRegion={DEFAULT_REGION}
                  onPress={handleMapPress}
                  onRegionChangeComplete={(region) => {
                    mapCenterRef.current = { latitude: region.latitude, longitude: region.longitude };
                  }}
                >
                  {pinCoordinate && (
                    <Marker coordinate={pinCoordinate} draggable onDragEnd={handleMarkerDragEnd} pinColor={colors.primary} />
                  )}
                </MapView>
                <View className="px-4 py-3 flex-row items-center">
                  {isReverseGeocoding ? <ActivityIndicator size="small" color={colors.muted} /> : <MapPin size={14} color={colors.subtle} />}
                  <Text className="text-[13px] text-muted ml-1.5 flex-1">
                    {isReverseGeocoding ? 'Finding the address...' : 'Tap anywhere to drop a pin. Drag it to fine-tune.'}
                  </Text>
                </View>
              </View>

              {selectedSpace && (
                <>
                  <Text className="text-[13px] font-medium text-muted px-4 mt-6 mb-1.5">Selected place</Text>
                  <View className="bg-surface rounded-2xl p-4 flex-row items-center">
                    <View className="w-9 h-9 rounded-full bg-ink items-center justify-center">
                      <Check size={18} color={colors.canvas} strokeWidth={2.5} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{selectedSpace.name}</Text>
                      <Text className="text-[13px] text-muted mt-0.5 leading-[18px]" numberOfLines={2}>{selectedSpace.address}</Text>
                    </View>
                  </View>
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <View className="flex-row flex-wrap -mx-1">
                {SPACE_CATEGORIES.map((category) => {
                  const meta = CATEGORY_META[category];
                  const isSelected = ratings.category === category;
                  return (
                    <View key={category} style={{ width: '50%' }} className="p-1">
                      <TouchableOpacity
                        onPress={() => selectCategory(category)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        style={{ backgroundColor: isSelected ? meta.tint : colors.surface }}
                        className="rounded-2xl p-3.5"
                      >
                        <View className="flex-row items-start justify-between">
                          <CategoryIcon category={category} size={36} />
                          {isSelected && (
                            <View style={{ backgroundColor: meta.color }} className="w-5 h-5 rounded-full items-center justify-center">
                              <Check size={12} color="white" strokeWidth={3} />
                            </View>
                          )}
                        </View>
                        <Text className="text-[16px] font-semibold text-ink mt-3">{meta.short}</Text>
                        <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{meta.blurb}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <Text className="text-[18px] font-semibold text-ink mt-8">What's it best for?</Text>
              <Text className="text-[14px] text-muted mt-1 mb-3 leading-5">This helps people find the right spot for what they want to do.</Text>
              <View className="flex-row flex-wrap gap-2">
                {categoryConfig.purposes.map((purpose) => (
                  <Chip
                    key={purpose}
                    label={purpose}
                    selected={ratings.primary_purpose === purpose}
                    onPress={() => selectPurpose(purpose)}
                  />
                ))}
              </View>
            </>
          )}

          {step === 2 && selectedSpace && (
            <>
              <View className="bg-surface rounded-2xl p-3.5 flex-row items-center mb-6">
                <CategoryIcon category={ratings.category} size={44} />
                <View className="flex-1 mx-3">
                  <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{selectedSpace.name}</Text>
                  <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{categoryMeta.short} · {ratings.primary_purpose}</Text>
                </View>
                <View className="items-center">
                  <ScorePill score={overallScore} />
                  <Text className="text-[11px] text-subtle mt-1">Overall</Text>
                </View>
              </View>

              {isExistingSpace && (
                <>
                  <Text className="text-[13px] font-medium text-muted px-4 mb-1.5">Went here for</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-6">
                    {categoryConfig.purposes.map((purpose) => (
                      <Chip
                        key={purpose}
                        label={purpose}
                        selected={ratings.primary_purpose === purpose}
                        onPress={() => selectPurpose(purpose)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}

              <Text className="text-[13px] font-medium text-muted px-4 mb-1.5">Scores</Text>
              <View className="bg-surface rounded-2xl p-4 pb-0">
                {categoryConfig.attributes.map((attribute) => (
                  <VibeSlider
                    key={attribute.key}
                    label={attribute.label}
                    description={attribute.description}
                    value={ratings.attribute_scores[attribute.key] || 3}
                    onValueChange={(value) => setRatings((prev) => ({
                      ...prev,
                      attribute_scores: { ...prev.attribute_scores, [attribute.key]: value },
                    }))}
                    disabled={isSubmitting}
                    color={categoryMeta.color}
                  />
                ))}
              </View>

              <Text className="text-[18px] font-semibold text-ink mt-8 mb-3">Anything people should know?</Text>
              <TextInput
                value={ratings.review_text}
                onChangeText={(review_text) => setRatings((prev) => ({ ...prev, review_text }))}
                placeholder="Best time to go, what to order, where to sit..."
                placeholderTextColor={colors.subtle}
                keyboardAppearance={scheme}
                multiline
                className="bg-surface rounded-xl px-4 py-3 min-h-[96px] text-[16px] text-ink leading-[22px]"
                textAlignVertical="top"
              />

              <Text className="text-[18px] font-semibold text-ink mt-8">Who were you with?</Text>
              <Text className="text-[14px] text-muted mt-1 mb-3 leading-5">Friends and public groups show on the post for everyone, like a tag on a photo. A private group only shows for people in that group.</Text>
              {myGroups.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3">
                  {myGroups.map((group) => (
                    <Chip
                      key={group.id}
                      label={group.visibility === 'private' ? `${group.name} · private` : group.name}
                      icon={UsersRound}
                      selected={withGroupIds.includes(group.id)}
                      onPress={() => setWithGroupIds((current) => current.includes(group.id)
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id])}
                    />
                  ))}
                </ScrollView>
              )}
              {myGroups.some((group) => withGroupIds.includes(group.id) && group.visibility === 'private') && (
                <Text className="text-[13px] text-muted mb-3 px-1 leading-[18px]">
                  {myGroups.filter((group) => withGroupIds.includes(group.id) && group.visibility === 'private').map((group) => group.name).join(', ')} won't show for anyone who isn't in that group.
                </Text>
              )}
              <TouchableOpacity
                onPress={() => setShowWithPeople(true)}
                activeOpacity={0.6}
                className="bg-surface rounded-2xl px-4 min-h-[52px] py-2.5 flex-row items-center"
              >
                {withPeople.length === 0 ? (
                  <UserPlus size={18} color={colors.ink} />
                ) : (
                  <View className="flex-row">
                    {withPeople.slice(0, 3).map((person, index) => (
                      <View
                        key={person.user_id}
                        style={{ marginLeft: index === 0 ? 0 : -8, borderColor: colors.surface }}
                        className="rounded-full border-2"
                      >
                        <Avatar name={getDisplayName(person)} uri={person.avatar_url} size={26} />
                      </View>
                    ))}
                  </View>
                )}
                <Text className="text-[16px] text-ink ml-3 flex-1" numberOfLines={1}>
                  {withPeople.length === 0
                    ? 'Add friends'
                    : withPeople.map((person) => getDisplayName(person)).join(', ')}
                </Text>
                <ChevronRight size={18} color={colors.faint} />
              </TouchableOpacity>

              <Text className="text-[18px] font-semibold text-ink mt-8">Add photos</Text>
              <Text className="text-[14px] text-muted mt-1 mb-3 leading-5">
                Up to {MAX_PHOTOS_PER_POST}. They'll show up on this spot's page.
              </Text>
              <PhotoPickerRow photos={photos} onChange={setPhotos} disabled={isSubmitting} />

              {!isExistingSpace && (
                <View className="bg-surface rounded-2xl p-4 mt-8">
                  <View className="flex-row items-center">
                    <View className={`w-10 h-10 rounded-xl items-center justify-center ${isSecret ? 'bg-secret/10' : 'bg-fill'}`}>
                      <KeyRound size={18} color={isSecret ? colors.secret : colors.muted} />
                    </View>
                    <View className="flex-1 mx-3">
                      <Text className="text-[16px] font-semibold text-ink">Gatekeeper mode</Text>
                      <Text className="text-[13px] text-muted mt-0.5">
                        {secretSlotsRemaining > 0
                          ? `${Number.isFinite(secretSlotsRemaining) ? secretSlotsRemaining : 'Unlimited'} secret ${secretSlotsRemaining === 1 ? 'slot' : 'slots'} left`
                          : `No slots left. Reach ${nextSlotMilestone?.name ?? 'the next milestone'} for more.`}
                      </Text>
                    </View>
                    <Switch
                      value={isSecret}
                      onValueChange={setIsSecret}
                      disabled={secretSlotsRemaining <= 0 && !isSecret}
                      trackColor={{ true: colors.secret, false: colors.fillStrong }}
                      thumbColor="#ffffff"
                      ios_backgroundColor={colors.fillStrong}
                    />
                  </View>
                  <Text className="text-[14px] text-body mt-3 leading-5">
                    Keep this spot secret. It won't appear on the map or feed. Others only see a teaser and have to ask you or trade one of their spots to get in.
                  </Text>
                  {isSecret && (
                    <TextInput
                      value={areaHint}
                      onChangeText={setAreaHint}
                      placeholder="Teaser, e.g. 'Rosslyn, best sunset views'"
                      placeholderTextColor={colors.subtle}
                      keyboardAppearance={scheme}
                      maxLength={60}
                      className="mt-3 bg-fill rounded-xl px-4 h-12 text-[16px] text-ink"
                    />
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View className="px-4 pt-3 pb-3 bg-canvas border-t border-line-soft flex-row gap-2.5">
          {step > 0 && (
            <TouchableOpacity
              onPress={goBack}
              accessibilityLabel="Back"
              activeOpacity={0.8}
              className="w-[50px] h-[50px] rounded-xl bg-fill items-center justify-center"
            >
              <ArrowLeft size={20} color={colors.ink} />
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <PrimaryButton
              label={step === 2 ? (isSecret && !isExistingSpace ? 'Save secret spot' : 'Post rating') : 'Continue'}
              icon={step === 2 ? (isSecret && !isExistingSpace ? KeyRound : Send) : ArrowRight}
              tone={step === 2 && isSecret && !isExistingSpace ? 'secret' : 'primary'}
              disabled={!canContinue}
              loading={isSubmitting}
              onPress={goNext}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={showWithPeople}
        onClose={() => setShowWithPeople(false)}
        title="With friends"
        subtitle="People you follow. They can take their name off later."
        headerRight={(
          <TouchableOpacity
            onPress={() => setShowWithPeople(false)}
            accessibilityLabel="Done"
            hitSlop={8}
            className="h-8 px-1 mr-2 items-center justify-center"
          >
            <Text className="text-[16px] font-semibold text-primary">Done</Text>
          </TouchableOpacity>
        )}
      >
        {following.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No one to tag yet"
            body="Follow someone first, then you can tag them here."
          />
        ) : (
          <View className="bg-surface rounded-2xl overflow-hidden">
            {following.map((person, index) => {
              const selected = withPeople.some((item) => item.user_id === person.user_id);
              const name = getDisplayName(person);
              return (
                <View key={person.user_id}>
                  {index > 0 && <View className="h-px bg-line-soft ml-[68px]" />}
                  <View className="flex-row items-center px-4 py-2.5">
                    <TouchableOpacity
                      onPress={() => {
                        setShowWithPeople(false);
                        openProfile(person.user_id, userId);
                      }}
                      activeOpacity={0.6}
                      accessibilityLabel={`View ${name}'s profile`}
                    >
                      <Avatar name={name} uri={person.avatar_url} size={40} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setWithPeople((current) => selected
                        ? current.filter((item) => item.user_id !== person.user_id)
                        : [...current, person])}
                      activeOpacity={0.6}
                      accessibilityState={{ selected }}
                      className="ml-3 flex-1 flex-row items-center"
                    >
                      <View className="flex-1 pr-3">
                        <Text numberOfLines={1} className="text-[16px] font-semibold text-ink">{name}</Text>
                        {person.username ? <Text numberOfLines={1} className="text-[13px] text-muted mt-0.5">@{person.username}</Text> : null}
                      </View>
                      <View
                        style={selected ? { backgroundColor: colors.ink } : { borderWidth: 2, borderColor: colors.fillStrong }}
                        className="w-6 h-6 rounded-full items-center justify-center"
                      >
                        {selected && <Check size={14} color={colors.canvas} strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
}
