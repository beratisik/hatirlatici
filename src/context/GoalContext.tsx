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

import {
  cancelGoalAlarm,
  presentStreakCoachNotification,
  scheduleGoalAlarm,
  syncGoalAlarms,
  syncRankReminder,
} from '@/lib/notifications';

const STORAGE_KEY = '@hatirlatici/state';

export const STREAK_BONUS_AT = 5;
export const STREAK_BONUS_POINTS = 10;
export const STREAK_COACH_TITLE = '5 GÜNLÜK SERİ';
export const STREAK_COACH_MESSAGE =
  '5 gün dayandın. Kutlama yok. Yarın bozarsan bu da yalan olur. Devam et ya da sil baştan.';

export type RepeatUnit = 'saat' | 'gun' | 'hafta' | 'ay';

export type RepeatConfig = {
  unit: RepeatUnit;
  interval: number;
};

const UNIT_LOCATIVE: Record<RepeatUnit, string> = {
  saat: 'saatte',
  gun: 'günde',
  hafta: 'haftada',
  ay: 'ayda',
};

export type ArchiveReason = 'onTime' | 'late' | 'missed' | 'manual' | 'ended';
export type GoalOutcome = 'onTime' | 'late' | 'missed';
export type Gender = 'kadin' | 'erkek' | 'belirtmek_istemiyorum';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'kadin', label: 'Kadın' },
  { value: 'erkek', label: 'Erkek' },
  { value: 'belirtmek_istemiyorum', label: 'Belirtmek İstemiyorum' },
];

export function describeGender(gender: Gender | null): string {
  return GENDER_OPTIONS.find((item) => item.value === gender)?.label ?? 'Belirtilmedi';
}

export type Goal = {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  repeat: RepeatConfig | null;
  endDate: string;
  lastCompletedDate: string | null;
  lastOutcome: GoalOutcome | null;
  streak: number;
  archived: boolean;
  archiveReason: ArchiveReason | null;
};

export type CompleteResult = {
  applied: boolean;
  points: number;
  streak: number;
  bonus: boolean;
  message: string | null;
};

export function formatRepeatSummary(repeat: RepeatConfig | null): string {
  if (!repeat) return 'Tekrar yok';
  return `Her ${repeat.interval} ${UNIT_LOCATIVE[repeat.unit]} bir tekrarla`;
}

export function padDatePart(value: number) {
  return value.toString().padStart(2, '0');
}

export function todayIso(): string {
  return toIso(startOfToday());
}

export function yesterdayIso(): string {
  const day = startOfToday();
  day.setDate(day.getDate() - 1);
  return toIso(day);
}

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function parseGoalDate(value: string): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseGoalTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function parseGoalDateParts(
  value: string,
): { day: number; month: number; year: number } | null {
  const parsed = parseGoalDate(value);
  if (!parsed) return null;
  return {
    day: parsed.getDate(),
    month: parsed.getMonth() + 1,
    year: parsed.getFullYear(),
  };
}

export function isRepeating(goal: Goal): boolean {
  return goal.repeat != null;
}

export function isHandledToday(goal: Goal): boolean {
  return isRepeating(goal) && goal.lastCompletedDate === todayIso();
}

export function isCompletedToday(goal: Goal): boolean {
  return isHandledToday(goal) && (goal.lastOutcome === 'onTime' || goal.lastOutcome === 'late');
}

export function hasEndDatePassed(goal: Goal, today = startOfToday()): boolean {
  if (!goal.endDate) return false;
  const end = parseGoalDate(goal.endDate);
  if (!end) return false;
  return end.getTime() < today.getTime();
}

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
    case 'ended':
      return { label: '⏱ Süresi doldu', color: '#8A8A8A' };
    case 'manual':
    default:
      return { label: '🗄 Arşivlendi', color: '#8A8A8A' };
  }
}

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

export type User = {
  name: string;
  email: string;
  password: string;
  avatarUri: string | null;
  gender: Gender | null;
};

type PersistedState = {
  goals: Goal[];
  score: number;
  user: User | null;
  isLoggedIn: boolean;
  profile: string | null;
};

type NewGoalInput = Omit<
  Goal,
  'id' | 'archived' | 'archiveReason' | 'lastCompletedDate' | 'lastOutcome' | 'streak'
>;

type GoalPatch = Partial<Pick<Goal, 'title' | 'time' | 'endDate'>>;

type GoalContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: string | null;

  goals: Goal[];
  addGoal: (goal: NewGoalInput) => void;
  updateGoal: (id: string, patch: GoalPatch) => void;
  deleteGoal: (id: string) => void;
  completeGoal: (id: string, outcome: GoalOutcome) => CompleteResult;
  archiveGoal: (id: string) => void;
  restoreGoal: (id: string) => void;

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

function isGender(value: unknown): value is Gender {
  return value === 'kadin' || value === 'erkek' || value === 'belirtmek_istemiyorum';
}

function normalizeUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<User>;
  if (!value.name || !value.email || !value.password) return null;
  return {
    name: value.name,
    email: value.email,
    password: value.password,
    avatarUri: typeof value.avatarUri === 'string' ? value.avatarUri : null,
    gender: isGender(value.gender) ? value.gender : null,
  };
}

