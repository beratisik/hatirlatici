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
  cancelStreakWarning,
  cancelWaterReminders,
  presentStreakCoachNotification,
  scheduleGoalAlarm,
  scheduleStreakWarning,
  syncGoalAlarms,
  syncRankReminder,
  syncWaterReminders,
} from '@/lib/notifications';
import {
  buildWaterSlots,
  calculateDailyWaterMl,
  isWaterSettings,
  normalizeWaterDay,
  perSlotMl,
  type WaterDay,
  type WaterEntry,
  type WaterSettings,
} from '@/lib/water';
import { emailTaken, foldIdentity, identifierMatches, secretsMatch, usernameTaken } from '@/lib/password';

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

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LABEL: Record<Weekday, string> = {
  Sunday: 'Paz',
  Monday: 'Pzt',
  Tuesday: 'Sal',
  Wednesday: 'Çar',
  Thursday: 'Per',
  Friday: 'Cum',
  Saturday: 'Cmt',
};

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value);
}

export function normalizeDaysOfWeek(value: unknown): Weekday[] | null {
  if (!Array.isArray(value)) return null;
  const days = WEEKDAYS.filter((day) => value.includes(day));
  return days.length > 0 ? [...days] : null;
}

export function weekdayOf(day: Date): Weekday {
  return WEEKDAYS[day.getDay()];
}

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
  | 'finished'
  | 'completed';
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

/**
 * 'reminder' = düz anımsatıcı: puan, seri ve swipe yok.
 * 'coach'    = gelişim hedefi: puan, seri ve swipe mekaniği burada çalışır.
 */
export type GoalType = 'reminder' | 'coach';

export const GOAL_TYPE_COLORS: Record<GoalType, string> = {
  reminder: '#3E7CB1',
  coach: '#C1121F',
};

export type Goal = {
  id: string;
  type: GoalType;
  title: string;
  description: string;
  date: string;
  time: string;
  endTime: string;
  repeat: RepeatConfig | null;
  daysOfWeek: Weekday[] | null;
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

export function formatGoalCadence(goal: Pick<Goal, 'repeat' | 'daysOfWeek'>): string {
  const days = goal.daysOfWeek;
  if (days && days.length > 0) {
    if (days.length === WEEKDAYS.length) return 'Her gün';
    return days.map((day) => WEEKDAY_LABEL[day]).join(', ');
  }
  return formatRepeatSummary(goal.repeat);
}

function previousScheduledIso(days: Weekday[]): string | null {
  const start = startOfToday();
  for (let offset = 1; offset <= WEEKDAYS.length; offset += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() - offset);
    if (days.includes(WEEKDAYS[day.getDay()])) return toIso(day);
  }
  return null;
}

function keepsStreak(goal: Goal): boolean {
  const last = goal.lastCompletedDate;
  if (!last) return false;
  if (last === todayIso()) return true;
  if (goal.daysOfWeek && goal.daysOfWeek.length > 0) {
    return last === previousScheduledIso(goal.daysOfWeek);
  }
  return last === yesterdayIso();
}

