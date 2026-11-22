// ---------------------------------------------------------------------------
// Su içme planı — boy/kilodan günlük hedef, uyanış saatinden uyarı saatleri.
// GoalContext bu dosyayı içe aktardığı için burada context'ten değer alınmaz.
// ---------------------------------------------------------------------------

export type WaterSettings = {
  heightCm: number;
  weightKg: number;
  wakeTime: string;
  intervalMinutes: number;
};

export type WaterEntry = {
  id: string;
  ml: number;
  time: string;
};

export type WaterDay = {
  date: string;
  entries: WaterEntry[];
};

export const WATER_MIN_ML = 1500;
export const WATER_MAX_ML = 4000;

export const HEIGHT_RANGE = { min: 120, max: 230 };
export const WEIGHT_RANGE = { min: 30, max: 250 };

const REFERENCE_HEIGHT_CM = 170;
const ML_PER_KG = 35;
const ML_PER_CM = 10;

// İlk uyarı uyanıştan 1 saat sonra; uyarılar 15 saatlik uyanık pencerede kalır.
export const FIRST_REMINDER_DELAY_MIN = 60;
const AWAKE_WINDOW_MIN = 15 * 60;
export const MAX_WATER_SLOTS = 14;

export const WATER_INTERVAL_OPTIONS = [
  { id: '60', label: 'Saat başı', minutes: 60 },
  { id: '90', label: '1.5 saatte bir', minutes: 90 },
  { id: '120', label: '2 saatte bir', minutes: 120 },
  { id: '180', label: '3 saatte bir', minutes: 180 },
] as const;

export const WATER_ML_OPTIONS = [150, 200, 250, 300, 500] as const;

export const DEFAULT_WAKE_TIME = '08:00';
export const DEFAULT_INTERVAL_MINUTES = 120;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function parseClockTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function addMinutesToTime(time: string, minutes: number): string {
  const parsed = parseClockTime(time);
  if (!parsed) return '';
  const total = parsed.hour * 60 + parsed.minute + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

export function minutesSinceMidnight(time: string): number {
  const parsed = parseClockTime(time);
  return parsed ? parsed.hour * 60 + parsed.minute : 0;
}

export function calculateDailyWaterMl(heightCm: number, weightKg: number): number {
  const base = weightKg * ML_PER_KG + (heightCm - REFERENCE_HEIGHT_CM) * ML_PER_CM;
  const clamped = Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, base));
  return Math.round(clamped / 100) * 100;
}

export function formatLiters(ml: number): string {
  return `${(Math.max(0, ml) / 1000).toFixed(1).replace('.', ',')} L`;
}

export function buildWaterSlots(wakeTime: string, intervalMinutes: number): string[] {
  if (!parseClockTime(wakeTime) || intervalMinutes <= 0) return [];

  const slots: string[] = [];
  for (
    let offset = FIRST_REMINDER_DELAY_MIN;
    offset <= AWAKE_WINDOW_MIN && slots.length < MAX_WATER_SLOTS;
    offset += intervalMinutes
  ) {
    slots.push(addMinutesToTime(wakeTime, offset));
  }
  return slots;
}

export function perSlotMl(targetMl: number, slotCount: number): number {
  if (slotCount <= 0) return 0;
  return Math.max(50, Math.round(targetMl / slotCount / 50) * 50);
}

// Şu ana en yakın gelecek uyarı; gün bittiyse yarının ilk uyarısına düşer.
export function nextSlotAfter(slots: string[], now: Date): string | null {
  if (slots.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = slots.find((slot) => minutesSinceMidnight(slot) > nowMinutes);
  return upcoming ?? slots[0];
}

export function isWaterSettings(value: unknown): value is WaterSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<WaterSettings>;
  return (
    typeof settings.heightCm === 'number' &&
    typeof settings.weightKg === 'number' &&
    typeof settings.wakeTime === 'string' &&
    parseClockTime(settings.wakeTime) !== null &&
    typeof settings.intervalMinutes === 'number' &&
    settings.intervalMinutes > 0
  );
}

export function normalizeWaterDay(raw: unknown, today: string): WaterDay {
  const empty: WaterDay = { date: today, entries: [] };
  if (!raw || typeof raw !== 'object') return empty;

  const day = raw as Partial<WaterDay>;
  if (day.date !== today || !Array.isArray(day.entries)) return empty;

  return {
    date: today,
    entries: day.entries
      .filter(
        (entry): entry is WaterEntry =>
          !!entry &&
          typeof entry === 'object' &&
          typeof entry.id === 'string' &&
          typeof entry.ml === 'number' &&
          typeof entry.time === 'string',
      )
      .map((entry) => ({ id: entry.id, ml: entry.ml, time: entry.time })),
  };
}

export function waterCoachLine(consumedMl: number, targetMl: number): string {
  if (targetMl <= 0) return 'Önce boyunu ve kilonu gir.';
  const ratio = consumedMl / targetMl;
  if (ratio <= 0) return 'Bugün tek yudum yok. Bardağı doldur.';
  if (ratio < 0.25) return 'Başladın ama bu kadarı hiçbir şey. Devam.';
  if (ratio < 0.5) return 'Yarıya bile gelmedin. Uyarıyı görünce iç.';
  if (ratio < 0.75) return 'Yarıyı geçtin. Akşama bırakma.';
  if (ratio < 1) return 'Az kaldı. Şimdi bırakırsan bugün de eksik.';
  return 'Hedefi tamamladın. Yarın sıfırdan başlıyorsun.';
}
