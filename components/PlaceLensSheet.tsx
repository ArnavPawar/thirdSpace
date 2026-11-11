import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Globe, LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';

export interface CalendarPlace {
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
  };
}

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ThirdSpaceExpoApp/1.0',
};

const placeLabel = (result: NominatimResult) => {
  const address = result.address;
  return address?.city
    || address?.town
    || address?.village
    || address?.municipality
    || address?.hamlet
    || result.name
    || result.display_name.split(',')[0]
    || 'Selected place';
};

export default function PlaceLensSheet({
  visible,
  onClose,
  onNearYou,
  onAnywhere,
  onPlace,
}: {
  visible: boolean;
  onClose: () => void;
  onNearYou: () => void;
  onAnywhere: () => void;
  onPlace: (place: CalendarPlace) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(trimmed)}`,
          { headers: NOMINATIM_HEADERS, signal: abortController.signal }
        );
        if (!response.ok) throw new Error('Search failed');
        setResults((await response.json()) as NominatimResult[]);
      } catch {
        if (!abortController.signal.aborted) {
          setError('Could not look up that place.');
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 450);

    return () => {
      abortController.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <View className="flex-1 pr-3">
            <Text className="text-[22px] font-extrabold text-ink">Look around</Text>
            <Text className="text-[14px] text-slate-500 mt-1">This only changes the calendar. Your location stays put.</Text>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center">
            <X size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View className="px-5">
          <TouchableOpacity onPress={onNearYou} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2 flex-row items-center">
            <LocateFixed size={18} color={colors.primary} />
            <View className="ml-3 flex-1">
              <Text className="font-bold text-ink">Near you</Text>
              <Text className="text-[13px] text-slate-500 mt-0.5">Use this phone's location again.</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAnywhere} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex-row items-center">
            <Globe size={18} color={colors.primary} />
            <View className="ml-3 flex-1">
              <Text className="font-bold text-ink">Anywhere</Text>
              <Text className="text-[13px] text-slate-500 mt-0.5">Turn the distance filter off for this visit.</Text>
            </View>
          </TouchableOpacity>

          <View className="bg-white border border-slate-200 rounded-2xl px-4 h-[52px] flex-row items-center mt-4">
            <Search size={18} color={colors.subtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a city, like New York"
              placeholderTextColor={colors.subtle}
              autoCapitalize="words"
              autoCorrect={false}
              className="flex-1 ml-2 text-base text-ink"
            />
            {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {error ? <Text className="text-slate-500">{error}</Text> : null}
          {results.map((result) => {
            const label = placeLabel(result);
            return (
              <TouchableOpacity
                key={result.place_id}
                onPress={() => onPlace({
                  label,
                  latitude: Number(result.lat),
                  longitude: Number(result.lon),
                })}
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2 flex-row items-center"
              >
                <MapPin size={16} color={colors.muted} />
                <View className="ml-3 flex-1">
                  <Text className="font-bold text-ink" numberOfLines={1}>{label}</Text>
                  <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>{result.display_name}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