function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Goal => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => ({
      ...item,
      endDate: typeof item.endDate === 'string' ? item.endDate : '',
      lastCompletedDate: typeof item.lastCompletedDate === 'string' ? item.lastCompletedDate : null,
      lastOutcome: item.lastOutcome ?? null,
      streak: typeof item.streak === 'number' ? item.streak : 0,
      archived: Boolean(item.archived),
      archiveReason: item.archiveReason ?? null,
    }));
}

function resetBrokenStreaks(goals: Goal[]): Goal[] {
  const today = todayIso();
  const yesterday = yesterdayIso();
  let changed = false;
  const next = goals.map((goal) => {
    if (goal.archived || !goal.repeat || goal.streak <= 0) return goal;
    const last = goal.lastCompletedDate;
    if (!last || last === today || last === yesterday) return goal;
    changed = true;
    return { ...goal, streak: 0 };
  });
  return changed ? next : goals;
}

function archiveExpiredGoals(goals: Goal[]): Goal[] {
  const today = startOfToday();
  let changed = false;
  const next = goals.map((goal) => {
    if (goal.archived || !hasEndDatePassed(goal, today)) return goal;
    changed = true;
    void cancelGoalAlarm(goal.id);
    return { ...goal, archived: true, archiveReason: 'ended' as const };
  });
  return changed ? next : goals;
}

function maintainGoals(goals: Goal[]): Goal[] {
  return resetBrokenStreaks(archiveExpiredGoals(goals));
}

export function GoalProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [user, setUserState] = useState<User | null>(null);
  const [score, setScore] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfileState] = useState<string | null>(null);
  const skipPersist = useRef(true);
  const goalsRef = useRef<Goal[]>([]);
  goalsRef.current = goals;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          const nextGoals = maintainGoals(normalizeGoals(parsed.goals));
          setGoals(nextGoals);
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

  useEffect(() => {
    if (!isReady) return;
    setGoals((prev) => maintainGoals(prev));
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    void syncGoalAlarms(goalsRef.current);
  }, [isReady, isLoggedIn]);

  const addGoal = useCallback((goal: NewGoalInput) => {
    const created: Goal = {
      ...goal,
      id: `${Date.now()}-${Math.round(Math.random() * 1000)}`,
      lastCompletedDate: null,
      lastOutcome: null,
      streak: 0,
      archived: false,
      archiveReason: null,
    };
    setGoals((prev) => maintainGoals([...prev, created]));
    void scheduleGoalAlarm(created);
  }, []);

  const updateGoal = useCallback((id: string, patch: GoalPatch) => {
    const current = goalsRef.current.find((item) => item.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setGoals((prev) => maintainGoals(prev.map((item) => (item.id === id ? next : item))));
    void scheduleGoalAlarm(next);
  }, []);

  const deleteGoal = useCallback((id: string) => {
    void cancelGoalAlarm(id);
    setGoals((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const completeGoal = useCallback((id: string, outcome: GoalOutcome): CompleteResult => {
    const empty: CompleteResult = {
      applied: false,
      points: 0,
      streak: 0,
      bonus: false,
      message: null,
    };
    const day = todayIso();
    const goal = goalsRef.current.find((item) => item.id === id);
    if (!goal || goal.archived) return empty;
    if (goal.repeat && goal.lastCompletedDate === day) return empty;

    let nextStreak = goal.streak;
    if (goal.repeat) {
      if (outcome === 'missed') {
        nextStreak = 0;
      } else if (goal.lastCompletedDate === yesterdayIso()) {
        nextStreak = goal.streak + 1;
      } else {
        nextStreak = 1;
      }
    }

    const bonus = goal.repeat && outcome === 'onTime' && nextStreak === STREAK_BONUS_AT;
    const points = bonus ? STREAK_BONUS_POINTS : OUTCOME_POINTS[outcome];

    setGoals((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.repeat) {
          return {
            ...item,
            lastCompletedDate: day,
            lastOutcome: outcome,
            streak: nextStreak,
          };
        }
        return { ...item, archived: true, archiveReason: outcome };
      }),
    );
    setScore((prev) => prev + points);

    if (!goal.repeat) {
      void cancelGoalAlarm(id);
    }

    if (bonus) {
      void presentStreakCoachNotification(STREAK_COACH_TITLE, STREAK_COACH_MESSAGE);
    }

    return {
      applied: true,
      points,
      streak: nextStreak,
      bonus: Boolean(bonus),
      message: bonus ? STREAK_COACH_MESSAGE : null,
    };
  }, []);

  const archiveGoal = useCallback((id: string) => {
    void cancelGoalAlarm(id);
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, archived: true, archiveReason: 'manual' } : g)),
    );
  }, []);

  const restoreGoal = useCallback((id: string) => {
    const current = goalsRef.current.find((g) => g.id === id);
    if (!current) return;
    const next = maintainGoals([{ ...current, archived: false, archiveReason: null }])[0];
    setGoals((prev) =>
      maintainGoals(
        prev.map((g) => (g.id === id ? { ...g, archived: false, archiveReason: null } : g)),
      ),
    );
    if (next.archived) {
      void cancelGoalAlarm(id);
    } else {
      void scheduleGoalAlarm(next);
    }
  }, []);

  const setUser = useCallback((nextUser: User) => {
    setUserState({
      ...nextUser,
      avatarUri: nextUser.avatarUri ?? null,
      gender: nextUser.gender ?? null,
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
      updateGoal,
      deleteGoal,
      completeGoal,
      archiveGoal,
      restoreGoal,
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
      updateGoal,
      deleteGoal,
      completeGoal,
      archiveGoal,
      restoreGoal,
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
