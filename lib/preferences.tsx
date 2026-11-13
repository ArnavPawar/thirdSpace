import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';

export type AppearancePreference = 'system' | 'light' | 'dark';

export type NotificationKey =
  | 'likes'
  | 'comments'
  | 'follows'
  | 'mentions'
  | 'invites'
  | 'secretRequests'
  | 'eventReminders'
  | 'eventChats'
  | 'directMessages'
  | 'groupActivity';

export interface Preferences {
  appearance: AppearancePreference;
  defaultFeed: 'public' | 'following';
  notificationsPaused: boolean;
  notifications: Record<NotificationKey, boolean>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: 'system',
  defaultFeed: 'public',
  notificationsPaused: false,
  notifications: {
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    invites: true,
    secretRequests: true,
    eventReminders: true,
    eventChats: true,
    directMessages: true,
    groupActivity: false,
  },
};

const STORAGE_KEY = 'thirdspace.preferences.v1';

type PreferencesContextValue = {
  preferences: Preferences;
  isLoaded: boolean;
  setAppearance: (appearance: AppearancePreference) => void;
  setDefaultFeed: (feed: Preferences['defaultFeed']) => void;
  setNotificationsPaused: (paused: boolean) => void;
  setNotification: (key: NotificationKey, enabled: boolean) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const merge = (stored: Partial<Preferences> | null): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...stored,
  notifications: { ...DEFAULT_PREFERENCES.notifications, ...stored?.notifications },
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPreferences(merge(JSON.parse(raw) as Partial<Preferences>));
      })
      .catch(() => undefined)
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    colorScheme.set(preferences.appearance);
  }, [preferences.appearance]);

  const update = useCallback((change: (current: Preferences) => Preferences) => {
    setPreferences((current) => {
      const next = change(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    isLoaded,
    setAppearance: (appearance) => update((current) => ({ ...current, appearance })),
    setDefaultFeed: (defaultFeed) => update((current) => ({ ...current, defaultFeed })),
    setNotificationsPaused: (notificationsPaused) => update((current) => ({ ...current, notificationsPaused })),
    setNotification: (key, enabled) => update((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: enabled },
    })),
  }), [isLoaded, preferences, update]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
