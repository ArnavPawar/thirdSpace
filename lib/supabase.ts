import { createClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      spaces: {
        Row: {
          id: string;
          name: string;
          category: string;
          primary_purpose: string | null;
          address: string;
          latitude: number;
          longitude: number;
          description: string | null;
          website: string | null;
          phone: string | null;
          hours: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['spaces']['Row']> &
          Pick<Database['public']['Tables']['spaces']['Row'], 'name' | 'category' | 'address' | 'latitude' | 'longitude'>;
        Update: Partial<Database['public']['Tables']['spaces']['Row']>;
      };
      space_attributes: {
        Row: {
          id: string;
          space_id: string;
          category: string;
          primary_purpose: string;
          attribute_scores: Json;
          overall_score: number;
          total_ratings: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['space_attributes']['Row']> & { space_id: string };
        Update: Partial<Database['public']['Tables']['space_attributes']['Row']>;
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          space_id: string;
          category: string;
          primary_purpose: string;
          attribute_scores: Json;
          overall_score: number;
          review_text: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['ratings']['Row']> &
          Pick<Database['public']['Tables']['ratings']['Row'], 'user_id' | 'space_id' | 'category' | 'primary_purpose' | 'attribute_scores' | 'overall_score'>;
        Update: Partial<Database['public']['Tables']['ratings']['Row']>;
      };
      review_comments: {
        Row: {
          id: string;
          rating_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['review_comments']['Row']> &
          Pick<Database['public']['Tables']['review_comments']['Row'], 'rating_id' | 'user_id' | 'body'>;
        Update: Partial<Database['public']['Tables']['review_comments']['Row']>;
      };
      rating_likes: {
        Row: {
          rating_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['rating_likes']['Row'], 'rating_id' | 'user_id'>;
        Update: Partial<Database['public']['Tables']['rating_likes']['Row']>;
      };
      follows: {
        Row: {
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['follows']['Row'], 'follower_id' | 'following_id'>;
        Update: Partial<Database['public']['Tables']['follows']['Row']>;
      };
      user_rankings: {
        Row: {
          id: string;
          user_id: string;
          space_id: string;
          personal_rank: number;
          notes: string | null;
          is_favorite: boolean;
          last_visited: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['user_rankings']['Row']> &
          Pick<Database['public']['Tables']['user_rankings']['Row'], 'user_id' | 'space_id'>;
        Update: Partial<Database['public']['Tables']['user_rankings']['Row']>;
      };
    };
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your_') &&
    !supabaseAnonKey.includes('your_')
);

export const supabase: any = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
