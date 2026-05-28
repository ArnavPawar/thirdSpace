import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MapPin, Sparkles, Star } from 'lucide-react-native';
import { CATEGORY_CONFIG } from '@/types/space';
import type { SpaceWithAttributes, VibeAttributeDefinition } from '@/types/space';

interface SpaceCardProps {
  space: SpaceWithAttributes;
  onPress?: () => void;
  showDistance?: boolean;
  compact?: boolean;
}

export default function SpaceCard({ 
  space, 
  onPress, 
  showDistance = false, 
  compact = false 
}: SpaceCardProps) {
  const { attributes } = space;

  const formatDistance = (distance?: number) => {
    if (!distance) return null;
    return distance < 1 
      ? `${Math.round(distance * 1000)}m` 
      : `${distance.toFixed(1)}mi`;
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-600';
    if (rating >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAttributeValue = (attribute: VibeAttributeDefinition) => {
    return attributes?.attribute_scores[attribute.key];
  };

  const visibleAttributes = attributes
    ? CATEGORY_CONFIG[attributes.category].attributes.filter((attribute) => getAttributeValue(attribute) !== undefined)
    : [];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`
        bg-white rounded-xl border border-gray-200 shadow-sm
        ${compact ? 'p-3 mb-2' : 'p-4 mb-3'}
      `}
    >
      {/* Header */}
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-3">
          <Text className={`font-bold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}>
            {space.name}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className={`text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
              {space.category}
            </Text>
            {(space.primary_purpose || attributes?.primary_purpose) && (
              <>
                <Text className={`text-gray-400 ${compact ? 'text-xs mx-2' : 'text-sm mx-2'}`}>•</Text>
                <Text className={`text-gray-600 flex-1 ${compact ? 'text-xs' : 'text-sm'}`} numberOfLines={1}>
                  {space.primary_purpose || attributes?.primary_purpose}
                </Text>
              </>
            )}
            {showDistance && space.distance !== undefined && (
              <>
                <Text className={`text-gray-400 ${compact ? 'text-xs mx-2' : 'text-sm mx-2'}`}>•</Text>
                <Text className={`text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
                  {formatDistance(space.distance)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Overall atmosphere score */}
        {attributes && (
          <View className="items-center">
            <View className="flex-row items-center mb-1">
              <Star size={compact ? 14 : 16} color="#eab308" />
              <Text className={`font-bold ml-1 ${getScoreColor(attributes.overall_score)} ${compact ? 'text-sm' : 'text-base'}`}>
                {attributes.overall_score}
              </Text>
            </View>
            <Text className={`text-gray-500 ${compact ? 'text-xs' : 'text-xs'}`}>
              /100 ({attributes.total_ratings})
            </Text>
          </View>
        )}
      </View>

      {/* Address */}
      <View className="flex-row items-center mb-3">
        <MapPin size={compact ? 12 : 14} color="#9ca3af" />
        <Text className={`text-gray-600 flex-1 ml-2 ${compact ? 'text-xs' : 'text-sm'}`} numberOfLines={1}>
          {space.address}
        </Text>
      </View>

      {/* Vibe ratings */}
      {attributes && !compact && (
        <View className="flex-row flex-wrap gap-2 pt-2 border-t border-gray-100">
          {visibleAttributes.map((attribute) => {
            const value = getAttributeValue(attribute) || 0;

            return (
              <View key={attribute.key} className="flex-row items-center bg-gray-50 px-2 py-1 rounded-full">
                <Sparkles size={12} color="#6b7280" />
                <Text className="ml-1 text-xs text-gray-600" numberOfLines={1}>
                  {attribute.label}
                </Text>
                <Text className={`ml-1 text-xs font-semibold ${getRatingColor(value)}`}>
                  {value.toFixed(1)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Compact vibe ratings */}
      {attributes && compact && (
        <View className="flex-row flex-wrap gap-2">
          {visibleAttributes.slice(0, 3).map((attribute) => {
            const value = getAttributeValue(attribute) || 0;

            return (
              <View key={attribute.key} className="flex-row items-center mr-2">
                <Sparkles size={12} color="#6b7280" />
                <Text className={`ml-1 text-xs ${getRatingColor(value)}`}>
                  {attribute.label} {value.toFixed(1)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </TouchableOpacity>
  );
}