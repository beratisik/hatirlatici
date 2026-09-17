import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncRankReminder } from '@/lib/notifications';

const STORAGE_KEY = '@hatirlatici/state';

// ---------------------------------------------------------------------------
// Uygulamanın kalıcı hafızası — hedefler, oturum, puan ve profil AsyncStorage
// üzerinden saklanır. Açılışta hydrate edilir.
// ---------------------------------------------------------------------------

export type RepeatUnit = 'saat' | 'gun' | 'hafta' | 'ay';

export type RepeatConfig = {
  unit: RepeatUnit;
  interval: number; // 1-10
};

const UNIT_LOCATIVE: Record<RepeatUnit, string> = {
  saat: 'saatte',
  gun: 'günde',
  hafta: 'haftada',
  ay: 'ayda',
};

export type ArchiveReason = 'onTime' | 'late' | 'missed' | 'manual';

export type Goal = {
  id: string;
  title: string;
  description: string;
  date: string; // "GG.AA.YYYY" formatında, seçilmediyse boş string
  time: string; // "SS:DD" formatında, seçilmediyse boş string
  repeat: RepeatConfig | null;
  archived: boolean; // true ise ana listede gösterilmez (tamamlandı/arşivlendi)
  archiveReason: ArchiveReason | null; // arşive neden düştüğü (rozet göstermek için)
};

export function formatRepeatSummary(repeat: RepeatConfig | null): string {
  if (!repeat) return 'Tekrar yok';
  return `Her ${repeat.interval} ${UNIT_LOCATIVE[repeat.unit]} bir tekrarla`;
}

// --- Puanlama ---
export type GoalOutcome = 'onTime' | 'late' | 'missed';

export const OUTCOME_POINTS: Record<GoalOutcome, number> = {
  onTime: 2,
  late: 1,
  missed: -1,
};

export function describeArchiveReason(reason: ArchiveReason | null): { label: string; color: string } {
  switch (reason) {
    case 'onTime':
      return { label: '✓ Zamanında yapıldı', color: '#3DDC84' };
    case 'late':
      return { label: '🕒 Geç yapıldı', color: '#D98C2B' };
    case 'missed':
      return { label: '✕ Yapılmadı', color: '#FF5C5C' };
    case 'manual':
    default:
      return { label: '🗄 Arşivlendi', color: '#8A8A8A' };
  }
}

// --- Disiplin Skoru rütbeleri ---
export type Rank = {
  title: string;
  quote: string;
  color: string;
};

const RANKS: (Rank & { min: number })[] = [
  {
    min: -Infinity,
    title: 'BAHANECİ',
    quote: "Yine mi 'yarın başlarım' diyorsun? Takvimin yalanlarla dolu.",
    color: '#FF5C5C',
  },
  {
    min: 51,
    title: 'TATLI SU PLANLAYICISI',
    quote: 'Sadece canın isteyince çalışıyorsun. Disiplin bu değil.',
    color: '#D98C2B',
  },
  {
    min: 151,
    title: 'İRADE ÇIRAĞI',
    quote: 'Biraz çaba görüyorum ama yetmez. Zinciri kırmaya çok yakınsın.',
    color: '#F5C400',
  },
  {
    min: 301,
    title: 'ODAK CANAVARI',
    quote: 'Sonunda bahaneleri bıraktın. Şimdi ivmeyi kaybetme.',
    color: '#8BC34A',
  },
  {
    min: 501,
    title: 'DEMİR İRADE',
    quote: 'Makineler uyumaz. Artık dışarıdan bir sese ihtiyacın yok.',
    color: '#3DDC84',
  },
];

export function getRank(score: number): Rank {
  let current: Rank = RANKS[0];
  for (const rank of RANKS) {
    if (score >= rank.min) {
      current = rank;
    }
  }
  return current;
}

// --- Kullanıcı ---
export type User = {
  name: string;
  email: string;
  password: string;
  avatarUri: string | null;
};

type PersistedState = {
  goals: Goal[];
  score: number;
  user: User | null;
  isLoggedIn: boolean;
  profile: string | null;
};

type GoalContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: string | null;

  goals: Goal[];
  addGoal: (goal: Omit<Goal, 'id' | 'archived' | 'archiveReason'>) => void;
  completeGoal: (id: string, outcome: GoalOutcome) => void;
  archiveGoal: (id: string) => void;

  user: User | null;
  setUser: (user: User) => void;
  updatePassword: (currentPassword: string, newPassword: string) => boolean;
  updateAvatar: (uri: string) => void;
  login: () => void;
  logout: () => void;
  setProfile: (profile: string) => void;

  score: number;
};

