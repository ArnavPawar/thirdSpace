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
import { ArrowLeft, ArrowRight, Check, CircleCheck, Globe, KeyRound, LocateFixed, MapPin, Search, Send, Sparkles, X } from 'lucide-react-native';
import PhotoPickerRow from '@/components/PhotoPickerRow';
import VibeSlider from '@/components/VibeSlider';
import { CategoryIcon, Chip, PrimaryButton, ProgressBar, ScorePill } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getProfile, listSecretSpots, listSpaces, submitRating } from '@/lib/data';
import { formatDistance } from '@/lib/format';
import { buildViewbox, rankSearchResults } from '@/lib/search';
import { isSupabaseConfigured } from '@/lib/supabase';
import { CATEGORY_META, colors } from '@/lib/theme';
import {
  calculateDistanceMiles,
  calculateOverallScore,
  CATEGORY_CONFIG,
  createDefaultAttributeScores,
  MAX_PHOTOS_PER_POST,
  normalizePurposeForCategory,
  SPACE_CATEGORIES,
  type CategoryPurpose,
  type LocalPhoto,
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
  const { userId, user } = useAuth();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const scrollRef = useRef<ScrollView>(null);
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
      const [spaces, profile, secrets] = await Promise.all([
        listSpaces({ viewerId: userId }),
        getProfile(userId),
        listSecretSpots(userId),
      ]);
      setKnownSpaces(spaces);
      setSpacesRated(profile.stats.spaces_rated);
      setOwnedSecretCount(secrets.filter((spot) => spot.access === 'owner').length);
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
      const { failedPhotos } = await submitRating(userId, {
        space: selectedSpace,
        rating: ratings,
        secret: shouldBeSecret ? { area_hint: areaHint } : undefined,
        photos,
      });
      if (failedPhotos > 0) {
        Alert.alert(
          'Some photos did not upload',
          `Your rating was posted, but ${failedPhotos} ${failedPhotos === 1 ? 'photo' : 'photos'} could not be saved.`
        );
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
      <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 48 }}>
          <View className="items-center">
            <View className={`w-20 h-20 rounded-full items-center justify-center ${result.isSecret ? 'bg-secret' : 'bg-emerald-500'}`}>
              {result.isSecret ? <KeyRound size={36} color="white" /> : <Check size={40} color="white" />}
            </View>
            <Text className="text-[28px] font-extrabold text-ink mt-5 text-center">
              {result.isSecret ? 'Secret spot saved' : 'Spot rated!'}
            </Text>
            <Text className="text-slate-500 text-center mt-2 text-[15px] leading-5 px-4">
              {result.isSecret
                ? `${result.name} is hidden from the map and feed. People have to ask you or trade to see it.`
                : `Thanks for putting ${result.name} on the map.`}
            </Text>
          </View>

          {unlockedMilestone ? (
            <View className="bg-white rounded-3xl border-2 border-secret p-5 mt-8">
              <View className="flex-row items-center">
                <Sparkles size={18} color={colors.secret} />
                <Text className="text-secret font-bold ml-2 uppercase text-xs tracking-wider">Milestone unlocked</Text>
              </View>
              <Text className="text-2xl font-extrabold text-ink mt-2">{unlockedMilestone.name}</Text>
              <Text className="text-slate-500 mt-1">{unlockedMilestone.description}</Text>
              {unlockedMilestone.perks.map((perk) => (
                <View key={perk} className="flex-row items-center mt-2.5">
                  <CircleCheck size={16} color={colors.success} />
                  <Text className="text-slate-700 ml-2 flex-1">{perk}</Text>
                </View>
              ))}
            </View>
          ) : result.after.next ? (
            <View className="bg-white rounded-3xl border border-slate-200 p-5 mt-8">
              <Text className="text-sm text-slate-500">Next milestone</Text>
              <Text className="text-xl font-bold text-ink mt-0.5">{result.after.next.name}</Text>
              <View className="mt-3">
                <ProgressBar progress={result.after.progress} color={colors.secret} />
              </View>
              <Text className="text-sm text-slate-500 mt-2">
                {result.after.remaining} more {result.after.remaining === 1 ? 'spot' : 'spots'} to unlock: {result.after.next.perks[0]}
              </Text>
            </View>
          ) : null}

          <View className="mt-8 gap-3">
            <PrimaryButton label="Rate another spot" icon={Sparkles} onPress={resetFlow} />
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
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="px-5 pt-3 pb-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-primary uppercase tracking-wider">
              Step {visibleStepIndex + 1} of 3
            </Text>
            {selectedSpace && (
              <TouchableOpacity onPress={resetFlow} activeOpacity={0.7}>
                <Text className="text-sm font-semibold text-slate-400">Start over</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text className="text-[28px] font-extrabold text-ink tracking-tight mt-1">{STEPS[step].title}</Text>
          <Text className="text-[15px] text-slate-500 mt-1">{STEPS[step].subtitle}</Text>
          <View className="flex-row gap-1.5 mt-4">
            {STEPS.map((_, index) => (
              <View
                key={index}
                className={`flex-1 h-1.5 rounded-full ${index <= step ? 'bg-primary' : 'bg-slate-200'}`}
              />
            ))}
          </View>
        </View>

        <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <View className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] flex-row items-center">
                <Search size={18} color={colors.subtle} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search a cafe, park, court..."
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="words"
                  autoCorrect={false}
                  className="flex-1 ml-2 text-base text-ink"
                />
                {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
                {!isSearching && searchQuery.length > 0 && (
                  <TouchableOpacity onPress={clearPlace} accessibilityLabel="Clear">
                    <X size={18} color={colors.subtle} />
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row items-center gap-2 mt-2.5">
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
                <View className="bg-white border border-slate-200 rounded-2xl mt-2 overflow-hidden">
                  {knownMatches.length > 0 && (
                    <Text className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">On Third Space</Text>
                  )}
                  {knownMatches.map((space) => (
                    <TouchableOpacity
                      key={space.id}
                      onPress={() => selectExistingSpace(space)}
                      className="px-4 py-3 flex-row items-center border-b border-slate-100"
                      activeOpacity={0.7}
                    >
                      <CategoryIcon category={space.category} size={32} />
                      <View className="flex-1 ml-3">
                        <Text className="font-semibold text-ink" numberOfLines={1}>{space.name}</Text>
                        <Text className="text-xs text-slate-500" numberOfLines={1}>{space.address}</Text>
                      </View>
                      {space.attributes && <ScorePill score={space.attributes.overall_score} size="sm" />}
                    </TouchableOpacity>
                  ))}
                  {suggestions.length > 0 && (
                    <Text className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">New place</Text>
                  )}
                  {searchError && <Text className="p-4 text-sm text-rose-600">{searchError}</Text>}
                  {suggestions.map((suggestion, index) => (
                    <React.Fragment key={suggestion.place_id}>
                    {suggestion.isFar && !suggestions[index - 1]?.isFar && searchScope === 'nearby' && (
                      <Text className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Farther away
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => handleSelectSuggestion(suggestion)}
                      className={`px-4 py-3 flex-row items-center ${index < suggestions.length - 1 ? 'border-b border-slate-100' : ''}`}
                      activeOpacity={0.7}
                    >
                      <View className="w-8 h-8 rounded-lg bg-slate-100 items-center justify-center">
                        <MapPin size={16} color={colors.muted} />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="font-semibold text-ink" numberOfLines={1}>
                          {suggestion.name || suggestion.display_name.split(',')[0]}
                        </Text>
                        <Text className="text-xs text-slate-500" numberOfLines={1}>{suggestion.display_name}</Text>
                      </View>
                      <Text className="text-xs font-semibold text-slate-400 ml-2">{formatDistance(suggestion.distance)}</Text>
                    </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              )}

              <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-slate-200" />
                <Text className="mx-3 text-xs font-semibold text-slate-400">OR DROP A PIN</Text>
                <View className="flex-1 h-px bg-slate-200" />
              </View>

              <View className="rounded-3xl overflow-hidden border border-slate-200 bg-white">
                <MapView
                  ref={mapRef}
                  style={{ height: 240 }}
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
                  <MapPin size={14} color={colors.subtle} />
                  <Text className="text-[13px] text-slate-500 ml-1.5 flex-1">
                    {isReverseGeocoding ? 'Finding the address...' : 'Tap anywhere to drop a pin. Drag it to fine-tune.'}
                  </Text>
                </View>
              </View>

              {selectedSpace && (
                <View className="bg-white border-2 border-primary rounded-2xl p-4 mt-4 flex-row items-center">
                  <View className="w-9 h-9 rounded-full bg-primary items-center justify-center">
                    <Check size={18} color="white" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="font-bold text-ink" numberOfLines={1}>{selectedSpace.name}</Text>
                    <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>{selectedSpace.address}</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <View className="flex-row flex-wrap -mx-1.5">
                {SPACE_CATEGORIES.map((category) => {
                  const meta = CATEGORY_META[category];
                  const isSelected = ratings.category === category;
                  return (
                    <View key={category} style={{ width: '50%' }} className="p-1.5">
                      <TouchableOpacity
                        onPress={() => selectCategory(category)}
                        activeOpacity={0.8}
                        style={isSelected ? { borderColor: meta.color, backgroundColor: meta.tint } : undefined}
                        className={`rounded-2xl p-3.5 border-2 ${isSelected ? '' : 'bg-white border-slate-200'}`}
                      >
                        <CategoryIcon category={category} size={36} />
                        <Text className="font-bold text-ink mt-2.5">{meta.short}</Text>
                        <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{meta.blurb}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <Text className="text-[17px] font-bold text-ink mt-6 mb-1">What's it best for?</Text>
              <Text className="text-[13px] text-slate-500 mb-3">This helps people find the right spot for what they want to do.</Text>
              <View className="flex-row flex-wrap gap-2">
                {categoryConfig.purposes.map((purpose) => (
                  <Chip
                    key={purpose}
                    label={purpose}
                    selected={ratings.primary_purpose === purpose}
                    onPress={() => selectPurpose(purpose)}
                    color={categoryMeta.color}
                  />
                ))}
              </View>
            </>
          )}

          {step === 2 && selectedSpace && (
            <>
              <View className="bg-white rounded-2xl border border-slate-200 p-3.5 flex-row items-center mb-5">
                <CategoryIcon category={ratings.category} size={44} />
                <View className="flex-1 mx-3">
                  <Text className="font-bold text-ink" numberOfLines={1}>{selectedSpace.name}</Text>
                  <Text className="text-xs text-slate-500 mt-0.5">{categoryMeta.short} · {ratings.primary_purpose}</Text>
                </View>
                <View className="items-center">
                  <ScorePill score={overallScore} />
                  <Text className="text-[10px] text-slate-400 mt-1">overall</Text>
                </View>
              </View>

              {isExistingSpace && (
                <>
                  <Text className="text-[13px] font-semibold text-slate-500 mb-2">Went here for</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-5">
                    {categoryConfig.purposes.map((purpose) => (
                      <Chip
                        key={purpose}
                        label={purpose}
                        selected={ratings.primary_purpose === purpose}
                        onPress={() => selectPurpose(purpose)}
                        color={categoryMeta.color}
                      />
                    ))}
                  </ScrollView>
                </>
              )}

              <View className="bg-white rounded-3xl border border-slate-200 p-4 pb-0">
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

              <Text className="text-[15px] font-bold text-ink mt-5 mb-2">Anything people should know?</Text>
              <TextInput
                value={ratings.review_text}
                onChangeText={(review_text) => setRatings((prev) => ({ ...prev, review_text }))}
                placeholder="Best time to go, what to order, where to sit..."
                placeholderTextColor={colors.subtle}
                multiline
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[96px] text-base text-ink"
                textAlignVertical="top"
              />

              <Text className="text-[15px] font-bold text-ink mt-5">Add photos</Text>
              <Text className="text-[13px] text-slate-500 mt-0.5 mb-2">
                Up to {MAX_PHOTOS_PER_POST}. They'll show up on this spot's page.
              </Text>
              <PhotoPickerRow photos={photos} onChange={setPhotos} disabled={isSubmitting} />

              {!isExistingSpace && (
                <View className={`rounded-3xl p-4 mt-5 border-2 ${isSecret ? 'border-secret bg-secret/5' : 'border-slate-200 bg-white'}`}>
                  <View className="flex-row items-center">
                    <View className={`w-10 h-10 rounded-xl items-center justify-center ${isSecret ? 'bg-secret' : 'bg-slate-100'}`}>
                      <KeyRound size={20} color={isSecret ? 'white' : colors.muted} />
                    </View>
                    <View className="flex-1 mx-3">
                      <Text className="font-bold text-ink text-[15px]">Gatekeeper mode</Text>
                      <Text className="text-xs text-slate-500 mt-0.5">
                        {secretSlotsRemaining > 0
                          ? `${Number.isFinite(secretSlotsRemaining) ? secretSlotsRemaining : 'Unlimited'} secret ${secretSlotsRemaining === 1 ? 'slot' : 'slots'} left`
                          : `No slots left. Reach ${nextSlotMilestone?.name ?? 'the next milestone'} for more.`}
                      </Text>
                    </View>
                    <Switch
                      value={isSecret}
                      onValueChange={setIsSecret}
                      disabled={secretSlotsRemaining <= 0 && !isSecret}
                      trackColor={{ true: colors.secret, false: '#e2e8f0' }}
                    />
                  </View>
                  <Text className="text-[13px] text-slate-600 mt-3 leading-[18px]">
                    Keep this spot secret. It won't appear on the map or feed. Others only see a teaser and have to ask you or trade one of their spots to get in.
                  </Text>
                  {isSecret && (
                    <TextInput
                      value={areaHint}
                      onChangeText={setAreaHint}
                      placeholder="Teaser, e.g. 'Rosslyn, best sunset views'"
                      placeholderTextColor={colors.subtle}
                      maxLength={60}
                      className="mt-3 bg-white border border-secret/30 rounded-xl px-4 h-11 text-[15px] text-ink"
                    />
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View className="px-5 pt-3 pb-3 bg-white border-t border-slate-200 flex-row gap-3">
          {step > 0 && (
            <TouchableOpacity
              onPress={goBack}
              accessibilityLabel="Back"
              activeOpacity={0.8}
              className="w-[52px] h-[52px] rounded-2xl bg-slate-100 items-center justify-center"
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
    </SafeAreaView>
  );
}
