import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { EmailOtpType, User } from '@supabase/supabase-js';
import { router } from 'expo-router';
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
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
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

  if (params.token_hash && params.type) {
    const { error } = await client.auth.verifyOtp({
      token_hash: params.token_hash,
      type: params.type as EmailOtpType,
    });
    if (error) throw error;
    return;
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

const sessionExchanges = new Map<string, Promise<void>>();

const OTP_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

function readAuthParams(url: string) {
  const [beforeHash, fragment = ''] = url.split('#');
  const query = beforeHash.split('?')[1] || '';
  return { ...parseParams(query), ...parseParams(fragment) };
}

function hasAuthParams(url: string) {
  const params = readAuthParams(url);
  return Boolean(params.code || params.access_token || params.token || params.token_hash || params.error || params.error_description);
}

function extractAuthUrl(pasted: string) {
  const match = pasted.match(/(https?:\/\/|exp:\/\/|thirdspace:\/\/)[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/, '');
}

// The reset link can only be redeemed once. Deep links sometimes open the screen twice.
export function establishSessionFromUrl(url: string) {
  const existing = sessionExchanges.get(url);
  if (existing) return existing;

  const attempt = createSessionFromUrl(url);
  sessionExchanges.set(url, attempt);
  return attempt;
}

export async function preparePasswordReset(url: string | null) {
  const client = requireSupabase();

  if (url && hasAuthParams(url)) {
    try {
      await establishSessionFromUrl(url);
    } catch (error) {
      const { data } = await client.auth.getSession();
      if (!data.session) throw error;
    }
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    throw new Error('Paste the reset link from your email on the sign-in screen.');
  }

  return { email: data.session.user.email ?? null };
}

// Mail opens the reset link in the browser, which cannot hand off into Expo Go.
// The link still contains a one-time token, so pasting it here finishes the reset.
export async function completePasswordResetFromLink(pasted: string) {
  const client = requireSupabase();
  const url = extractAuthUrl(pasted);
  if (!url) throw new Error('Paste the full reset link from the email.');

  const params = readAuthParams(url);
  if (params.error_description || params.error) {
    throw new Error(params.error_description || params.error);
  }

  const tokenHash = params.token_hash || params.token;
  if (tokenHash && !params.code && !params.access_token) {
    const type = OTP_TYPES.has(params.type) ? params.type as EmailOtpType : 'recovery';
    const { error } = await client.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) throw error;
  } else {
    await establishSessionFromUrl(url);
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    throw new Error('That link is invalid or already used. Send a new email, then paste the new link without tapping it.');
  }

  return { email: data.session.user.email ?? null };
}

export function getOAuthRedirectUrl() {
  return Linking.createURL('auth/callback');
}

export function getPasswordResetRedirectUrl() {
  return Linking.createURL('auth/reset');
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

    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: { user: User | null } | null) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(() => router.replace('/auth/reset' as never), 0);
      }
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

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = requireSupabase();
    const redirectTo = getPasswordResetRedirectUrl();
    if (__DEV__) console.log(`[auth] password reset will return to ${redirectTo}`);

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: getOAuthRedirectUrl() },
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
    requestPasswordReset,
    updatePassword,
    resendConfirmation,
    signInWithProvider,
    signInWithApple,
    signOut,
  }), [isLoading, requestPasswordReset, resendConfirmation, signIn, signInWithApple, signInWithProvider, signOut, signUp, updatePassword, user]);

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