const GoalContext = createContext<GoalContextValue | undefined>(undefined);

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<User>;
  if (!value.name || !value.email || !value.password) return null;
  return {
    name: value.name,
    email: value.email,
    password: value.password,
    avatarUri: typeof value.avatarUri === 'string' ? value.avatarUri : null,
  };
}

function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Goal => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => ({
      ...item,
      archived: Boolean(item.archived),
      archiveReason: item.archiveReason ?? null,
    }));
}

export function GoalProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [user, setUserState] = useState<User | null>(null);
  const [score, setScore] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfileState] = useState<string | null>(null);
  const skipPersist = useRef(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          setGoals(normalizeGoals(parsed.goals));
          setScore(typeof parsed.score === 'number' ? parsed.score : 0);
          setUserState(normalizeUser(parsed.user));
          setIsLoggedIn(Boolean(parsed.isLoggedIn && parsed.user));
          setProfileState(typeof parsed.profile === 'string' ? parsed.profile : null);
        }
      } catch {
        // Bozuk kayıt varsa boş state ile devam et.
      } finally {
        if (!cancelled) {
          skipPersist.current = false;
          setIsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady || skipPersist.current) return;

    const payload: PersistedState = {
      goals,
      score,
      user,
      isLoggedIn,
      profile,
    };

    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [goals, score, user, isLoggedIn, profile, isReady]);

  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    void syncRankReminder(getRank(score));
  }, [isReady, isLoggedIn, score]);

  const addGoal = useCallback((goal: Omit<Goal, 'id' | 'archived' | 'archiveReason'>) => {
    setGoals((prev) => [
      ...prev,
      {
        ...goal,
        id: `${Date.now()}-${Math.round(Math.random() * 1000)}`,
        archived: false,
        archiveReason: null,
      },
    ]);
  }, []);

  const completeGoal = useCallback((id: string, outcome: GoalOutcome) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, archived: true, archiveReason: outcome } : g)),
    );
    setScore((prev) => prev + OUTCOME_POINTS[outcome]);
  }, []);

  const archiveGoal = useCallback((id: string) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, archived: true, archiveReason: 'manual' } : g)),
    );
  }, []);

  const setUser = useCallback((nextUser: User) => {
    setUserState({
      ...nextUser,
      avatarUri: nextUser.avatarUri ?? null,
    });
  }, []);

  const updatePassword = useCallback(
    (currentPassword: string, newPassword: string): boolean => {
      if (!user || user.password !== currentPassword) {
        return false;
      }
      setUserState({ ...user, password: newPassword });
      return true;
    },
    [user],
  );

  const updateAvatar = useCallback((uri: string) => {
    setUserState((prev) => (prev ? { ...prev, avatarUri: uri } : prev));
  }, []);

  const login = useCallback(() => {
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  const setProfile = useCallback((nextProfile: string) => {
    setProfileState(nextProfile);
  }, []);

  const value = useMemo(
    () => ({
      isReady,
      isLoggedIn,
      profile,
      goals,
      addGoal,
      completeGoal,
      archiveGoal,
      user,
      setUser,
      updatePassword,
      updateAvatar,
      login,
      logout,
      setProfile,
      score,
    }),
    [
      isReady,
      isLoggedIn,
      profile,
      goals,
      addGoal,
      completeGoal,
      archiveGoal,
      user,
      setUser,
      updatePassword,
      updateAvatar,
      login,
      logout,
      setProfile,
      score,
    ],
  );

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

export function useGoals() {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error('useGoals, bir <GoalProvider> içinde kullanılmalı.');
  }
  return context;
}

/** `useGoals`'ın kullanıcı hesabı ve Disiplin Skoru'na odaklanan kısayolu. */
export function useUser() {
  const {
    user,
    setUser,
    updatePassword,
    updateAvatar,
    score,
    isReady,
    isLoggedIn,
    login,
    logout,
    profile,
    setProfile,
  } = useGoals();
  return {
    user,
    setUser,
    updatePassword,
    updateAvatar,
    score,
    isReady,
    isLoggedIn,
    login,
    logout,
    profile,
    setProfile,
  };
}
