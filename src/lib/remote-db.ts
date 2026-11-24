import { supabase } from '@/lib/supabase';

export type RemoteGender = 'kadin' | 'erkek' | 'belirtmek_istemiyorum';

export type RemoteUser = {
  id: string;
  name: string;
  surname: string;
  username: string;
  email: string;
  avatarUri: string | null;
  gender: RemoteGender | null;
};

export type RemoteSnapshot = {
  goals: unknown;
  score: number;
  profile: string | null;
  waterSettings: unknown;
  waterDay: unknown;
  cycle: unknown;
  coachThreads: unknown;
};

export type RemoteBundle = {
  user: RemoteUser;
  snapshot: RemoteSnapshot;
  loadError: boolean;
};

export type RemoteAuthCode = 'ok' | 'invalid' | 'error';
export type RemoteRegisterCode = 'ok' | 'email' | 'username' | 'confirm' | 'error';

type SignUpInput = {
  name: string;
  surname: string;
  username: string;
  email: string;
  password: string;
  gender: RemoteGender | null;
};

type StatePatch = Record<string, unknown>;
type ProfilePatch = {
  name: string;
  surname: string;
  username: string;
  gender: RemoteGender | null;
  avatar_uri: string | null;
};

const SCHEMA_HINT =
  'Supabase şeması eksik veya erişilemedi. supabase/schema.sql dosyasını SQL Editor’de çalıştır.';

let generation = 0;
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingState: StatePatch = {};
let pendingProfile: ProfilePatch | null = null;

function emptySnapshot(): RemoteSnapshot {
  return {
    goals: [],
    score: 0,
    profile: null,
    waterSettings: null,
    waterDay: null,
    cycle: null,
    coachThreads: null,
  };
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asGender(value: unknown): RemoteGender | null {
  return value === 'kadin' || value === 'erkek' || value === 'belirtmek_istemiyorum' ? value : null;
}

function scheduleFlush() {
  if (!supabase) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, 500);
}

export function pauseRemoteWrites() {
  generation += 1;
  pendingState = {};
  pendingProfile = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function queueUserState(patch: StatePatch) {
  if (!supabase) return;
  pendingState = { ...pendingState, ...patch };
  scheduleFlush();
}

export function queueProfile(patch: ProfilePatch) {
  if (!supabase) return;
  pendingProfile = patch;
  scheduleFlush();
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function flush() {
  if (!supabase || flushing) return;
  const gen = generation;
  const state = pendingState;
  const profile = pendingProfile;
  const hasState = Object.keys(state).length > 0;
  if (!hasState && !profile) return;

  flushing = true;
  pendingState = {};
  pendingProfile = null;

  try {
    if (gen !== generation) return;
    const userId = await currentUserId();
    if (!userId || gen !== generation) return;

    if (profile) {
      const { error } = await supabase.from('profiles').update(profile).eq('id', userId);
      if (error) console.warn(SCHEMA_HINT, error.message);
    }
    if (hasState) {
      const { error } = await supabase.from('user_state').update(state).eq('user_id', userId);
      if (error) console.warn(SCHEMA_HINT, error.message);
    }
  } finally {
    flushing = false;
    if (gen === generation && (pendingProfile || Object.keys(pendingState).length > 0)) {
      scheduleFlush();
    }
  }
}

async function ensureRows(user: RemoteUser) {
  if (!supabase) return;
  const [profileRes, stateRes] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
    supabase.from('user_state').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  if (!profileRes.error && !profileRes.data) {
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      name: user.name,
      surname: user.surname,
      username: user.username,
      gender: user.gender,
      avatar_uri: user.avatarUri,
    });
    if (error) console.warn(SCHEMA_HINT, error.message);
  }

  if (!stateRes.error && !stateRes.data) {
    const { error } = await supabase.from('user_state').insert({ user_id: user.id });
    if (error) console.warn(SCHEMA_HINT, error.message);
  }
}

