import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Clock, Globe, Heart, KeyRound, LocateFixed, Lock, Navigation, Search, Users, X } from 'lucide-react-native';
import SecretSpotSheet from '@/components/SecretSpotSheet';
import { Avatar, CategoryIcon, Chip, OpenStatusBadge, ScorePill, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listRecentActivity, listSecretSpots, listSpaces, toggleFavorite } from '@/lib/data';
import { formatDistance, formatTimeAgo, getDisplayName } from '@/lib/format';
import { openDirections, openProfile } from '@/lib/links';
import { rankSearchResults, type SearchFields } from '@/lib/search';
import { CATEGORY_META, colors } from '@/lib/theme';
import {
  SPACE_CATEGORIES,
  type FeedActivity,
  type SecretAccessStatus,
  type SecretSpotPreview,
  type SpaceCategory,
  type SpaceWithAttributes,
} from '@/types/space';

const ARLINGTON_COORDS: Region = {
  latitude: 38.8816,
  longitude: -77.1081,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const MAX_FOCUS_DELTA = 0.04;
const CARD_GAP = 12;
const CARD_HEIGHT = 148;

type MapMode = 'public' | 'following' | 'secret';

type MapItem =
  | { kind: 'space'; id: string; latitude: number; longitude: number; category: SpaceCategory; space: SpaceWithAttributes }
  | { kind: 'activity'; id: string; latitude: number; longitude: number; category: SpaceCategory; activity: FeedActivity }
  | { kind: 'secret'; id: string; latitude: number; longitude: number; category: SpaceCategory; spot: SecretSpotPreview };

const getItemSearchFields = (item: MapItem): SearchFields => {
  if (item.kind === 'space') {
    return {
      name: item.space.name,
      category: item.category,
      purpose: item.space.primary_purpose,
      address: item.space.address,
      extra: [item.space.description],
    };
  }
  if (item.kind === 'activity') {
    return {
      name: item.activity.space.name,
      category: item.category,
      purpose: item.activity.primary_purpose,
      address: item.activity.space.address,
      extra: [getDisplayName(item.activity.profile), item.activity.review_text],
    };
  }
  return {
    name: item.spot.space?.name,
    category: item.category,
    purpose: item.spot.primary_purpose,
    extra: [item.spot.area_hint, getDisplayName(item.spot.owner)],
  };
};

export default function MapScreen() {
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 48;
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(ARLINGTON_COORDS);
  const listRef = useRef<FlatList<MapItem>>(null);

  const [mode, setMode] = useState<MapMode>('public');
  const [category, setCategory] = useState<SpaceCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [spaces, setSpaces] = useState<SpaceWithAttributes[]>([]);
  const [followingActivity, setFollowingActivity] = useState<FeedActivity[]>([]);
  const [secretSpots, setSecretSpots] = useState<SecretSpotPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetSpot, setSheetSpot] = useState<SecretSpotPreview | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const location = userLocation
        ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
        : undefined;
      const [nextSpaces, nextActivity, nextSecrets] = await Promise.all([
        listSpaces({ viewerId: userId, userLocation: location }),
        listRecentActivity({ currentUserId: userId, scope: 'following' }),
        listSecretSpots(userId),
      ]);
      setSpaces(nextSpaces);
      setFollowingActivity(nextActivity);
      setSecretSpots(nextSecrets);
    } catch {
      Alert.alert('Map Error', 'Could not load spaces.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, userLocation]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (params.mode === 'public' || params.mode === 'following' || params.mode === 'secret') {
      setMode(params.mode);
      router.setParams({ mode: undefined } as never);
    }
  }, [params.mode]);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(async ({ status }) => {
        setLocationPermission(status);
        if (status === 'granted') setUserLocation(await Location.getCurrentPositionAsync({}));
      })
      .catch(() => setLocationPermission(Location.PermissionStatus.DENIED));
  }, []);

  const searchOrigin = useMemo(() => (
    userLocation
      ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
      : { latitude: ARLINGTON_COORDS.latitude, longitude: ARLINGTON_COORDS.longitude }
  ), [userLocation]);

  const items = useMemo<MapItem[]>(() => {
    const inCategory = (value: SpaceCategory) => category === 'all' || value === category;
    const rank = (candidates: MapItem[]) => rankSearchResults(candidates, query, getItemSearchFields, (item) => item, searchOrigin);

    if (mode === 'public') {
      return rank(spaces
        .filter((space) => !space.is_secret && inCategory(space.category))
        .map((space) => ({ kind: 'space', id: space.id, latitude: space.latitude, longitude: space.longitude, category: space.category, space })));
    }

    if (mode === 'following') {
      const latestBySpace = new Map<string, FeedActivity>();
      followingActivity.forEach((activity) => {
        if (!latestBySpace.has(activity.space_id)) latestBySpace.set(activity.space_id, activity);
      });
      return rank(Array.from(latestBySpace.values())
        .filter((activity) => inCategory(activity.space.category))
        .map((activity) => ({
          kind: 'activity',
          id: activity.id,
          latitude: activity.space.latitude,
          longitude: activity.space.longitude,
          category: activity.space.category,
          activity,
        })));
    }

    return rank(secretSpots
      .filter((spot) => inCategory(spot.category))
      .map((spot) => ({
        kind: 'secret',
        id: spot.id,
        latitude: spot.approx_latitude,
        longitude: spot.approx_longitude,
        category: spot.category,
        spot,
      })));
  }, [category, followingActivity, mode, query, searchOrigin, secretSpots, spaces]);

  useEffect(() => {
    if (!query.trim() || items.length === 0) return;
    const timeout = setTimeout(() => {
      setSelectedId(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      mapRef.current?.fitToCoordinates(
        items.slice(0, 5).map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
        { edgePadding: { top: 260, right: 60, bottom: CARD_HEIGHT + 60, left: 60 }, animated: true }
      );
    }, 450);
    return () => clearTimeout(timeout);
    // Only refit after the user pauses typing; items change identity on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const mySecretSpots = useMemo(() => secretSpots.filter((spot) => spot.access === 'owner'), [secretSpots]);

  const fitKey = `${mode}:${category}:${items.length > 0}`;
  useEffect(() => {
    if (items.length === 0) return;
    const timeout = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        items.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
        { edgePadding: { top: 260, right: 60, bottom: CARD_HEIGHT + 60, left: 60 }, animated: true }
      );
    }, 150);
    return () => clearTimeout(timeout);
    // Refit only when the filter set changes, not on every search keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    setSelectedId(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [mode, category]);

  const focusItem = (item: MapItem) => {
    setSelectedId(item.id);
    const current = regionRef.current;
    mapRef.current?.animateToRegion({
      latitude: item.latitude,
      longitude: item.longitude,
      latitudeDelta: Math.min(current.latitudeDelta, MAX_FOCUS_DELTA),
      longitudeDelta: Math.min(current.longitudeDelta, MAX_FOCUS_DELTA),
    }, 350);
  };

  const handleMarkerPress = (item: MapItem) => {
    focusItem(item);
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) listRef.current?.scrollToOffset({ offset: index * (cardWidth + CARD_GAP), animated: true });
  };

  const handleCarouselScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + CARD_GAP));
    const item = items[index];
    if (item && item.id !== selectedId) focusItem(item);
  };

  const centerOnUser = async () => {
    try {
      let status = locationPermission;
      if (status !== 'granted') {
        status = (await Location.requestForegroundPermissionsAsync()).status;
        setLocationPermission(status);
      }
      if (status !== 'granted') {
        Alert.alert('Location Off', 'Turn on location in Settings to see spots near you. Showing Arlington, VA for now.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location);
      mapRef.current?.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.035,
        longitudeDelta: 0.02,
      }, 400);
    } catch {
      Alert.alert('Location Error', 'Could not get your current location.');
    }
  };

  const handleToggleFavorite = async (space: SpaceWithAttributes) => {
    const setFavorited = (favorited: boolean) => setSpaces((current) => current.map((item) =>
      item.id === space.id ? { ...item, current_user_favorited: favorited } : item
    ));
    setFavorited(!space.current_user_favorited);
    try {
      await toggleFavorite(userId, space);
    } catch {
      setFavorited(Boolean(space.current_user_favorited));
      Alert.alert('Save Error', 'Could not update saved spots.');
    }
  };

  const handleSecretAccessChange = (spotId: string, access: SecretAccessStatus) => {
    setSecretSpots((current) => current.map((spot) => spot.id === spotId ? { ...spot, access } : spot));
    if (access === 'unlocked') loadData();
  };

  const openSecretSpot = (spot: SecretSpotPreview) => {
    if (spot.access === 'owner' || spot.access === 'unlocked') {
      router.push(`/space/${spot.id}` as never);
    } else {
      setSheetSpot(spot);
    }
  };

  const renderMarker = (item: MapItem) => {
    const isSelected = item.id === selectedId;
    const meta = CATEGORY_META[item.category];

    if (item.kind === 'activity') {
      return (
        <View className="items-center">
          <View
            style={{ borderColor: isSelected ? colors.primary : 'white', borderWidth: 3, borderRadius: 999 }}
            className="shadow-md"
          >
            <Avatar name={getDisplayName(item.activity.profile)} size={isSelected ? 40 : 32} />
          </View>
          <View style={{ backgroundColor: meta.color }} className="w-4 h-4 rounded-full border-2 border-white -mt-2" />
        </View>
      );
    }

    const isLockedSecret = item.kind === 'secret' && (item.spot.access === 'locked' || item.spot.access === 'pending');
    const Icon = item.kind === 'secret' ? (isLockedSecret ? Lock : KeyRound) : meta.icon;
    const size = isSelected ? 44 : 34;

    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: item.kind === 'secret' ? colors.secret : meta.color,
        }}
        className="items-center justify-center border-[3px] border-white shadow-md"
      >
        <Icon size={isSelected ? 20 : 16} color="white" />
      </View>
    );
  };

  const renderCard = ({ item }: { item: MapItem }) => {
    const isSelected = item.id === selectedId;
    const cardClass = `bg-white rounded-3xl p-4 shadow-lg ${isSelected ? 'border-2 border-primary' : 'border border-slate-200'}`;

    if (item.kind === 'space') {
      const { space } = item;
      const distance = formatDistance(space.distance);
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => focusItem(item)} style={{ width: cardWidth, height: CARD_HEIGHT }} className={cardClass}>
          <View className="flex-row items-center">
            <CategoryIcon category={space.category} size={44} />
            <View className="flex-1 mx-3">
              <Text className="font-bold text-ink text-base" numberOfLines={1}>{space.name}</Text>
              <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>
                {[CATEGORY_META[space.category].short, space.primary_purpose, distance].filter(Boolean).join(' · ')}
              </Text>
              <View className="mt-0.5">
                <OpenStatusBadge hours={space.hours} />
              </View>
            </View>
            {space.attributes && <ScorePill score={space.attributes.overall_score} />}
          </View>
          <View className="flex-row mt-auto gap-2">
            <TouchableOpacity onPress={() => openDirections(space)} activeOpacity={0.8} className="flex-1 h-10 rounded-xl bg-slate-100 flex-row items-center justify-center">
              <Navigation size={15} color={colors.ink} />
              <Text className="font-semibold text-ink ml-1.5">Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push(`/space/${space.id}` as never)} activeOpacity={0.8} className="flex-1 h-10 rounded-xl bg-primary items-center justify-center">
              <Text className="font-semibold text-white">View spot</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToggleFavorite(space)}
              activeOpacity={0.8}
              accessibilityLabel={space.current_user_favorited ? 'Remove from saved' : 'Save spot'}
              className={`w-10 h-10 rounded-xl items-center justify-center ${space.current_user_favorited ? 'bg-rose-50' : 'bg-slate-100'}`}
            >
              <Heart
                size={18}
                color={space.current_user_favorited ? colors.like : colors.ink}
                fill={space.current_user_favorited ? colors.like : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    if (item.kind === 'activity') {
      const { activity } = item;
      const name = getDisplayName(activity.profile);
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => focusItem(item)} style={{ width: cardWidth, height: CARD_HEIGHT }} className={cardClass}>
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => openProfile(activity.user_id, userId)}
              activeOpacity={0.7}
              accessibilityLabel={`View ${name}'s profile`}
              className="flex-1 flex-row items-center"
            >
              <Avatar name={name} size={28} />
              <Text className="text-[13px] text-slate-500 ml-2 flex-1" numberOfLines={1}>
                <Text className="font-bold text-ink">{name.split(' ')[0]}</Text> rated · {formatTimeAgo(activity.created_at)}
              </Text>
            </TouchableOpacity>
            <ScorePill score={activity.overall_score} size="sm" />
          </View>
          <TouchableOpacity onPress={() => router.push(`/space/${activity.space.id}` as never)} activeOpacity={0.7}>
            <Text className="font-bold text-ink text-base mt-2" numberOfLines={1}>{activity.space.name}</Text>
          </TouchableOpacity>
          <Text className="text-[13px] text-slate-600 mt-1 leading-[18px]" numberOfLines={2}>
            {activity.review_text || `Went for ${activity.primary_purpose.toLowerCase()}.`}
          </Text>
        </TouchableOpacity>
      );
    }

    const { spot } = item;
    const isVisible = spot.access === 'owner' || spot.access === 'unlocked';
    const ownerName = getDisplayName(spot.owner);
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => focusItem(item)} style={{ width: cardWidth, height: CARD_HEIGHT }} className={cardClass}>
        <View className="flex-row items-center">
          <View className="w-11 h-11 rounded-2xl bg-secret items-center justify-center">
            {isVisible ? <KeyRound size={20} color="white" /> : <Lock size={20} color="white" />}
          </View>
          <View className="flex-1 mx-3">
            <Text className="font-bold text-ink text-base" numberOfLines={1}>
              {isVisible ? spot.space?.name : `Hidden ${CATEGORY_META[spot.category].short.toLowerCase()} spot`}
            </Text>
            <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>
              {spot.access === 'owner' ? 'Your secret spot' : `Gatekept by ${ownerName.split(' ')[0]}`}
              {spot.area_hint ? ` · ${spot.area_hint}` : ''}
            </Text>
          </View>
          {spot.overall_score !== undefined && <ScorePill score={spot.overall_score} size="sm" />}
        </View>
        <TouchableOpacity
          onPress={() => openSecretSpot(spot)}
          activeOpacity={0.8}
          className={`mt-auto h-10 rounded-xl flex-row items-center justify-center ${
            spot.access === 'pending' ? 'bg-amber-50' : isVisible ? 'bg-slate-100' : 'bg-secret'
          }`}
        >
          {spot.access === 'pending' && <Clock size={15} color={colors.warning} />}
          <Text className={`font-semibold ml-1.5 ${spot.access === 'pending' ? 'text-amber-700' : isVisible ? 'text-ink' : 'text-white'}`}>
            {spot.access === 'pending' ? 'Request pending' : isVisible ? 'View spot' : 'Request or trade to unlock'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const emptyCopy = mode === 'following'
    ? { title: 'No spots from friends yet', body: 'Follow people from the Feed to see where they hang out.' }
    : mode === 'secret'
      ? { title: 'No secret spots here', body: 'Rate a place with Gatekeeper mode on to hide your own.' }
      : { title: 'No spots match', body: 'Try a different category or search.' };

  return (
    <View className="flex-1 bg-white">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={ARLINGTON_COORDS}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
        }}
        showsUserLocation={locationPermission === 'granted'}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        onPress={(event) => {
          if (event.nativeEvent.action !== 'marker-press') setSelectedId(null);
        }}
      >
        {items.map((item) => (
          item.kind === 'secret' && item.spot.access !== 'owner' && item.spot.access !== 'unlocked' ? (
            <Circle
              key={`area-${item.id}`}
              center={{ latitude: item.latitude, longitude: item.longitude }}
              radius={550}
              fillColor="rgba(124, 58, 237, 0.12)"
              strokeColor="rgba(124, 58, 237, 0.4)"
              strokeWidth={1}
            />
          ) : null
        ))}
        {items.map((item) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.latitude, longitude: item.longitude }}
            onPress={(event) => {
              event.stopPropagation();
              handleMarkerPress(item);
            }}
            zIndex={item.id === selectedId ? 10 : 1}
          >
            {renderMarker(item)}
          </Marker>
        ))}
      </MapView>

      <View style={{ top: insets.top + 8 }} pointerEvents="box-none" className="absolute left-0 right-0">
        <View className="flex-row items-center px-4">
          <View className="flex-1 flex-row items-center bg-white rounded-2xl px-4 h-12 shadow-md border border-slate-100">
            <Search size={18} color={colors.subtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={mode === 'following' ? 'Search spots, friends, or vibes' : "Try 'wifi', 'sunset', or a name"}
              placeholderTextColor={colors.subtle}
              returnKeyType="search"
              className="flex-1 ml-2 text-[15px] text-ink"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <X size={18} color={colors.subtle} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={centerOnUser}
            accessibilityLabel="Center on my location"
            activeOpacity={0.8}
            className="ml-2 w-12 h-12 bg-white rounded-2xl items-center justify-center shadow-md border border-slate-100"
          >
            <LocateFixed size={20} color={locationPermission === 'granted' ? colors.primary : colors.ink} />
          </TouchableOpacity>
        </View>

        <View className="mx-4 mt-2 bg-white rounded-2xl shadow-md">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'public', label: 'Public', icon: Globe },
              { value: 'following', label: 'Following', icon: Users },
              { value: 'secret', label: 'Secret', icon: KeyRound },
            ]}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
        >
          <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} elevated />
          {SPACE_CATEGORIES.map((value) => (
            <Chip
              key={value}
              label={CATEGORY_META[value].short}
              icon={CATEGORY_META[value].icon}
              color={CATEGORY_META[value].color}
              selected={category === value}
              onPress={() => setCategory(category === value ? 'all' : value)}
              elevated
            />
          ))}
        </ScrollView>

        {mode === 'secret' && (
          <View className="mx-4 bg-secret rounded-2xl px-4 py-3 flex-row items-center shadow-md">
            <Lock size={16} color="white" />
            <Text className="text-white text-[13px] ml-2 flex-1 leading-[18px]">
              Secret spots are hidden by their owners. Ask nicely or trade one of yours to get in.
            </Text>
          </View>
        )}
      </View>

      <View pointerEvents="box-none" className="absolute left-0 right-0 bottom-4">
        {isLoading ? (
          <View className="mx-6 bg-white rounded-3xl p-6 items-center shadow-lg">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View className="mx-6 bg-white rounded-3xl p-5 shadow-lg border border-slate-200">
            <Text className="font-bold text-ink text-base">{emptyCopy.title}</Text>
            <Text className="text-slate-500 text-sm mt-1">{emptyCopy.body}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}
            ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            getItemLayout={(_, index) => ({
              length: cardWidth + CARD_GAP,
              offset: 24 + (cardWidth + CARD_GAP) * index,
              index,
            })}
            onMomentumScrollEnd={handleCarouselScrollEnd}
          />
        )}
      </View>

      <SecretSpotSheet
        spot={sheetSpot}
        mySecretSpots={mySecretSpots}
        onClose={() => setSheetSpot(null)}
        onAccessChange={handleSecretAccessChange}
      />
    </View>
  );
}
