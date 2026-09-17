import {
  padDatePart,
  startOfToday,
  type PlanCategory,
  type RepeatConfig,
  type TimeSlot,
} from '@/context/GoalContext';

export const PLAN_CATEGORIES: { id: PlanCategory; label: string; emoji: string }[] = [
  { id: 'kitap', label: 'Kitap Okuma', emoji: '📖' },
  { id: 'yuruyus', label: 'Yürüyüş', emoji: '🚶' },
  { id: 'vucut', label: 'Vücut Geliştirme', emoji: '💪' },
  { id: 'muzik', label: 'Müzik', emoji: '🎵' },
  { id: 'dil', label: 'Dil Öğrenme', emoji: '🗣️' },
  { id: 'akademik', label: 'Akademik Çalışma', emoji: '📚' },
];

export const TIME_SLOTS: { id: TimeSlot; label: string; time: string; hint: string }[] = [
  { id: 'sabah', label: 'Sabah', time: '07:00', hint: 'Kimse bakmazken.' },
  { id: 'ogle', label: 'Öğle', time: '12:30', hint: 'Mola değil, iş.' },
  { id: 'aksam', label: 'Akşam', time: '20:30', hint: 'Ekranı kapat.' },
];

export const BOOK_Q1_OPTIONS = [
  { id: '0', label: 'Hiç' },
  { id: '1-2', label: '1–2 kitap' },
  { id: '3-5', label: '3–5 kitap' },
  { id: '6+', label: '6 veya daha fazla' },
] as const;

export const BOOK_Q2_OPTIONS = [
  { id: '10', label: '10 dakika', minutes: 10 },
  { id: '20', label: '20 dakika', minutes: 20 },
  { id: '30', label: '30 dakika', minutes: 30 },
  { id: '45', label: '45+ dakika', minutes: 45 },
] as const;

const DEFAULT_MINUTES: Record<PlanCategory, number> = {
  kitap: 20,
  yuruyus: 25,
  vucut: 40,
  muzik: 25,
  dil: 20,
  akademik: 45,
};

const CATEGORY_TITLES: Record<PlanCategory, (minutes: number) => string> = {
  kitap: (minutes) => `Günlük kitap: ${minutes} dk`,
  yuruyus: (minutes) => `Günlük yürüyüş: ${minutes} dk`,
  vucut: (minutes) => `Antrenman: ${minutes} dk`,
  muzik: (minutes) => `Müzik çalışması: ${minutes} dk`,
  dil: (minutes) => `Dil çalışması: ${minutes} dk`,
  akademik: (minutes) => `Akademik çalışma: ${minutes} dk`,
};

export function categoryLabel(category: PlanCategory | null): string {
  return PLAN_CATEGORIES.find((item) => item.id === category)?.label ?? 'Hedef';
}

export function recommendedSlot(booksLast6Months: string, focusId: string): TimeSlot {
  if (focusId === '10' || booksLast6Months === '0') return 'aksam';
  if (focusId === '45') return 'sabah';
  return 'ogle';
}

export function sessionMinutesForPlan(category: PlanCategory, focusId?: string): number {
  if (category === 'kitap') {
    return BOOK_Q2_OPTIONS.find((item) => item.id === focusId)?.minutes ?? DEFAULT_MINUTES.kitap;
  }
  return DEFAULT_MINUTES[category];
}

function todayDisplayDate(): string {
  const today = startOfToday();
  return `${padDatePart(today.getDate())}.${padDatePart(today.getMonth() + 1)}.${today.getFullYear()}`;
}

const DAILY: RepeatConfig = { unit: 'gun', interval: 1 };

export function buildCoachGoal(input: {
  category: PlanCategory;
  slot: TimeSlot;
  sessionMinutes: number;
  coachReason: string;
}): {
  title: string;
  description: string;
  date: string;
  time: string;
  repeat: RepeatConfig;
  endDate: string;
  category: PlanCategory;
  timeSlot: TimeSlot;
  sessionMinutes: number;
  coachReason: string;
} {
  const slot = TIME_SLOTS.find((item) => item.id === input.slot) ?? TIME_SLOTS[0];
  const reasonLine = input.coachReason.trim()
    ? `Sebep: ${input.coachReason.trim()}`
    : 'Koçtan gelen günlük plan.';

  return {
    title: CATEGORY_TITLES[input.category](input.sessionMinutes),
    description: `${categoryLabel(input.category)} · ${slot.label} ${slot.time}. ${reasonLine}`,
    date: todayDisplayDate(),
    time: slot.time,
    repeat: DAILY,
    endDate: '',
    category: input.category,
    timeSlot: input.slot,
    sessionMinutes: input.sessionMinutes,
    coachReason: input.coachReason.trim(),
  };
}
