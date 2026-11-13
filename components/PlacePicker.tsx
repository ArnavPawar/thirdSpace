import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { LatLng, MapPressEvent, MarkerDragStartEndEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Globe, LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { CategoryIcon, Chip, ScorePill } from '@/components/ui';
import { cityFromAddress, type NominatimAddress } from '@/lib/cities';
import { listSpaces } from '@/lib/data';
import { formatDistance } from '@/lib/format';
import { buildViewbox, rankSearchResults } from '@/lib/search';
import { useColors, useColorSchemeName } from '@/lib/theme';
import { calculateDistanceMiles, CATEGORY_CONFIG, type SpaceWithAttributes, type ThirdSpace } from '@/types/space';

interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: NominatimAddress;
}

interface NominatimReverseResult {
  display_name?: string;
  name?: string;
  address?: NominatimAddress;
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
  const colors = useColors();
  const scheme = useColorSchemeName();
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

  const buildDraft = useCallback((name: string, address: string, coordinate: LatLng, city?: string): ThirdSpace => {
    const timestamp = new Date().toISOString();
    return {
      id: `draft-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
      name,
      category: 'Cafe & Coworking',
      primary_purpose: CATEGORY_CONFIG['Cafe & Coworking'].purposes[0],
      address,
      city,
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
      selectDraft(buildDraft(name, address, coordinate, cityFromAddress(place.address)), coordinate);
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
            'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1'
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

  const selectedName = selected?.space.name;
  const knownMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2 || selectedName?.toLowerCase() === query) return [];
    return rankSearchResults(
      knownSpaces.filter((space) => !space.is_secret),
      query,
      (space) => ({ name: space.name, category: space.category, purpose: space.primary_purpose, address: space.address }),
      (space) => space,
      userCoordinate || { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude }
    ).slice(0, 3);
  }, [knownSpaces, searchQuery, selectedName, userCoordinate]);

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const coordinate = { latitude: Number(suggestion.lat), longitude: Number(suggestion.lon) };
    const name = suggestion.name || suggestion.display_name.split(',')[0] || 'Selected place';
    selectDraft(buildDraft(name, suggestion.display_name, coordinate, cityFromAddress(suggestion.address)), coordinate);
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
        <View className="bg-surface rounded-2xl p-3.5 flex-row items-center">
          {selected.existing ? (
            <CategoryIcon category={selected.space.category} size={40} />
          ) : (
            <View className="w-10 h-10 rounded-xl bg-fill items-center justify-center">
              <MapPin size={18} color={colors.ink} />
            </View>
          )}
          <View className="flex-1 ml-3">
            <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>{selected.space.name}</Text>
            <Text className="text-[13px] text-muted mt-0.5" numberOfLines={2}>
              {selected.existing ? selected.space.address : 'New place · drop saved with the hangout'}
            </Text>
          </View>
          <TouchableOpacity onPress={clearPlace} accessibilityLabel="Change place" hitSlop={8} className="ml-2">
            <Text className="text-primary font-medium text-[15px]">Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View className="bg-surface rounded-xl px-4 h-12 flex-row items-center">
            <Search size={18} color={colors.subtle} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search a cafe, park, court..."
              placeholderTextColor={colors.subtle}
              keyboardAppearance={scheme}
              autoCapitalize="words"
              autoCorrect={false}
              className="flex-1 ml-2 text-[16px] text-ink"
            />
            {isSearching && <ActivityIndicator size="small" color={colors.muted} />}
            {!isSearching && searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearPlace} accessibilityLabel="Clear" hitSlop={8}>
                <X size={18} color={colors.subtle} />
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-row items-center gap-2 mt-2.5">
            <Chip label={userCoordinate ? 'Near me' : 'Near map area'} icon={LocateFixed} selected={searchScope === 'nearby'} onPress={() => setSearchScope('nearby')} />
            <Chip label="Anywhere" icon={Globe} selected={searchScope === 'anywhere'} onPress={() => setSearchScope('anywhere')} />
          </View>

          {(knownMatches.length > 0 || suggestions.length > 0 || searchError) && (
            <View className="bg-surface rounded-2xl mt-3 overflow-hidden">
              {knownMatches.length > 0 && (
                <Text className="px-4 pt-3 pb-1 text-[13px] font-medium text-muted">On Third Space</Text>
              )}
              {knownMatches.map((space, index) => (
                <View key={space.id}>
                  {index > 0 && <View className="h-px bg-line-soft ml-[60px]" />}
                  <TouchableOpacity onPress={() => selectExisting(space)} className="px-4 py-2.5 flex-row items-center" activeOpacity={0.6}>
                    <CategoryIcon category={space.category} size={32} />
                    <View className="flex-1 ml-3">
                      <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>{space.name}</Text>
                      <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{space.address}</Text>
                    </View>
                    {space.attributes && <ScorePill score={space.attributes.overall_score} size="sm" />}
                  </TouchableOpacity>
                </View>
              ))}
              {suggestions.length > 0 && (
                <Text className={`px-4 pb-1 text-[13px] font-medium text-muted ${knownMatches.length > 0 ? 'pt-4' : 'pt-3'}`}>New place</Text>
              )}
              {searchError && <Text className="p-4 text-[14px] text-danger">{searchError}</Text>}
              {suggestions.map((suggestion, index) => (
                <View key={suggestion.place_id}>
                  {index > 0 && <View className="h-px bg-line-soft ml-[60px]" />}
                  <TouchableOpacity
                    onPress={() => handleSelectSuggestion(suggestion)}
                    className="px-4 py-2.5 flex-row items-center"
                    activeOpacity={0.6}
                  >
                    <View className="w-8 h-8 rounded-lg bg-fill items-center justify-center">
                      <MapPin size={16} color={colors.muted} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>{suggestion.name || suggestion.display_name.split(',')[0]}</Text>
                      <Text className="text-[13px] text-muted mt-0.5" numberOfLines={1}>{suggestion.display_name}</Text>
                    </View>
                    <Text className="text-[13px] text-subtle ml-2">{formatDistance(suggestion.distance)}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View className="h-1.5" />
            </View>
          )}

          <View className="flex-row items-center my-4">
            <View className="flex-1 h-px bg-line" />
            <Text className="mx-3 text-[13px] font-medium text-muted">Or drop a pin</Text>
            <View className="flex-1 h-px bg-line" />
          </View>

          <View className="rounded-2xl overflow-hidden bg-surface">
            <MapView
              ref={mapRef}
              userInterfaceStyle={scheme}
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
              <Text className="text-[13px] text-muted ml-1.5 flex-1">
                {isReverseGeocoding ? 'Finding the address...' : 'Tap the map to drop a pin. Drag it to fine-tune.'}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
