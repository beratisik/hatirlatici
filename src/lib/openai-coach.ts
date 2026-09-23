import {
  addMinutesToClock,
  padDatePart,
  startOfToday,
  type PlanCategory,
  type RepeatConfig,
  type TimeSlot,
} from '@/context/GoalContext';

const MODEL = 'gpt-4o-mini';
const DAILY: RepeatConfig = { unit: 'gun', interval: 1 };

export type CoachPlanKind = 'default' | 'walk';

export type CoachIntake = {
  kind: CoachPlanKind;
  selectedCategory: string;
  resourceName: string | null;
  scheduleLabel: string;
  hoursKind: 'commute' | 'home';
  place: string | null;
  fitness: string | null;
  startTime: string;
  endTime: string;
  focusWindow: string;
  blocker: string;
};

export type CoachAiTask = {
  title: string;
  scheduled_time: string;
  duration_minutes: number;
  coach_note: string;
  day_type: 'everyday';
};

export type CoachAiPlan = {
  kind: CoachPlanKind;
  coach_summary: string;
  assigned_resource: string;
  assigned_style: string;
  tasks: CoachAiTask[];
};

export type AiCoachGoalDraft = {
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
};

function readApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  return env.EXPO_PUBLIC_OPENAI_API_KEY?.trim() ?? '';
}

function systemPrompt(intake: CoachIntake): string {
  if (intake.kind === 'walk') {
    return [
      'Sen acımasız bir kondisyon ve yaşam koçusun. Kullanıcı bütün gün masa başında oturuyor veya çok yoruluyor olsa bile bahaneleri asla kabul etmiyorsun. Onun mesai saatlerine saygı duy ama belirttiği boşlukta kesinlikle kalp atış hızını (BPM) yükseltecek bir yürüyüş/kardiyo görevi ver. Akıllı saatteki halkaları doldurması gerektiğini hatırlat. Seçtiği mekana (dışarı veya cihaz) ve spor geçmişine uygun, reddedilemeyecek, net bir görev oluştur.',
      'Yalnızca JSON döndür. Şema:',
      '{',
      '  "coach_summary": "Kullanıcının hamlığına veya üşengeçlik bahanesine koç ağzından çok sert, kan akışını hızlandıracak motive edici 2 cümlelik değerlendirme.",',
      '  "assigned_style": "Yürüyüşün tarzı",',
      '  "tasks": [',
      '    {',
      '      "title": "Görev başlığı",',
      '      "scheduled_time": "HH:MM",',
      '      "duration_minutes": 25,',
      '      "coach_note": "Bu yürüyüşe özel acımasız not",',
      '      "day_type": "everyday"',
      '    }',
      '  ]',
      '}',
      'Kurallar: tasks içinde 1 yürüyüş görevi olsun. scheduled_time mesaiyle çakışmasın, odak penceresine otursun. duration_minutes 15 ile 40 arasında tam sayı olsun. day_type "everyday" olsun. coach_note bildirimde okunacak kadar kısa, tek cümle olsun.',
    ].join('\n');
  }

  return [
    `Sen tavizsiz, sert ama kullanıcının mesai saatlerine ve fiziksel yorgunluğuna saygı duyan bir yaşam koçusun. Kullanıcının seçtiği kategoriye (${intake.selectedCategory}) özel, onun mesai saatleriyle çakışmayan, belirttiği odak penceresine uygun çok spesifik ve reddedilemeyecek görevler oluştur. Kullanıcı kaynak belirtmediyse, ona dünyaca kabul görmüş, kategorisine uygun popüler bir kaynak/kitap/egzersiz ata.`,
    'Yalnızca JSON döndür. Şema:',
    '{',
    '  "coach_summary": "Kullanıcının mesaisine, engeline ve hedefine göre koç ağzından sert, motive edici 2 cümlelik fırça/değerlendirme.",',
    '  "assigned_resource": "Eğer kullanıcı kaynak belirtmediyse senin atadığın kaynak. Belirttiyse kullanıcının kaynağı.",',
    '  "tasks": [',
    '    {',
    '      "title": "Görev başlığı",',
    '      "scheduled_time": "HH:MM",',
    '      "duration_minutes": 20,',
    '      "coach_note": "Bu göreve özel acımasız not",',
    '      "day_type": "everyday"',
    '    }',
    '  ]',
    '}',
    'Kurallar: tasks içinde 3 görev olsun. scheduled_time kullanıcının boş saatine denk gelsin. duration_minutes 10 ile 45 arasında tam sayı olsun. day_type her görevde "everyday" olsun. coach_note bildirimde okunacak kadar kısa, tek cümle olsun.',
  ].join('\n');
}

