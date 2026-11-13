import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Globe, LocateFixed, MapPin, Search } from 'lucide-react-native';
import { ListGroup, ListRow, Sheet } from '@/components/ui';
import { localityName, type NominatimAddress } from '@/lib/cities';
import { useColors, useColorSchemeName } from '@/lib/theme';

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
  address?: NominatimAddress;
}

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ThirdSpaceExpoApp/1.0',
};

const placeLabel = (result: NominatimResult) =>
  localityName(result.address)
    || result.name
    || result.display_name.split(',')[0]
    || 'Selected place';

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
  const colors = useColors();
  const scheme = useColorSchemeName();
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
    <Sheet visible={visible} onClose={onClose} title="Look around" subtitle="This only changes the calendar. Your location stays put.">
      <View className="bg-surface rounded-xl px-3 h-11 flex-row items-center mb-5">
        <Search size={17} color={colors.subtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a city, like New York"
          placeholderTextColor={colors.subtle}
          keyboardAppearance={scheme}
          autoCapitalize="words"
          autoCorrect={false}
          className="flex-1 ml-2 text-[16px] text-ink"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.muted} />}
      </View>

      {error ? <Text className="text-[15px] text-muted mb-4 px-1">{error}</Text> : null}

      {results.length > 0 ? (
        <ListGroup title="Results">
          {results.map((result) => {
            const label = placeLabel(result);
            return (
              <ListRow
                key={result.place_id}
                icon={MapPin}
                title={label}
                subtitle={result.display_name}
                onPress={() => onPlace({
                  label,
                  latitude: Number(result.lat),
                  longitude: Number(result.lon),
                })}
              />
            );
          })}
        </ListGroup>
      ) : (
        <ListGroup>
          <ListRow icon={LocateFixed} iconColor={colors.primary} title="Near you" subtitle="Use this phone's location again." onPress={onNearYou} />
          <ListRow icon={Globe} iconColor={colors.primary} title="Anywhere" subtitle="Turn the distance filter off for this visit." onPress={onAnywhere} />
        </ListGroup>
      )}
    </Sheet>
  );
}
