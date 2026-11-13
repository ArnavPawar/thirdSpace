import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { getProfile, updateProfile } from './data';
import type { Profile, ProfileWithStats } from '@/types/space';

type MyProfileContextValue = {
  profile: ProfileWithStats | null;
  refresh: () => Promise<ProfileWithStats | null>;
  save: (update: Partial<Profile>) => Promise<ProfileWithStats>;
};

const MyProfileContext = createContext<MyProfileContextValue | null>(null);

/** The signed-in user's profile, shared so the tab bar, Profile, and Settings stay in step. */
export function MyProfileProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getProfile(userId);
      setProfile(next);
      return next;
    } catch {
      return null;
    }
  }, [userId]);

  useEffect(() => {
    setProfile(null);
    refresh();
  }, [refresh]);

  const save = useCallback(async (update: Partial<Profile>) => {
    const next = await updateProfile(userId, update);
    setProfile(next);
    return next;
  }, [userId]);

  const value = useMemo(() => ({ profile, refresh, save }), [profile, refresh, save]);
  return <MyProfileContext.Provider value={value}>{children}</MyProfileContext.Provider>;
}

export function useMyProfile() {
  const value = useContext(MyProfileContext);
  if (!value) throw new Error('useMyProfile must be used inside MyProfileProvider');
  return value;
}
