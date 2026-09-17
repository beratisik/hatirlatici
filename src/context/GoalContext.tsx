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

export function getConfrontationMessage(streak: number, bonus = false): string {
  if (bonus) return STREAK_COACH_MESSAGE;
  if (streak <= 0) return 'Sıfır. Bugün işaretlemezsen yarın da işaretlemeyeceksin.';
  if (streak === 1) return 'Bir gün. Alkış yok. Yarın gelmezsen bu da yalandı.';
  if (streak === 2) return 'İki gün. Henüz kimse değilsin. Zinciri kırma.';
  if (streak === 3) return 'Üç gün. Bahanelerin sıraya girdi. Görme onları.';
  if (streak === 4) return 'Dört. Yarın beş. Yarın kaçarsan dört gün de çöp.';
  if (streak < 10) return `${streak} gün. Kimse umursamıyor. Sen umursamazsan biter.`;
  return `${streak} günlük seri. Makine gibi. Şimdi bozmak en kolayı. Bozma.`;
}

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

export type ArchiveReason =
  | 'onTime'
  | 'late'
  | 'missed'
  | 'manual'
  | 'ended'
  | 'paused'
  | 'finished';
export type GoalOutcome = 'onTime' | 'late' | 'missed';
export type Gender = 'kadin' | 'erkek' | 'belirtmek_istemiyorum';
export type PlanCategory = 'kitap' | 'yuruyus' | 'vucut' | 'muzik' | 'dil' | 'akademik';
export type TimeSlot = 'sabah' | 'ogle' | 'aksam';

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
  category: PlanCategory | null;
  timeSlot: TimeSlot | null;
  sessionMinutes: number;
  completionCount: number;
  pointsEarned: number;
  pagesRead: number;
  startedAt: string | null;
  coachReason: string;
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

export const EDIT_LOCK_MESSAGE = 'Bahanelere yer yok, süre çok azaldı!';
const EDIT_LOCK_WINDOW_MS = 60 * 60 * 1000;

export function getGoalTargetDate(goal: Goal): Date | null {
  const time = parseGoalTime(goal.time);
  if (!time) return null;

  const dated = parseGoalDate(goal.date);
  const target = goal.repeat || !dated ? new Date() : new Date(dated);
  target.setHours(time.hour, time.minute, 0, 0);
  return target;
}

export function isTimeEditLocked(goal: Goal): boolean {
  const target = getGoalTargetDate(goal);
  if (!target) return false;
  return target.getTime() - Date.now() <= EDIT_LOCK_WINDOW_MS;
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
    case 'paused':
      return { label: '⏸ Duraklatıldı', color: '#D98C2B' };
    case 'finished':
      return { label: '🎓 Bitirildi', color: '#3DDC84' };
    case 'manual':
    default:
      return { label: '🗄 Arşivlendi', color: '#8A8A8A' };
  }
}

export function isPaused(goal: Goal): boolean {
  return goal.archived && goal.archiveReason === 'paused';
}

export function isFinished(goal: Goal): boolean {
  return goal.archived && goal.archiveReason === 'finished';
}

export function sessionLength(goal: Goal): number {
  return goal.sessionMinutes > 0 ? goal.sessionMinutes : 15;
}

export function goalHoursSpent(goal: Goal): number {
  return Math.round(((goal.completionCount * sessionLength(goal)) / 60) * 10) / 10;
}

