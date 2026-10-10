import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { LatLng, MapPressEvent, MarkerDragStartEndEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Check, Globe, LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { CategoryIcon, Chip, ScorePill } from '@/components/ui';
import { listSpaces } from '@/lib/data';
import { formatDistance } from '@/lib/format';
import { buildViewbox, rankSearchResults } from '@/lib/search';
import { CATEGORY_META, colors } from '@/lib/theme';
import { calculateDistanceMiles, CATEGORY_CONFIG, type SpaceWithAttributes, type ThirdSpace } from '@/types/space';

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

type PlaceSuggestion = NominatimSearchResult & { distance: number; isFar: boolean };
type SearchScope = 'nearby' | 'anywhere';

const NEARBY_RADIUS_MILES = 15;
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

export interface PickedPlace {
  space: ThirdSpace;
  existing: boolean;
}

export default function PlacePicker({
  userId,
  presetSpaceId,
  initialCoordinate,
  onPlaceChange,
}: {
  userId: string;
  presetSpaceId?: string;
  initialCoordinate?: LatLng | null;
  onPlaceChange: (place: PickedPlace | null) => void;
}) {
  const mapRef = useRef<MapView>(null);
  const mapCenterRef = useRef<LatLng>({ latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });
  const didApplyPreset = useRef(false);
  const didReverse = useRef(false);
  const [knownSpaces, setKnownSpaces] = useState<SpaceWithAttributes[]>([]);
  const [selected, setSelected] = useState<PickedPlace | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchScope, setSearchScope] = useState<SearchScope>('nearby');
  const [userCoordinate, setUserCoordinate] = useState<LatLng | null>(initialCoordinate ?? null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pinCoordinate, setPinCoordinate] = useState<LatLng | null>(initialCoordinate ?? null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [expanded, setExpanded] = useState(!presetSpaceId);

  const choose = useCallback((place: PickedPlace | null) => {
    setSelected(place);
    onPlaceChange(place);
  }, [onPlaceChange]);

  useEffect(() => {
    listSpaces({ viewerId: userId }).then(setKnownSpaces).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (status !== 'granted' || initialCoordinate) return;
        const position = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({});
        if (!position) return;
        const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserCoordinate(coordinate);
        mapCenterRef.current = coordinate;
        mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: DEFAULT_REGION.latitudeDelta, longitudeDelta: DEFAULT_REGION.longitudeDelta }, 0);
      })
      .catch(() => undefined);
  }, [initialCoordinate]);

  const selectExisting = useCallback((space: SpaceWithAttributes) => {
    choose({ space, existing: true });
    setSearchQuery(space.name);
    setSuggestions([]);
    setExpanded(false);
    const coordinate = { latitude: space.latitude, longitude: space.longitude };
    setPinCoordinate(coordinate);
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 }, 300);
  }, [choose]);

  const buildDraft = useCallback((name: string, address: string, coordinate: LatLng): ThirdSpace => {
    const timestamp = new Date().toISOString();
    return {
      id: `draft-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
      name,
      category: 'Cafe & Coworking',
      primary_purpose: CATEGORY_CONFIG['Cafe & Coworking'].purposes[0],
      address,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      created_at: timestamp,
      updated_at: timestamp,
    };
  }, []);

  const selectDraft = useCallback((space: ThirdSpace, coordinate: LatLng) => {
    const nearby = knownSpaces.find((item) => !item.is_secret && calculateDistanceMiles(coordinate, item) < 0.04 && (
      item.name.toLowerCase().includes(space.name.toLowerCase()) || space.name.toLowerCase().includes(item.name.toLowerCase())
    ));
    if (nearby) {
      selectExisting(nearby);
      return;
    }
    choose({ space, existing: false });
    setPinCoordinate(coordinate);
    setSearchQuery(space.name);
    setSuggestions([]);
  }, [choose, knownSpaces, selectExisting]);

  const reverseGeocode = useCallback(async (coordinate: LatLng) => {
    setIsReverseGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinate.latitude}&lon=${coordinate.longitude}`,
        { headers: NOMINATIM_HEADERS }
      );
      if (!response.ok) throw new Error('Reverse geocode request failed');
      const place = (await response.json()) as NominatimReverseResult;
      const address = place.display_name || `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
      const name = place.name || address.split(',')[0] || 'Dropped pin';
      selectDraft(buildDraft(name, address, coordinate), coordinate);
    } catch {
      selectDraft(buildDraft('Dropped pin', `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`, coordinate), coordinate);
    } finally {
      setIsReverseGeocoding(false);
    }
  }, [buildDraft, selectDraft]);

  useEffect(() => {
    if (!presetSpaceId || didApplyPreset.current || knownSpaces.length === 0) return;
    const space = knownSpaces.find((item) => item.id === presetSpaceId);
    if (!space) return;
    didApplyPreset.current = true;
    selectExisting(space);
  }, [knownSpaces, presetSpaceId, selectExisting]);

  useEffect(() => {
    if (!initialCoordinate || presetSpaceId || didReverse.current) return;
    didReverse.current = true;
    mapRef.current?.animateToRegion({ ...initialCoordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 }, 0);
    reverseGeocode(initialCoordinate);
  }, [initialCoordinate, presetSpaceId, reverseGeocode]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 3 || selected?.space.name === trimmedQuery) {
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
  }, [searchQuery, searchScope, selected?.space.name, userCoordinate]);

  const knownMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2 || selected?.space.name.toLowerCase() === query) return [];
    return rankSearchResults(
      knownSpaces.filter((space) => !space.is_secret),
      query,
      (space) => ({ name: space.name, category: space.category, purpose: space.primary_purpose, address: space.address }),
      (space) => space,
      userCoordinate || { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude }
    ).slice(0, 3);
  }, [knownSpaces, searchQuery, selected?.space.name, userCoordinate]);

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const coordinate = { latitude: Number(suggestion.lat), longitude: Number(suggestion.lon) };
    const name = suggestion.name || suggestion.display_name.split(',')[0] || 'Selected place';
    selectDraft(buildDraft(name, suggestion.display_name, coordinate), coordinate);
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 }, 300);
  };

  const clearPlace = () => {
    choose(null);
    setPinCoordinate(null);
    setSearchQuery('');
    setExpanded(true);
  };

  return (
    <View>
      {selected && !expanded ? (
        <View className="bg-white border-2 border-primary rounded-2xl p-4 flex-row items-center">
          <View className="w-9 h-9 rounded-full bg-primary items-center justify-center">
            <Check size={18} color="white" />
          </View>
          <View className="flex-1 ml-3">
            <Text className="font-bold text-ink" numberOfLines={1}>{selected.space.name}</Text>
            <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>
              {selected.existing ? selected.space.address : 'New place · drop saved with the hangout'}
            </Text>
          </View>
          <TouchableOpacity onPress={clearPlace} accessibilityLabel="Change place">
            <Text className="text-primary font-semibold text-sm">Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
            <Chip label={userCoordinate ? 'Near me' : 'Near map area'} icon={LocateFixed} selected={searchScope === 'nearby'} onPress={() => setSearchScope('nearby')} />
            <Chip label="Anywhere" icon={Globe} selected={searchScope === 'anywhere'} onPress={() => setSearchScope('anywhere')} />
          </View>

          {(knownMatches.length > 0 || suggestions.length > 0 || searchError) && (
            <View className="bg-white border border-slate-200 rounded-2xl mt-2 overflow-hidden">
              {knownMatches.length > 0 && (
                <Text className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">On Third Space</Text>
              )}
              {knownMatches.map((space) => (
                <TouchableOpacity key={space.id} onPress={() => selectExisting(space)} className="px-4 py-3 flex-row items-center border-b border-slate-100" activeOpacity={0.7}>
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
                <TouchableOpacity
                  key={suggestion.place_id}
                  onPress={() => handleSelectSuggestion(suggestion)}
                  className={`px-4 py-3 flex-row items-center ${index < suggestions.length - 1 ? 'border-b border-slate-100' : ''}`}
                  activeOpacity={0.7}
                >
                  <View className="w-8 h-8 rounded-lg bg-slate-100 items-center justify-center">
                    <MapPin size={16} color={colors.muted} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold text-ink" numberOfLines={1}>{suggestion.name || suggestion.display_name.split(',')[0]}</Text>
                    <Text className="text-xs text-slate-500" numberOfLines={1}>{suggestion.display_name}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-slate-400 ml-2">{formatDistance(suggestion.distance)}</Text>
                </TouchableOpacity>
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
              style={{ height: 220 }}
              initialRegion={initialCoordinate ? { ...initialCoordinate, latitudeDelta: 0.012, longitudeDelta: 0.008 } : DEFAULT_REGION}
              onPress={(event: MapPressEvent) => {
                const coordinate = event.nativeEvent.coordinate;
                setPinCoordinate(coordinate);
                reverseGeocode(coordinate);
              }}
              onRegionChangeComplete={(region) => {
                mapCenterRef.current = { latitude: region.latitude, longitude: region.longitude };
              }}
            >
              {pinCoordinate && (
                <Marker
                  coordinate={pinCoordinate}
                  draggable
                  pinColor={colors.primary}
                  onDragEnd={(event: MarkerDragStartEndEvent) => {
                    const coordinate = event.nativeEvent.coordinate;
                    setPinCoordinate(coordinate);
                    reverseGeocode(coordinate);
                  }}
                />
              )}
            </MapView>
            <View className="px-4 py-3 flex-row items-center">
              <MapPin size={14} color={colors.subtle} />
              <Text className="text-[13px] text-slate-500 ml-1.5 flex-1">
                {isReverseGeocoding ? 'Finding the address...' : 'Tap the map to drop a pin. Drag it to fine-tune.'}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