export function isScheduledToday(goal: Goal): boolean {
  if (!goal.daysOfWeek || goal.daysOfWeek.length === 0) return true;
  return goal.daysOfWeek.includes(WEEKDAYS[startOfToday().getDay()]);
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

export function addMinutesToClock(time: string, minutes: number): string {
  const parsed = parseGoalTime(time);
  if (!parsed) return '';
  const total = parsed.hour * 60 + parsed.minute + Math.max(0, minutes);
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${padDatePart(Math.floor(wrapped / 60))}:${padDatePart(wrapped % 60)}`;
}

export function formatTimeRange(start: string, end: string): string {
  if (start && end) return `${start}–${end}`;
  return start;
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
  return goal.repeat != null || (goal.daysOfWeek?.length ?? 0) > 0;
}

export function isCoachGoal(goal: Goal): boolean {
  return goal.type === 'coach';
}

export function isReminderGoal(goal: Goal): boolean {
  return goal.type === 'reminder';
}

/** Tekrarlı bir anımsatıcı bugün için işaretlenmiş mi. Puan ya da seri anlamı taşımaz. */
export function isReminderDoneToday(goal: Goal): boolean {
  return goal.type === 'reminder' && !!goal.repeat && goal.lastCompletedDate === todayIso();
}

export const STREAK_WARNING_HOUR = 21;
const STREAK_WARNING_LATEST_MINUTES = 23 * 60 + 30;
const STREAK_WARNING_GRACE_MINUTES = 30;

export function isStreakAtRisk(goal: Goal): boolean {
  return (
    goal.type === 'coach' &&
    !goal.archived &&
    isRepeating(goal) &&
    isScheduledToday(goal) &&
    goal.streak > 0 &&
    goal.lastCompletedDate !== todayIso()
  );
}

/**
 * Serisi tehlikedeki bir koç hedefi için akşam uyarısının bugünkü saati.
 * Görev saati akşamdan sonraysa uyarı görevin ardına kayar, gece yarısını geçmez.
 */
export function getStreakWarningAt(goal: Goal, now = new Date()): Date | null {
  if (!isStreakAtRisk(goal)) return null;

  const clock = parseGoalTime(goal.endTime || goal.time);
  const afterTask = clock ? clock.hour * 60 + clock.minute + STREAK_WARNING_GRACE_MINUTES : 0;
  const minutes = Math.min(
    Math.max(STREAK_WARNING_HOUR * 60, afterTask),
    STREAK_WARNING_LATEST_MINUTES,
  );

  const fireAt = new Date(now);
  fireAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return fireAt.getTime() > now.getTime() ? fireAt : null;
}

export function streakWarningMessage(goal: Goal): string {
  return `Dikkat! ${goal.title} için ${goal.streak} günlük serin bitmek üzere. Harekete geç!`;
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
    case 'completed':
      return { label: '✓ Tamamlandı', color: '#3DDC84' };
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

export type ScoreLadderRank = {
  name: string;
  min: number;
  max: number | null;
};

export const SCORE_LADDER: ScoreLadderRank[] = [
  { name: 'Başlangıç', min: 0, max: 29 },
  { name: 'Çaylak', min: 30, max: 79 },
  { name: 'Gönüllü', min: 80, max: 149 },
  { name: 'Kararlı', min: 150, max: 299 },
  { name: 'Disiplinli', min: 300, max: 499 },
  { name: 'Sarsılmaz', min: 500, max: 799 },
  { name: 'Profesyonel', min: 800, max: 1199 },
  { name: 'Komando', min: 1200, max: 1799 },
  { name: 'Kurmay', min: 1800, max: null },
];

export function getRankName(score: number): string {
  let name = SCORE_LADDER[0].name;
  for (const rank of SCORE_LADDER) {
    if (score >= rank.min) name = rank.name;
  }
  return name;
}

export function formatScoreLadderRange(rank: ScoreLadderRank): string {
  if (rank.max == null) return `${rank.min}+ Puan`;
  return `${rank.min} - ${rank.max} Puan`;
}

export type User = {
  name: string;
  surname: string;
  username: string;
  email: string;
  password: string;
  avatarUri: string | null;
  gender: Gender | null;
};

type PersistedState = {
  goals: Goal[];
  score: number;
  user: User | null;
  accounts?: User[];
  isLoggedIn: boolean;
  profile: string | null;
  waterSettings: WaterSettings | null;
  waterDay: WaterDay | null;
};

export type WaterSummary = {
  settings: WaterSettings | null;
  targetMl: number;
  consumedMl: number;
  remainingMl: number;
  progress: number;
  entries: WaterEntry[];
  slots: string[];
  sipMl: number;
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
  | 'endTime'
  | 'daysOfWeek'
> & {
  category?: PlanCategory | null;
  timeSlot?: TimeSlot | null;
  sessionMinutes?: number;
  coachReason?: string;
  endTime?: string;
  daysOfWeek?: Weekday[] | null;
};

type GoalPatch = Partial<
  Pick<
    Goal,
    | 'title'
    | 'description'
    | 'time'
    | 'endDate'
    | 'endTime'
    | 'timeSlot'
    | 'sessionMinutes'
    | 'daysOfWeek'
    | 'coachReason'
    | 'category'
  >
>;

type GoalContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  profile: string | null;

  goals: Goal[];
  addGoal: (goal: NewGoalInput) => void;
  updateGoal: (id: string, patch: GoalPatch) => void;
  deleteGoal: (id: string) => void;
  completeGoal: (id: string, outcome: GoalOutcome) => CompleteResult;
  completeReminder: (id: string) => void;
  archiveGoal: (id: string) => void;
  pauseGoal: (id: string) => void;
  finishGoal: (id: string) => Goal | null;
  restoreGoal: (id: string) => void;

  user: User | null;
  setUser: (user: User) => void;
  registerAccount: (user: User) => 'ok' | 'email' | 'username';
  authenticate: (identifier: string, password: string) => boolean;
  updatePassword: (currentPassword: string, newPassword: string) => boolean;
  updateAvatar: (uri: string) => void;
  login: () => void;
  logout: () => void;
  setProfile: (profile: string) => void;

  water: WaterSummary;
  saveWaterSettings: (settings: WaterSettings) => void;
  logWater: (ml: number) => void;
  undoLastWater: () => void;
  clearWaterPlan: () => void;
  wipeAllData: () => Promise<void>;

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
    name: value.name.trim(),
    surname: typeof value.surname === 'string' ? value.surname.trim() : '',
    username:
      typeof value.username === 'string' && value.username.trim()
        ? value.username.trim()
        : value.email.split('@')[0]?.trim() || value.name.trim(),
    email: value.email.trim(),
    password: value.password,
    avatarUri: typeof value.avatarUri === 'string' ? value.avatarUri : null,
    gender: isGender(value.gender) ? value.gender : null,
  };
}

function normalizeAccounts(raw: unknown, fallback: User | null): User[] {
  const list = Array.isArray(raw)
    ? raw.map(normalizeUser).filter((item): item is User => !!item)
    : [];
  const withFallback = list.length > 0 ? list : fallback ? [fallback] : [];
  const unique: User[] = [];
  for (const account of withFallback) {
    if (emailTaken(unique, account.email) || usernameTaken(unique, account.username)) continue;
    unique.push(account);
  }
  return unique;
}

function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Goal => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => ({
      ...item,
      // Tip alanı eklenmeden önce kaydedilenler: kategori taşıyanlar koç planıdır.
      type: isGoalType(item.type)
        ? item.type
        : isPlanCategory(item.category)
          ? ('coach' as const)
          : ('reminder' as const),
      daysOfWeek: normalizeDaysOfWeek(item.daysOfWeek),
      endDate: typeof item.endDate === 'string' ? item.endDate : '',
      endTime:
        typeof item.endTime === 'string' && item.endTime
          ? item.endTime
          : item.time && typeof item.sessionMinutes === 'number' && item.sessionMinutes > 0
            ? addMinutesToClock(item.time, item.sessionMinutes)
            : '',
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

function isGoalType(value: unknown): value is GoalType {
  return value === 'reminder' || value === 'coach';
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
  let changed = false;
  const next = goals.map((goal) => {
    if (
      goal.type !== 'coach' ||
      goal.archived ||
      goal.archiveReason === 'paused' ||
      !isRepeating(goal) ||
      goal.streak <= 0
    ) {
      return goal;
    }
    if (keepsStreak(goal)) return goal;
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
  const [accounts, setAccounts] = useState<User[]>([]);
  const [score, setScore] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfileState] = useState<string | null>(null);
  const [waterSettings, setWaterSettings] = useState<WaterSettings | null>(null);
  const [waterDay, setWaterDay] = useState<WaterDay>(() => ({ date: todayIso(), entries: [] }));
  const [dayStamp, setDayStamp] = useState(() => todayIso());
  const skipPersist = useRef(true);
  const goalsRef = useRef<Goal[]>([]);
  const accountsRef = useRef<User[]>([]);
  goalsRef.current = goals;
  accountsRef.current = accounts;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          const nextGoals = maintainGoals(normalizeGoals(parsed.goals));
          const nextUser = normalizeUser(parsed.user);
          const nextAccounts = normalizeAccounts(parsed.accounts, nextUser);
          setGoals(nextGoals);
          setScore(typeof parsed.score === 'number' ? parsed.score : 0);
          setAccounts(nextAccounts);
          setUserState(nextUser);
          setIsLoggedIn(Boolean(parsed.isLoggedIn && parsed.user));
          setProfileState(typeof parsed.profile === 'string' ? parsed.profile : null);
          setWaterSettings(isWaterSettings(parsed.waterSettings) ? parsed.waterSettings : null);
          setWaterDay(normalizeWaterDay(parsed.waterDay, todayIso()));
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
      accounts,
      isLoggedIn,
      profile,
      waterSettings,
      waterDay,
    };

    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [goals, score, user, accounts, isLoggedIn, profile, waterSettings, waterDay, isReady]);

  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    void syncRankReminder(getRank(score));
  }, [isReady, isLoggedIn, score]);

  useEffect(() => {
    if (!isReady) return;
    setGoals((prev) => maintainGoals(prev));
    setWaterDay((prev) => (prev.date === todayIso() ? prev : { date: todayIso(), entries: [] }));
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    void syncGoalAlarms(goalsRef.current);
  }, [isReady, isLoggedIn]);

  // Serisi tehlikeye giren koç hedefleri için akşam uyarısını kur, riski
  // kalmayanlarınkini kaldır.
  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    const now = new Date();
    for (const goal of goals) {
      if (goal.type !== 'coach') continue;
      const fireAt = getStreakWarningAt(goal, now);
      if (fireAt) {
        void scheduleStreakWarning(goal.id, fireAt, streakWarningMessage(goal));
      } else {
        void cancelStreakWarning(goal.id);
      }
    }
  }, [isReady, isLoggedIn, goals]);

  // Gün 00:00'da dönünce, uygulama açıkken de işaretlenmemiş serileri sıfırla.
  useEffect(() => {
    if (!isReady) return;
    const midnight = startOfToday();
    midnight.setDate(midnight.getDate() + 1);
    const timer = setTimeout(
      () => {
        setDayStamp(todayIso());
        setGoals((prev) => maintainGoals(prev));
        setWaterDay((prev) => (prev.date === todayIso() ? prev : { date: todayIso(), entries: [] }));
      },
      Math.max(1000, midnight.getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [isReady, dayStamp]);

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
      endTime:
        goal.endTime ??
        (goal.time && (goal.sessionMinutes ?? 0) > 0
          ? addMinutesToClock(goal.time, goal.sessionMinutes ?? 0)
          : ''),
      completionCount: 0,
      pointsEarned: 0,
      pagesRead: 0,
      startedAt: todayIso(),
      coachReason: goal.coachReason ?? '',
      daysOfWeek: normalizeDaysOfWeek(goal.daysOfWeek),
    };
    setGoals((prev) => maintainGoals([...prev, created]));
    void scheduleGoalAlarm(created);
  }, []);

  const updateGoal = useCallback((id: string, patch: GoalPatch) => {
    const current = goalsRef.current.find((item) => item.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (patch.daysOfWeek !== undefined) {
      next.daysOfWeek = normalizeDaysOfWeek(patch.daysOfWeek);
    }
    const minutes = patch.sessionMinutes ?? current.sessionMinutes;
    if ((patch.time || patch.sessionMinutes) && !patch.endTime && next.time && minutes > 0) {
      next.endTime = addMinutesToClock(next.time, minutes);
    }
    setGoals((prev) => maintainGoals(prev.map((item) => (item.id === id ? next : item))));
    void scheduleGoalAlarm(next);
  }, []);

  const deleteGoal = useCallback((id: string) => {
    void cancelGoalAlarm(id);
    void cancelStreakWarning(id);
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
    // Puan ve seri yalnızca koç modülüne ait; anımsatıcılar tamamlanmaz.
    if (goal.type !== 'coach') return empty;
    if (isRepeating(goal) && goal.lastCompletedDate === day) return empty;
    if (goal.daysOfWeek && goal.daysOfWeek.length > 0 && !isScheduledToday(goal)) return empty;

    let nextStreak = goal.streak;
    if (isRepeating(goal)) {
      if (outcome === 'missed') {
        nextStreak = 0;
      } else if (keepsStreak({ ...goal, lastCompletedDate: goal.lastCompletedDate })) {
        nextStreak = goal.lastCompletedDate === day ? goal.streak : goal.streak + 1;
      } else {
        nextStreak = 1;
      }
    }

    const bonus = isRepeating(goal) && outcome === 'onTime' && nextStreak === STREAK_BONUS_AT;
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
        if (isRepeating(item)) {
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

    if (!isRepeating(goal)) {
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

  /**
   * Anımsatıcıyı tamamlandı olarak işaretler. Tekrarlıysa arşive düşmez,
   * sadece bugünü kapatır ve bir sonraki tekrarını bekler.
   */
  const completeReminder = useCallback((id: string) => {
    const goal = goalsRef.current.find((item) => item.id === id);
    if (!goal || goal.type !== 'reminder' || goal.archived) return;

    if (goal.repeat) {
      setGoals((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                lastCompletedDate: todayIso(),
                completionCount: item.completionCount + 1,
              }
            : item,
        ),
      );
      return;
    }

    void cancelGoalAlarm(id);
    setGoals((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              completionCount: item.completionCount + 1,
              archived: true,
              archiveReason: 'completed' as const,
            }
          : item,
      ),
    );
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

  const water = useMemo<WaterSummary>(() => {
    const targetMl = waterSettings
      ? calculateDailyWaterMl(waterSettings.heightCm, waterSettings.weightKg)
      : 0;
    const slots = waterSettings
      ? buildWaterSlots(waterSettings.wakeTime, waterSettings.intervalMinutes)
      : [];
    const consumedMl = waterDay.entries.reduce((total, entry) => total + entry.ml, 0);

    return {
      settings: waterSettings,
      targetMl,
      consumedMl,
      remainingMl: Math.max(0, targetMl - consumedMl),
      progress: targetMl > 0 ? Math.min(1, consumedMl / targetMl) : 0,
      entries: waterDay.entries,
      slots,
      sipMl: perSlotMl(targetMl, slots.length),
    };
  }, [waterSettings, waterDay]);

  // Uyarılar yalnızca plan ya da aralık değişince yeniden kurulur.
  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    if (!waterSettings) {
      void cancelWaterReminders();
      return;
    }
    void syncWaterReminders(water.slots, water.sipMl);
  }, [isReady, isLoggedIn, waterSettings, water.slots, water.sipMl]);

  const saveWaterSettings = useCallback((settings: WaterSettings) => {
    setWaterSettings(settings);
    setWaterDay((prev) => (prev.date === todayIso() ? prev : { date: todayIso(), entries: [] }));
  }, []);

  const logWater = useCallback((ml: number) => {
    if (ml <= 0) return;
    const day = todayIso();
    const now = new Date();
    const entry: WaterEntry = {
      id: `${Date.now()}-${Math.round(Math.random() * 1000)}`,
      ml,
      time: `${padDatePart(now.getHours())}:${padDatePart(now.getMinutes())}`,
    };
    setWaterDay((prev) =>
      prev.date === day
        ? { date: day, entries: [...prev.entries, entry] }
        : { date: day, entries: [entry] },
    );
  }, []);

  const undoLastWater = useCallback(() => {
    setWaterDay((prev) =>
      prev.entries.length === 0 ? prev : { ...prev, entries: prev.entries.slice(0, -1) },
    );
  }, []);

  const clearWaterPlan = useCallback(() => {
    void cancelWaterReminders();
    setWaterSettings(null);
    setWaterDay({ date: todayIso(), entries: [] });
  }, []);

  const setUser = useCallback((nextUser: User) => {
    const created: User = {
      ...nextUser,
      surname: nextUser.surname ?? '',
      username: nextUser.username ?? '',
      avatarUri: nextUser.avatarUri ?? null,
      gender: nextUser.gender ?? null,
    };
    setUserState(created);
  }, []);

  const registerAccount = useCallback((nextUser: User): 'ok' | 'email' | 'username' => {
    const created: User = {
      ...nextUser,
      surname: nextUser.surname ?? '',
      username: nextUser.username.trim(),
      email: nextUser.email.trim(),
      avatarUri: nextUser.avatarUri ?? null,
      gender: nextUser.gender ?? null,
    };
    const existing = accountsRef.current;
    if (emailTaken(existing, created.email)) return 'email';
    if (usernameTaken(existing, created.username)) return 'username';
    setAccounts((prev) => [...prev, created]);
    setUserState(created);
    return 'ok';
  }, []);

  const authenticate = useCallback((identifier: string, password: string): boolean => {
    const found = accountsRef.current.find(
      (account) =>
        identifierMatches(identifier, account.name, account.email, account.username, account.surname) &&
        secretsMatch(password, account.password),
    );
    if (!found) return false;
    setUserState(found);
    return true;
  }, []);

  const updatePassword = useCallback(
    (currentPassword: string, newPassword: string): boolean => {
      if (!user || !secretsMatch(currentPassword, user.password)) {
        return false;
      }
      const next = { ...user, password: newPassword };
      setUserState(next);
      setAccounts((prev) =>
        prev.map((account) =>
          foldIdentity(account.email) === foldIdentity(next.email) ? next : account,
        ),
      );
      return true;
    },
    [user],
  );

  const updateAvatar = useCallback((uri: string) => {
    setUserState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, avatarUri: uri };
      setAccounts((accounts) =>
        accounts.map((account) =>
          foldIdentity(account.email) === foldIdentity(next.email) ? next : account,
        ),
      );
      return next;
    });
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

  const wipeAllData = useCallback(async () => {
    skipPersist.current = true;
    const current = goalsRef.current;
    await Promise.all([
      ...current.map((goal) => cancelGoalAlarm(goal.id)),
      ...current.map((goal) => cancelStreakWarning(goal.id)),
      cancelWaterReminders(),
    ]);
    await AsyncStorage.clear();
    setGoals([]);
    setScore(0);
    setUserState(null);
    setAccounts([]);
    setIsLoggedIn(false);
    setProfileState(null);
    setWaterSettings(null);
    setWaterDay({ date: todayIso(), entries: [] });
    skipPersist.current = false;
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
      completeReminder,
      archiveGoal,
      pauseGoal,
      finishGoal,
      restoreGoal,
      user,
      setUser,
      registerAccount,
      authenticate,
      updatePassword,
      updateAvatar,
      login,
      logout,
      setProfile,
      water,
      saveWaterSettings,
      logWater,
      undoLastWater,
      clearWaterPlan,
      wipeAllData,
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
      completeReminder,
      archiveGoal,
      pauseGoal,
      finishGoal,
      restoreGoal,
      user,
      setUser,
      registerAccount,
      authenticate,
      updatePassword,
      updateAvatar,
      login,
      logout,
      setProfile,
      water,
      saveWaterSettings,
      logWater,
      undoLastWater,
      clearWaterPlan,
      wipeAllData,
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

export function useWater() {
  const { water, saveWaterSettings, logWater, undoLastWater, clearWaterPlan } = useGoals();
  return { water, saveWaterSettings, logWater, undoLastWater, clearWaterPlan };
}

export function useUser() {
  const {
    user,
    setUser,
    registerAccount,
    authenticate,
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
    registerAccount,
    authenticate,
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