export async function loadRemoteBundle(): Promise<RemoteBundle | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user;
  const email = sessionUser?.email?.trim();
  if (!sessionUser || !email) return null;

  const meta = (sessionUser.user_metadata ?? {}) as Record<string, unknown>;
  const fallback: RemoteUser = {
    id: sessionUser.id,
    name: asText(meta.name) || 'Kullanıcı',
    surname: asText(meta.surname),
    username: asText(meta.username) || email.split('@')[0] || 'kullanici',
    email,
    avatarUri: null,
    gender: asGender(meta.gender),
  };

  const [profileRes, stateRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, surname, username, gender, avatar_uri')
      .eq('id', sessionUser.id)
      .maybeSingle(),
    supabase
      .from('user_state')
      .select('goals, score, profile_key, water_settings, water_day, cycle, coach_threads')
      .eq('user_id', sessionUser.id)
      .maybeSingle(),
  ]);

  if (profileRes.error || stateRes.error) {
    console.warn(SCHEMA_HINT, profileRes.error?.message ?? stateRes.error?.message);
    return { user: fallback, snapshot: emptySnapshot(), loadError: true };
  }

  if (!profileRes.data || !stateRes.data) await ensureRows(fallback);

  const profile = profileRes.data;
  const state = stateRes.data;
  const user: RemoteUser = profile
    ? {
        id: sessionUser.id,
        name: asText(profile.name) || fallback.name,
        surname: asText(profile.surname),
        username: asText(profile.username) || fallback.username,
        email,
        avatarUri: typeof profile.avatar_uri === 'string' ? profile.avatar_uri : null,
        gender: asGender(profile.gender),
      }
    : fallback;

  const snapshot: RemoteSnapshot = state
    ? {
        goals: state.goals ?? [],
        score: typeof state.score === 'number' ? state.score : 0,
        profile: typeof state.profile_key === 'string' ? state.profile_key : null,
        waterSettings: state.water_settings ?? null,
        waterDay: state.water_day ?? null,
        cycle: state.cycle ?? null,
        coachThreads: state.coach_threads ?? null,
      }
    : emptySnapshot();

  return { user, snapshot, loadError: false };
}

export async function signUpRemote(input: SignUpInput): Promise<RemoteRegisterCode> {
  if (!supabase) return 'error';

  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const { data: taken, error: takenError } = await supabase.rpc('is_username_taken', {
    candidate: username,
  });
  if (takenError) {
    console.warn(SCHEMA_HINT, takenError.message);
    return 'error';
  }
  if (taken === true) return 'username';

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        name: input.name.trim(),
        surname: input.surname.trim(),
        username,
        gender: input.gender,
      },
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) return 'email';
    console.warn(error.message);
    return 'error';
  }

  if (data.user && (data.user.identities?.length ?? 0) === 0) return 'email';
  if (!data.session) return 'confirm';

  await supabase.auth.signOut();
  return 'ok';
}

export async function signInRemote(
  identifier: string,
  password: string,
): Promise<{ ok: true; bundle: RemoteBundle } | { ok: false; reason: 'invalid' | 'confirm' | 'error' }> {
  if (!supabase) return { ok: false, reason: 'error' };

  const { data: email, error: lookupError } = await supabase.rpc('email_for_login', {
    identifier: identifier.trim(),
  });
  if (lookupError) {
    console.warn(SCHEMA_HINT, lookupError.message);
    return { ok: false, reason: 'error' };
  }
  if (typeof email !== 'string' || !email) return { ok: false, reason: 'invalid' };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message.toLowerCase();
    if (error.code === 'email_not_confirmed' || message.includes('not confirmed')) {
      return { ok: false, reason: 'confirm' };
    }
    return { ok: false, reason: 'invalid' };
  }

  const bundle = await loadRemoteBundle();
  if (!bundle) return { ok: false, reason: 'error' };
  return { ok: true, bundle };
}

export async function changeRemotePassword(
  email: string,
  currentPassword: string,
  nextPassword: string,
): Promise<RemoteAuthCode> {
  if (!supabase) return 'error';
  const { error: signError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signError) return 'invalid';
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) {
    console.warn(error.message);
    return 'error';
  }
  return 'ok';
}

export async function signOutRemote(): Promise<void> {
  pauseRemoteWrites();
  await supabase?.auth.signOut();
}

export async function resetRemoteState(): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('user_state')
    .update({
      goals: [],
      score: 0,
      profile_key: null,
      water_settings: null,
      water_day: null,
      cycle: null,
      coach_threads: null,
    })
    .eq('user_id', userId);
  if (error) console.warn(SCHEMA_HINT, error.message);
}

export async function pullUserColumn(
  column: 'cycle' | 'coach_threads',
): Promise<{ status: 'off' | 'empty' | 'error' } | { status: 'value'; value: unknown }> {
  if (!supabase) return { status: 'off' };
  const userId = await currentUserId();
  if (!userId) return { status: 'off' };

  const { data, error } = await supabase
    .from('user_state')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn(SCHEMA_HINT, error.message);
    return { status: 'error' };
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  const value = row?.[column];
  if (value == null) return { status: 'empty' };
  return { status: 'value', value };
}

export async function deleteRemoteAccount(): Promise<'ok' | 'error'> {
  if (!supabase) return 'error';
  try {
    const { error } = await supabase.rpc('delete_user_account');
    if (error) {
      console.warn('delete_user_account error:', error.message);
      return 'error';
    }
    await supabase.auth.signOut();
    return 'ok';
  } catch (e) {
    console.warn('deleteRemoteAccount error:', e);
    return 'error';
  }
}

