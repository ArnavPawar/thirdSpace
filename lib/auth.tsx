import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { demoCurrentUserId, demoProfile } from './fixtures';
import { isSupabaseConfigured, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'facebook';

type AuthContextValue = {
  userId: string;
  user: User | null;
  isDemoMode: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: OAuthProvider) => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Social sign-in needs Supabase to be configured in .env.');
  }
  return supabase;
};

const parseParams = (value: string) =>
  value.split('&').reduce<Record<string, string>>((params, pair) => {
    const [key, rawValue = ''] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    return params;
  }, {});

// Supabase returns either a PKCE `code` in the query or implicit-flow tokens in the fragment.
async function createSessionFromUrl(url: string) {
  const client = requireSupabase();
  const [beforeHash, fragment = ''] = url.split('#');
  const query = beforeHash.split('?')[1] || '';
  const params = { ...parseParams(query), ...parseParams(fragment) };

  if (params.error_description || params.error) {
    throw new Error(params.error_description || params.error);
  }

  if (params.code) {
    const { error } = await client.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await client.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return;
  }

  throw new Error('Sign-in did not return a session.');
}

export function getOAuthRedirectUrl() {
  return Linking.createURL('auth/callback');
}

export async function isAppleSignInAvailable() {
  return Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => setUser(data.user))
      .finally(() => setIsLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: { user: User | null } | null) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(null);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(null);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: email.split('@')[0],
          username: email.split('@')[0],
        },
      },
    });

    if (error) throw error;
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const client = requireSupabase();
    const redirectTo = getOAuthRedirectUrl();

    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Could not start sign-in.');

    if (__DEV__) console.log(`[auth] ${provider} sign-in started, returning to ${redirectTo}`);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (__DEV__) {
      console.log(`[auth] ${provider} browser closed: ${result.type}`, result.type === 'success' ? result.url.split('#')[0] : '');
    }
    if (result.type !== 'success') return false;

    await createSessionFromUrl(result.url);
    return true;
  }, []);

  const signInWithApple = useCallback(async () => {
    const client = requireSupabase();

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
      throw error;
    }

    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

    const { data, error } = await client.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;

    // Apple only shares the user's name on the very first sign-in, so save it right away.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (fullName && data.user) {
      await client.from('profiles').update({ full_name: fullName }).eq('user_id', data.user.id);
    }

    return true;
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }

    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    userId: user?.id || demoCurrentUserId,
    user,
    isDemoMode: !isSupabaseConfigured || !user,
    isLoading,
    signIn,
    signUp,
    signInWithProvider,
    signInWithApple,
    signOut,
  }), [isLoading, signIn, signInWithApple, signInWithProvider, signOut, signUp, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}

export const demoUserLabel = demoProfile.full_name || demoProfile.username || 'Demo User';
