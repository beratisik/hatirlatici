import 'expo-sqlite/localStorage/install';

import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readPublicEnv(name: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

const supabaseUrl = readPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabasePublishableKey = readPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export function isRemoteEnabled(): boolean {
  return supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
}

export const supabase: SupabaseClient | null = isRemoteEnabled()
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