function userPayload(intake: CoachIntake): Record<string, unknown> {
  const hours = {
    kind: intake.hoursKind,
    start: intake.startTime,
    end: intake.endTime,
  };
  if (intake.kind === 'walk') {
    return {
      selectedCategory: intake.selectedCategory,
      place: intake.place,
      fitness: intake.fitness,
      hours,
      focusWindow: intake.focusWindow,
      blocker: intake.blocker,
    };
  }
  return {
    selectedCategory: intake.selectedCategory,
    resource: intake.resourceName,
    schedule: intake.scheduleLabel,
    hours,
    focusWindow: intake.focusWindow,
    blocker: intake.blocker,
  };
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

function parseTasks(raw: unknown, bounds: { min: number; max: number }): CoachAiTask[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Koçun planı eksik geldi.');
  }
  return raw.slice(0, 5).map((item) => {
    if (!isRecord(item)) throw new Error('Koçun görev listesi bozuk.');
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const scheduled = parseClock(item.scheduled_time);
    const note = typeof item.coach_note === 'string' ? item.coach_note.trim() : '';
    const minutes = Number(item.duration_minutes);
    if (!title || !scheduled || !note || !Number.isFinite(minutes)) {
      throw new Error('Koçun görevlerinden biri eksik.');
    }
    return {
      title,
      scheduled_time: scheduled,
      duration_minutes: Math.min(bounds.max, Math.max(bounds.min, Math.round(minutes))),
      coach_note: note,
      day_type: 'everyday',
    };
  });
}

export function parseCoachPlan(raw: unknown, kind: CoachPlanKind = 'default'): CoachAiPlan {
  if (!isRecord(raw)) {
    throw new Error('Koç geçerli bir plan döndürmedi.');
  }

  const coachSummary = typeof raw.coach_summary === 'string' ? raw.coach_summary.trim() : '';
  const tasks = parseTasks(raw.tasks, kind === 'walk' ? { min: 15, max: 40 } : { min: 10, max: 45 });
  if (!coachSummary) throw new Error('Koçun planı eksik geldi.');

  if (kind === 'walk') {
    const assignedStyle = typeof raw.assigned_style === 'string' ? raw.assigned_style.trim() : '';
    if (!assignedStyle) throw new Error('Koçun planı eksik geldi.');
    return {
      kind,
      coach_summary: coachSummary,
      assigned_resource: '',
      assigned_style: assignedStyle,
      tasks,
    };
  }

  const assignedResource =
    typeof raw.assigned_resource === 'string' ? raw.assigned_resource.trim() : '';
  if (!assignedResource) throw new Error('Koçun planı eksik geldi.');

  return {
    kind,
    coach_summary: coachSummary,
    assigned_resource: assignedResource,
    assigned_style: '',
    tasks,
  };
}

export async function requestCoachPlan(
  intake: CoachIntake,
  signal?: AbortSignal,
): Promise<CoachAiPlan> {
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
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(intake) },
          {
            role: 'user',
            content: JSON.stringify(userPayload(intake)),
          },
        ],
      }),
    });
  } catch (caught) {
    if (signal?.aborted) throw caught;
    throw new Error('OpenAI’ye ulaşılamadı. Anahtarı ve bağlantıyı kontrol et.');
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Koç şu an cevap veremedi.');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Koç boş cevap verdi.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Koçun cevabı okunamadı.');
  }
  return parseCoachPlan(parsed, intake.kind);
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

export function goalsFromCoachPlan(category: PlanCategory, plan: CoachAiPlan): AiCoachGoalDraft[] {
  return plan.tasks.map((task) => ({
    type: 'coach',
    title: task.title,
    description: task.coach_note,
    date: todayDisplayDate(),
    time: task.scheduled_time,
    endTime: addMinutesToClock(task.scheduled_time, task.duration_minutes),
    repeat: DAILY,
    endDate: '',
    category,
    timeSlot: slotForTime(task.scheduled_time),
    sessionMinutes: task.duration_minutes,
    coachReason: plan.coach_summary,
  }));
}
