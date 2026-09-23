import {
  addMinutesToClock,
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
  { id: '15', label: '15 dakika', minutes: 15 },
  { id: '20', label: '20 dakika', minutes: 20 },
  { id: '30', label: '30 dakika', minutes: 30 },
  { id: '45', label: '45+ dakika', minutes: 45 },
] as const;

export const WALK_Q1_OPTIONS = [
  { id: '0', label: 'Hiç' },
  { id: '1-2', label: 'Haftada 1–2' },
  { id: '3-4', label: 'Haftada 3–4' },
  { id: 'her-gun', label: 'Neredeyse her gün' },
] as const;

export const WALK_Q2_OPTIONS = [
  { id: '15', label: '15 dakika', minutes: 15 },
  { id: '20', label: '20 dakika', minutes: 20 },
  { id: '30', label: '30 dakika', minutes: 30 },
  { id: '45', label: '45+ dakika', minutes: 45 },
] as const;

export const WALK_Q3_OPTIONS: { id: TimeSlot; label: string }[] = [
  { id: 'sabah', label: 'Sabah' },
  { id: 'ogle', label: 'Öğle' },
  { id: 'aksam', label: 'Akşam' },
];

export const INTAKE_CATEGORIES: PlanCategory[] = ['kitap', 'yuruyus'];

export function hasIntakeQuestions(category: PlanCategory | null): boolean {
  return !!category && INTAKE_CATEGORIES.includes(category);
}

const DEFAULT_MINUTES: Record<PlanCategory, number> = {
  kitap: 15,
  yuruyus: 15,
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
  if (focusId === '15' || booksLast6Months === '0') return 'aksam';
  if (focusId === '45') return 'sabah';
  return 'ogle';
}

export type CoachPlanAnalysis = {
  sessionMinutes: number;
  programDays: number;
  recommendedSlot: TimeSlot;
  summary: string;
};

export type BookPlanAnalysis = CoachPlanAnalysis;

export function analyzeBookReading(
  booksLast6Months: string,
  focusId: string,
  reason: string,
): BookPlanAnalysis {
  const capacity = Math.max(
    15,
    BOOK_Q2_OPTIONS.find((item) => item.id === focusId)?.minutes ?? 15,
  );

  let minutes = 15;
  let habitLine = 'Alışkanlığın yok. 15 dakikadan başlıyoruz.';
  if (booksLast6Months === '1-2') {
    minutes = 20;
    habitLine = 'Az okumuşsun. 20 dakikalık oturumla devam.';
  } else if (booksLast6Months === '3-5') {
    minutes = 25;
    habitLine = 'Tempo var. 25 dakika oturacaksın.';
  } else if (booksLast6Months === '6+') {
    minutes = 30;
    habitLine = 'Okuyorsun. 30 dakikayı hak ediyorsun ama kaçış yok.';
  }

  minutes = Math.max(15, Math.min(minutes, capacity));
  if (capacity === 15) {
    minutes = 15;
    habitLine = 'Odak süren kısa. 15 dakikanın altına inilmez.';
  } else if (capacity > minutes) {
    minutes = Math.min(capacity, minutes + 5);
  }

  const reasonTrimmed = reason.trim();
  let reasonLine = 'Sebebin kısa. Abartmıyoruz.';
  if (reasonTrimmed.length >= 20 && capacity > 15) {
    minutes = Math.min(capacity, minutes + 5);
    reasonLine = 'Sebebin net. Süreye 5 dakika eklendi.';
  } else if (reasonTrimmed.length >= 20) {
    reasonLine = 'Sebebin net. Yine de 15 dakikanın altına inilmez.';
  }

  minutes = Math.max(15, minutes);

  let programDays = 21;
  if (booksLast6Months === '0' || booksLast6Months === '1-2') programDays = 28;
  else if (booksLast6Months === '3-5') programDays = 24;
  else programDays = 21;
  if (minutes <= 15) programDays += 7;

  const slot = recommendedSlot(booksLast6Months, focusId);

  return {
    sessionMinutes: minutes,
    programDays,
    recommendedSlot: slot,
    summary: `${habitLine} ${reasonLine} Her oturum ${minutes} dk, program ${programDays} gün.`,
  };
}

