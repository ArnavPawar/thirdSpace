import React, { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { toDateKey } from '@/lib/events';
import { CATEGORY_META, useColors } from '@/lib/theme';
import type { SpaceCategory } from '@/types/space';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_DOTS = 3;

interface MonthGridProps {
  monthStart: Date;
  categoriesByDate: Record<string, SpaceCategory[]>;
  selectedDate: string | null;
  todayKey: string;
  onSelectDate: (date: string | null) => void;
  onChangeMonth: (delta: number) => void;
}

function MonthGrid({ monthStart, categoriesByDate, selectedDate, todayKey, onSelectDate, onChangeMonth }: MonthGridProps) {
  const colors = useColors();
  const weeks = useMemo(() => {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [
      ...Array.from({ length: new Date(year, month, 1).getDay() }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => toDateKey(new Date(year, month, index + 1))),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  }, [monthStart]);

  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View className="bg-surface rounded-2xl px-2 pt-3 pb-2">
      <View className="flex-row items-center justify-between px-2 mb-1">
        <Text className="text-[17px] font-semibold text-ink">{monthLabel}</Text>
        <View className="flex-row gap-1">
          <Pressable
            onPress={() => onChangeMonth(-1)}
            accessibilityLabel="Previous month"
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center"
          >
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => onChangeMonth(1)}
            accessibilityLabel="Next month"
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center"
          >
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={`${letter}-${index}`} className="flex-1 text-center text-[11px] font-medium text-subtle py-1.5">
            {letter}
          </Text>
        ))}
      </View>

      {weeks.map((week, row) => (
        <View key={row} className="flex-row">
          {week.map((dateKey, column) => {
            if (!dateKey) return <View key={`blank-${row}-${column}`} className="flex-1 h-12" />;

            const categories = categoriesByDate[dateKey] || [];
            const isSelected = dateKey === selectedDate;
            const isToday = dateKey === todayKey;
            const extra = categories.length - MAX_DOTS;

            return (
              <Pressable
                key={dateKey}
                onPress={() => onSelectDate(isSelected ? null : dateKey)}
                accessibilityLabel={`${dateKey}, ${categories.length} events`}
                accessibilityState={{ selected: isSelected }}
                className="flex-1 h-12 items-center justify-center"
              >
                <View
                  style={{ backgroundColor: isSelected ? colors.ink : 'transparent' }}
                  className="w-9 h-9 rounded-full items-center justify-center"
                >
                  <Text
                    style={{ color: isSelected ? colors.canvas : isToday ? colors.primary : colors.ink }}
                    className={`text-[15px] ${isToday || isSelected ? 'font-semibold' : 'font-normal'}`}
                  >
                    {Number(dateKey.slice(-2))}
                  </Text>
                </View>
                <View className="flex-row items-center h-1.5 mt-0.5">
                  {categories.slice(0, MAX_DOTS).map((category, index) => (
                    <View
                      key={`${category}-${index}`}
                      style={{ backgroundColor: CATEGORY_META[category].color }}
                      className="w-1 h-1 rounded-full mx-[1px]"
                    />
                  ))}
                  {extra > 0 && (
                    <Text style={{ color: colors.muted }} className="text-[8px] font-semibold ml-[1px] leading-[8px]">
                      +{extra}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default memo(MonthGrid);
