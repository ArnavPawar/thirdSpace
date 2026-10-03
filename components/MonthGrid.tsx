import React, { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { toDateKey } from '@/lib/events';
import { CATEGORY_META, colors } from '@/lib/theme';
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
    <View className="bg-white rounded-3xl border border-slate-200 px-3 pt-3 pb-2">
      <View className="flex-row items-center justify-between px-1 mb-2">
        <Pressable
          onPress={() => onChangeMonth(-1)}
          accessibilityLabel="Previous month"
          hitSlop={8}
          className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center"
        >
          <ChevronLeft size={18} color={colors.ink} />
        </Pressable>
        <Text className="text-[17px] font-extrabold text-ink">{monthLabel}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          accessibilityLabel="Next month"
          hitSlop={8}
          className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center"
        >
          <ChevronRight size={18} color={colors.ink} />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={`${letter}-${index}`} className="flex-1 text-center text-[11px] font-bold text-slate-400 py-1">
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
                  style={{
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                    borderColor: isToday && !isSelected ? colors.primary : 'transparent',
                  }}
                  className="w-10 h-11 rounded-2xl border-2 items-center justify-center"
                >
                  <Text
                    style={{ color: isSelected ? 'white' : isToday ? colors.primary : colors.ink }}
                    className="text-[14px] font-bold"
                  >
                    {Number(dateKey.slice(-2))}
                  </Text>
                  <View className="flex-row items-center h-2 mt-0.5">
                    {categories.slice(0, MAX_DOTS).map((category, index) => (
                      <View
                        key={`${category}-${index}`}
                        style={{ backgroundColor: isSelected ? 'white' : CATEGORY_META[category].color }}
                        className="w-1.5 h-1.5 rounded-full mx-[1px]"
                      />
                    ))}
                    {extra > 0 && (
                      <Text style={{ color: isSelected ? 'white' : colors.muted }} className="text-[8px] font-bold ml-[1px]">
                        +{extra}
                      </Text>
                    )}
                  </View>
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