export function analyzeWalking(
  frequency: string,
  capacityId: string,
  slotPref: TimeSlot,
): CoachPlanAnalysis {
  const capacity = Math.max(
    15,
    WALK_Q2_OPTIONS.find((item) => item.id === capacityId)?.minutes ?? 15,
  );

  let minutes = 15;
  let habitLine = 'Yürüme alışkanlığın yok. Kısa süreyle başlıyoruz.';
  if (frequency === '1-2') {
    minutes = 20;
    habitLine = 'Haftada bir-iki yetmez. Süre buradan çıkar.';
  } else if (frequency === '3-4') {
    minutes = 25;
    habitLine = 'Tempo var. Kaçış yok.';
  } else if (frequency === 'her-gun') {
    minutes = 30;
    habitLine = 'Yürüyorsun. Süre kaçışa göre ayarlanmaz.';
  }

  minutes = Math.max(15, Math.min(minutes, capacity));
  if (capacity === 15) {
    minutes = 15;
    habitLine = 'Nefesin kısa. 15 dakikanın altına inilmez.';
  } else if (capacity > minutes) {
    minutes = Math.min(capacity, minutes + 5);
  }

  let programDays = 21;
  if (frequency === '0' || frequency === '1-2') programDays = 28;
  else if (frequency === '3-4') programDays = 24;
  else programDays = 21;
  if (minutes <= 15) programDays += 7;

  const slotLabel = WALK_Q3_OPTIONS.find((item) => item.id === slotPref)?.label ?? 'Akşam';

  return {
    sessionMinutes: minutes,
    programDays,
    recommendedSlot: slotPref,
    summary: `${habitLine} ${slotLabel} dilimi senin. Her yürüyüş ${minutes} dk, program ${programDays} gün.`,
  };
}

export function sessionMinutesForPlan(
  category: PlanCategory,
  focusId?: string,
  booksLast6Months?: string,
  reason?: string,
): number {
  if (category === 'kitap') {
    return analyzeBookReading(booksLast6Months ?? '0', focusId ?? '15', reason ?? '').sessionMinutes;
  }
  return DEFAULT_MINUTES[category];
}

function addDaysToDisplay(days: number): string {
  const day = startOfToday();
  day.setDate(day.getDate() + days);
  return `${padDatePart(day.getDate())}.${padDatePart(day.getMonth() + 1)}.${day.getFullYear()}`;
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
  programDays?: number;
  analysisSummary?: string;
}): {
  type: 'coach';
  title: string;
  description: string;
  date: string;
  time: string;
  endTime: string;
  repeat: RepeatConfig;
  endDate: string;
  category: PlanCategory;
  timeSlot: TimeSlot;
  sessionMinutes: number;
  coachReason: string;
} {
  const slot = TIME_SLOTS.find((item) => item.id === input.slot) ?? TIME_SLOTS[0];
  const endTime = addMinutesToClock(slot.time, input.sessionMinutes);
  const reasonLine = input.coachReason.trim()
    ? `Sebep: ${input.coachReason.trim()}`
    : 'Koçtan gelen günlük plan.';
  const analysisLine = input.analysisSummary?.trim() ?? '';
  const endDate = input.programDays ? addDaysToDisplay(input.programDays) : '';

  // Tarih, saat ve gün dilimi kartta ayrı satırda gösterildiği için burada tekrarlanmaz.
  return {
    type: 'coach',
    title: CATEGORY_TITLES[input.category](input.sessionMinutes),
    description: [analysisLine, reasonLine].filter(Boolean).join(' '),
    date: todayDisplayDate(),
    time: slot.time,
    endTime,
    repeat: DAILY,
    endDate,
    category: input.category,
    timeSlot: input.slot,
    sessionMinutes: input.sessionMinutes,
    coachReason: input.coachReason.trim(),
  };
}
