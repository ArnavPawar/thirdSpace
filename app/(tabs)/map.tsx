import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Compass, Filter, MapPin, Navigation, Search, X } from 'lucide-react-native';
import SpaceCard from '@/components/SpaceCard';
import { listSpaces } from '@/lib/data';
import { openDirections } from '@/lib/links';
import { SPACE_CATEGORIES, type SpaceCategory, type SpaceWithAttributes } from '@/types/space';

const ARLINGTON_COORDS: Region = {
  latitude: 38.8816,
  longitude: -77.1081,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const CATEGORY_COLORS: Record<SpaceCategory, string> = {
  'Cafe & Coworking': '#8B4513',
  'Park & Nature': '#228B22',
  'Sports Area': '#f97316',
  'Smoke & Sunset Spots': '#a855f7',
  'Social Drinking Spots': '#be123c',
  'Interactive Fun (Arcades, Board Games)': '#0f766e',
  'Public Architecture (Atriums, Hotel Lobbies)': '#4169E1',
};

export default function MapScreen() {
  const [region, setRegion] = useState<Region>(ARLINGTON_COORDS);
  const [selectedSpace, setSelectedSpace] = useState<SpaceWithAttributes | null>(null);
  const [spaces, setSpaces] = useState<SpaceWithAttributes[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SpaceCategory | 'All Categories'>('All Categories');
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSpaces = useCallback(async () => {
    try {
      setSpaces(await listSpaces({
        query,
        category: selectedCategory,
        userLocation: userLocation
          ? { latitude: userLocation.coords.latitude, longitude: userLocation.coords.longitude }
          : undefined,
      }));
    } catch {
      Alert.alert('Map Error', 'Could not load spaces.');
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedCategory, userLocation]);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  const filteredCategories = useMemo(() => ['All Categories', ...SPACE_CATEGORIES] as const, []);

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermission(status);

      if (status === 'granted') {
        setUserLocation(await Location.getCurrentPositionAsync({}));
      }
    } catch {
      setLocationPermission(Location.PermissionStatus.DENIED);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);

      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);
        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.035,
          longitudeDelta: 0.02,
        });
      } else {
        Alert.alert('Location Permission Denied', 'Continuing with Arlington, VA as the default area.');
      }
    } catch {
      Alert.alert('Location Error', 'Could not access your location.');
    }
  };

  const centerOnUser = async () => {
    if (locationPermission !== 'granted') {
      requestLocationPermission();
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation(location);
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.035,
        longitudeDelta: 0.02,
      });
    } catch {
      Alert.alert('Location Error', 'Could not get your current location.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1">
        <MapView
          style={{ flex: 1 }}
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation={locationPermission === 'granted'}
          showsMyLocationButton={false}
        >
          {spaces.map((space) => (
            <Marker
              key={space.id}
              coordinate={{ latitude: space.latitude, longitude: space.longitude }}
              onPress={() => setSelectedSpace(space)}
            >
              <View className="items-center">
                <View
                  className="w-8 h-8 rounded-full items-center justify-center border-2 border-white shadow-md"
                  style={{ backgroundColor: CATEGORY_COLORS[space.category] }}
                >
                  <MapPin size={16} color="white" />
                </View>
              </View>
            </Marker>
          ))}
        </MapView>

        <View className="absolute top-4 left-4 right-4">
          <View className="bg-white rounded-2xl border border-gray-200 shadow-lg p-3">
            <View className="flex-row items-center border border-gray-200 rounded-xl px-3 py-2">
              <Search size={16} color="#9ca3af" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search spaces"
                className="flex-1 ml-2 text-sm text-gray-900"
              />
            </View>
            <View className="flex-row flex-wrap gap-2 mt-3">
              {filteredCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  className={`px-3 py-2 rounded-full border ${
                    selectedCategory === category ? 'bg-primary border-primary' : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${selectedCategory === category ? 'text-white' : 'text-gray-700'}`}>
                    {category === 'All Categories' ? 'All' : category.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={centerOnUser}
          className="absolute top-36 right-4 w-12 h-12 bg-white rounded-full shadow-lg items-center justify-center border border-gray-200"
          activeOpacity={0.7}
        >
          <Navigation size={20} color="#4b5563" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={locationPermission !== 'granted' ? requestLocationPermission : undefined}
          className="absolute top-36 left-4 bg-white rounded-full px-3 py-2 shadow-lg border border-gray-200 flex-row items-center"
          activeOpacity={locationPermission !== 'granted' ? 0.7 : 1}
        >
          <Compass size={14} color="#4b5563" />
          <Text className="text-xs font-medium text-gray-600 ml-1">
            {locationPermission === 'granted' ? 'Live location' : 'Use my location'}
          </Text>
        </TouchableOpacity>

        {isLoading && (
          <View className="absolute inset-0 items-center justify-center bg-white/70">
            <ActivityIndicator color="#3b82f6" />
          </View>
        )}

        {selectedSpace && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl">
            <View className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-900">Space Details</Text>
              <TouchableOpacity onPress={() => setSelectedSpace(null)} className="p-1" activeOpacity={0.7}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View className="px-4 py-2">
              <SpaceCard
                space={selectedSpace}
                showDistance
                onPress={() => router.push(`/space/${selectedSpace.id}` as never)}
              />

              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity
                  className="flex-1 bg-primary py-3 rounded-lg items-center"
                  activeOpacity={0.8}
                  onPress={() => openDirections(selectedSpace)}
                >
                  <Text className="text-white font-semibold">Get Directions</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-gray-100 py-3 rounded-lg items-center flex-row justify-center"
                  activeOpacity={0.8}
                  onPress={() => router.push(`/space/${selectedSpace.id}` as never)}
                >
                  <Filter size={16} color="#374151" />
                  <Text className="text-gray-800 font-semibold ml-2">Open</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="h-8" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