export function goalBooksRead(goal: Goal): number {
  if (goal.category !== 'kitap') return 0;
  return Math.floor(goal.pagesRead / 220);
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
  | 'id'
  | 'archived'
  | 'archiveReason'
  | 'lastCompletedDate'
  | 'lastOutcome'
  | 'streak'
  | 'completionCount'
  | 'pointsEarned'
  | 'pagesRead'
  | 'startedAt'
  | 'category'
  | 'timeSlot'
  | 'sessionMinutes'
  | 'coachReason'
> & {
  category?: PlanCategory | null;
  timeSlot?: TimeSlot | null;
  sessionMinutes?: number;
  coachReason?: string;
};

type GoalPatch = Partial<Pick<Goal, 'title' | 'time' | 'endDate' | 'timeSlot'>>;

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
  pauseGoal: (id: string) => void;
  finishGoal: (id: string) => Goal | null;
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
      category: isPlanCategory(item.category) ? item.category : null,
      timeSlot: isTimeSlot(item.timeSlot) ? item.timeSlot : null,
      sessionMinutes: typeof item.sessionMinutes === 'number' ? item.sessionMinutes : 0,
      completionCount: typeof item.completionCount === 'number' ? item.completionCount : 0,
      pointsEarned: typeof item.pointsEarned === 'number' ? item.pointsEarned : 0,
      pagesRead: typeof item.pagesRead === 'number' ? item.pagesRead : 0,
      startedAt: typeof item.startedAt === 'string' ? item.startedAt : null,
      coachReason: typeof item.coachReason === 'string' ? item.coachReason : '',
    }));
}

function isPlanCategory(value: unknown): value is PlanCategory {
  return (
    value === 'kitap' ||
    value === 'yuruyus' ||
    value === 'vucut' ||
    value === 'muzik' ||
    value === 'dil' ||
    value === 'akademik'
  );
}

function isTimeSlot(value: unknown): value is TimeSlot {
  return value === 'sabah' || value === 'ogle' || value === 'aksam';
}

function resetBrokenStreaks(goals: Goal[]): Goal[] {
  const today = todayIso();
  const yesterday = yesterdayIso();
  let changed = false;
  const next = goals.map((goal) => {
    if (goal.archived || goal.archiveReason === 'paused' || !goal.repeat || goal.streak <= 0) {
      return goal;
    }
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
      category: goal.category ?? null,
      timeSlot: goal.timeSlot ?? null,
      sessionMinutes: goal.sessionMinutes ?? 0,
      completionCount: 0,
      pointsEarned: 0,
      pagesRead: 0,
      startedAt: todayIso(),
      coachReason: goal.coachReason ?? '',
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
    const counted = outcome !== 'missed';
    const extraPages =
      counted && goal.category === 'kitap'
        ? Math.max(6, Math.round(sessionLength(goal) * 0.7))
        : 0;

    setGoals((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const stats = {
          completionCount: counted ? item.completionCount + 1 : item.completionCount,
          pointsEarned: item.pointsEarned + points,
          pagesRead: item.pagesRead + extraPages,
        };
        if (item.repeat) {
          return {
            ...item,
            ...stats,
            lastCompletedDate: day,
            lastOutcome: outcome,
            streak: nextStreak,
          };
        }
        return { ...item, ...stats, archived: true, archiveReason: outcome };
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
      message: getConfrontationMessage(nextStreak, Boolean(bonus)),
    };
  }, []);

  const archiveGoal = useCallback((id: string) => {
    void cancelGoalAlarm(id);
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, archived: true, archiveReason: 'manual' } : g)),
    );
  }, []);

  const pauseGoal = useCallback((id: string) => {
    void cancelGoalAlarm(id);
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, archived: true, archiveReason: 'paused' } : g)),
    );
  }, []);

  const finishGoal = useCallback((id: string): Goal | null => {
    const current = goalsRef.current.find((g) => g.id === id);
    if (!current) return null;
    void cancelGoalAlarm(id);
    const next = { ...current, archived: true, archiveReason: 'finished' as const };
    setGoals((prev) => prev.map((g) => (g.id === id ? next : g)));
    return next;
  }, []);

  const restoreGoal = useCallback((id: string) => {
    const current = goalsRef.current.find((g) => g.id === id);
    if (!current) return;
    const today = todayIso();
    const preservedDate =
      current.archiveReason === 'paused' && current.lastCompletedDate !== today
        ? yesterdayIso()
        : current.lastCompletedDate;
    const restored = {
      ...current,
      archived: false,
      archiveReason: null,
      lastCompletedDate: preservedDate,
    };
    const next = maintainGoals([restored])[0];
    setGoals((prev) =>
      maintainGoals(prev.map((g) => (g.id === id ? restored : g))),
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
      pauseGoal,
      finishGoal,
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
      pauseGoal,
      finishGoal,
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
