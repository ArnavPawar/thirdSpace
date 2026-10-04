import React, { useMemo, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors } from '@/lib/theme';

export const RANGE_STOPS = [1, 3, 5, 10, 25] as const;
export const MIN_RANGE_MILES = RANGE_STOPS[0];
export const MAX_RANGE_MILES = RANGE_STOPS[RANGE_STOPS.length - 1];

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 8;
const LABEL_WIDTH = 44;
const SEGMENTS = RANGE_STOPS.length - 1;

// Stops sit evenly along the track, so short distances get as much room as long ones.
const fractionToMiles = (fraction: number) => {
  const position = Math.min(1, Math.max(0, fraction)) * SEGMENTS;
  const index = Math.min(SEGMENTS - 1, Math.floor(position));
  return RANGE_STOPS[index] + (position - index) * (RANGE_STOPS[index + 1] - RANGE_STOPS[index]);
};

const milesToFraction = (miles: number) => {
  const clamped = Math.min(MAX_RANGE_MILES, Math.max(MIN_RANGE_MILES, miles));
  let index = 0;
  while (index < SEGMENTS - 1 && clamped > RANGE_STOPS[index + 1]) index += 1;
  return (index + (clamped - RANGE_STOPS[index]) / (RANGE_STOPS[index + 1] - RANGE_STOPS[index])) / SEGMENTS;
};

const roundMiles = (miles: number) => (miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles));

interface RangeBarProps {
  value: number;
  onChange: (value: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
  eventCount?: number;
}

export default function RangeBar({ value, onChange, onDraggingChange, eventCount }: RangeBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const panResponder = useMemo(() => {
    let startX = 0;
    let currentFraction = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => trackWidth > 0,
      onMoveShouldSetPanResponder: () => trackWidth > 0,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        startX = event.nativeEvent.locationX;
        currentFraction = Math.min(1, Math.max(0, startX / trackWidth));
        setDragFraction(currentFraction);
        onDraggingChange?.(true);
      },
      onPanResponderMove: (_, gesture) => {
        currentFraction = Math.min(1, Math.max(0, (startX + gesture.dx) / trackWidth));
        setDragFraction(currentFraction);
      },
      onPanResponderRelease: () => {
        setDragFraction(null);
        onDraggingChange?.(false);
        onChange(roundMiles(fractionToMiles(currentFraction)));
      },
      onPanResponderTerminate: () => {
        setDragFraction(null);
        onDraggingChange?.(false);
      },
    });
  }, [onChange, onDraggingChange, trackWidth]);

  const fraction = dragFraction ?? milesToFraction(value);
  const displayMiles = dragFraction === null ? value : roundMiles(fractionToMiles(dragFraction));
  const thumbLeft = fraction * trackWidth - THUMB_SIZE / 2;

  return (
    <View className="bg-white rounded-3xl border border-slate-200 px-5 pt-3.5 pb-3">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center">
          <MapPin size={15} color={colors.primary} />
          <Text className="text-[15px] font-bold text-ink ml-1.5">Within {displayMiles} mi</Text>
        </View>
        {eventCount !== undefined && (
          <Text className="text-[13px] font-semibold text-slate-500">
            {eventCount === 1 ? '1 event' : `${eventCount} events`} this month
          </Text>
        )}
      </View>

      <View
        {...panResponder.panHandlers}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Event distance"
        accessibilityValue={{ text: `${value} miles` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          onChange(event.nativeEvent.actionName === 'increment'
            ? RANGE_STOPS.find((stop) => stop > value) ?? MAX_RANGE_MILES
            : [...RANGE_STOPS].reverse().find((stop) => stop < value) ?? MIN_RANGE_MILES);
        }}
        style={{ height: THUMB_SIZE + 16, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2 }} className="bg-slate-200" />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            width: fraction * trackWidth,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.primary,
          }}
        />
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: thumbLeft,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: 'white',
              borderWidth: 3,
              borderColor: colors.primary,
              shadowColor: colors.ink,
              shadowOpacity: 0.15,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: 3,
              transform: [{ scale: dragFraction === null ? 1 : 1.15 }],
            }}
          />
        )}
      </View>

      <View style={{ height: 18 }}>
        {trackWidth > 0 && RANGE_STOPS.map((stop, index) => {
          const isActive = Math.abs(displayMiles - stop) < 0.05;
          return (
            <Pressable
              key={stop}
              onPress={() => onChange(stop)}
              accessibilityRole="button"
              accessibilityLabel={`Show events within ${stop} miles`}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{ position: 'absolute', left: (index / SEGMENTS) * trackWidth - LABEL_WIDTH / 2, width: LABEL_WIDTH }}
            >
              <Text style={{ color: isActive ? colors.primary : colors.subtle }} className="text-[12px] font-bold text-center">
                {stop} mi
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
