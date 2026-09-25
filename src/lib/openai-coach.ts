import {
  addMinutesToClock,
  normalizeDaysOfWeek,
  padDatePart,
  startOfToday,
  WEEKDAYS,
  type Goal,
  type PlanCategory,
  type RepeatConfig,
  type TimeSlot,
  type Weekday,
} from '@/context/GoalContext';

import { applyCurrentTasks, loadCoachVoice } from '@/lib/coach-prompt';

const MODEL = 'gpt-4o-mini';
const DAILY: RepeatConfig = { unit: 'gun', interval: 1 };

export type CoachTaskSnapshot = {
  id: string;
  title: string;
  scheduled_time: string;
  days_of_week: Weekday[];
  duration_minutes: number;
};

export type CoachActionType = 'create' | 'update' | 'delete';

export type CoachAction = {
  type: CoachActionType;
  target_task_id: string | null;
  title: string;
  scheduled_time: string;
  days_of_week: Weekday[];
  duration_minutes: number;
};

export type CoachGoalDraft = {
  type: 'coach';
  title: string;
  description: string;
  date: string;
  time: string;
  endTime: string;
  repeat: RepeatConfig;
  daysOfWeek: Weekday[];
  endDate: string;
  category: PlanCategory | null;
  timeSlot: TimeSlot;
  sessionMinutes: number;
  coachReason: string;
};

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type CoachTurn = {
  assistantText: string;
  actions: CoachAction[];
  nextHistory: OpenAIChatMessage[];
};

export function taskSnapshot(goal: Goal): CoachTaskSnapshot {
  const stored = goal.daysOfWeek ?? [];
  const days =
    stored.length > 0 ? stored : goal.repeat?.unit === 'gun' && goal.repeat.interval === 1 ? [...WEEKDAYS] : [];
  return {
    id: goal.id,
    title: goal.title,
    scheduled_time: goal.time,
    days_of_week: days,
    duration_minutes: goal.sessionMinutes > 0 ? goal.sessionMinutes : 30,
  };
}

export function buildCoachSystemPrompt(tasks: CoachTaskSnapshot[], voice: string): string {
  return applyCurrentTasks(voice, JSON.stringify(tasks));
}

function readApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  return env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseClock(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${padDatePart(hour)}:${padDatePart(minute)}`;
}

function conversationHistory(history: OpenAIChatMessage[]): OpenAIChatMessage[] {
  return history.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    if (typeof message.content !== 'string' || !message.content.trim()) return [];
    return [{ role: message.role, content: message.content.trim() }];
  });
}

function parseActions(raw: unknown, knownIds: Set<string>): CoachAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: CoachAction[] = [];

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = item.type;
    if (type !== 'create' && type !== 'update' && type !== 'delete') continue;

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const target =
      typeof item.target_task_id === 'string' && item.target_task_id.trim()
        ? item.target_task_id.trim()
        : null;

    if (type === 'delete') {
      if (!target || !knownIds.has(target)) continue;
      actions.push({
        type,
        target_task_id: target,
        title,
        scheduled_time: '',
        days_of_week: [],
        duration_minutes: 0,
      });
      continue;
    }

    const scheduled = parseClock(item.scheduled_time);
    const days = normalizeDaysOfWeek(item.days_of_week);
    const duration = Number(item.duration_minutes ?? item.duration);
    if (!title || !scheduled || !days || !Number.isFinite(duration)) continue;
    if ((type === 'update' && (!target || !knownIds.has(target))) || (type === 'create' && target)) {
      continue;
    }

    actions.push({
      type,
      target_task_id: type === 'update' ? target : null,
      title,
      scheduled_time: scheduled,
      days_of_week: days,
      duration_minutes: Math.min(60, Math.max(10, Math.round(duration))),
    });
  }

  return actions;
}

function parseCoachPayload(
  content: string,
  knownIds: Set<string>,
): { assistantText: string; actions: CoachAction[] } | null {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const source = fenced?.[1] ?? trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const message = typeof parsed.coach_message === 'string' ? parsed.coach_message.trim() : '';
  return { assistantText: message, actions: parseActions(parsed.actions, knownIds) };
}

async function completeChat(
  messages: OpenAIChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error('OpenAI anahtarı yok. .env dosyasına EXPO_PUBLIC_OPENAI_API_KEY ekle.');
  }

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
  } catch (caught) {
    if (signal?.aborted) throw caught;
    throw new Error('OpenAI’ye ulaşılamadı. Anahtarı ve bağlantıyı kontrol et.');
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null } }[];
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Koç şu an cevap veremedi.');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('Koç boş cevap verdi.');
  return content;
}

export async function requestCoachTurn(
  history: OpenAIChatMessage[],
  userText: string,
  tasks: CoachTaskSnapshot[],
  signal?: AbortSignal,
): Promise<CoachTurn> {
  const prior = conversationHistory(history);
  const userMessage: OpenAIChatMessage = { role: 'user', content: userText };
  const knownIds = new Set(tasks.map((task) => task.id));

  const voice = await loadCoachVoice();
  const content = await completeChat(
    [{ role: 'system', content: buildCoachSystemPrompt(tasks, voice) }, ...prior, userMessage],
    signal,
  );

  const parsed = parseCoachPayload(content, knownIds);
  const assistantText = parsed?.assistantText || 'Konuş. Bahaneyi net yaz.';
  const assistantMessage: OpenAIChatMessage = { role: 'assistant', content: assistantText };

  return {
    assistantText,
    actions: parsed?.actions ?? [],
    nextHistory: [...prior, userMessage, assistantMessage],
  };
}

function todayDisplayDate(): string {
  const today = startOfToday();
  return `${padDatePart(today.getDate())}.${padDatePart(today.getMonth() + 1)}.${today.getFullYear()}`;
}

function slotForTime(time: string): TimeSlot {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'sabah';
  if (hour < 17) return 'ogle';
  return 'aksam';
}

function inferCategory(text: string): PlanCategory | null {
  const value = text.toLocaleLowerCase('tr-TR');
  if (/(kitap|oku|sayfa)/.test(value)) return 'kitap';
  if (/(yürü|yuruyus|koşu|kardiyo|band)/.test(value)) return 'yuruyus';
  if (/(antrenman|vücut|spor|ağırlık)/.test(value)) return 'vucut';
  if (/(müzik|enstrüman|piyano|gitar)/.test(value)) return 'muzik';
  if (/(dil|ingilizce|kelime)/.test(value)) return 'dil';
  if (/(ders|akademik|sınav|ödev)/.test(value)) return 'akademik';
  return null;
}

export function goalFromCoachAction(action: CoachAction): CoachGoalDraft {
  const note = `${action.title}. ${action.days_of_week.join(', ')} · ${action.scheduled_time}.`;
  return {
    type: 'coach',
    title: action.title,
    description: note,
    date: todayDisplayDate(),
    time: action.scheduled_time,
    endTime: addMinutesToClock(action.scheduled_time, action.duration_minutes),
    repeat: DAILY,
    daysOfWeek: action.days_of_week,
    endDate: '',
    category: inferCategory(action.title),
    timeSlot: slotForTime(action.scheduled_time),
    sessionMinutes: action.duration_minutes,
    coachReason: note,
  };
}
