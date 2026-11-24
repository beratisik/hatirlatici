import AsyncStorage from '@react-native-async-storage/async-storage';

export type TokenStats = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastRequestAt: string | null;
  estimatedCostUsd: number;
  tokenCap: number; // 0 = limitsiz
};

export type ApiErrorRecord = {
  id: string;
  timestamp: string;
  message: string;
};

const USAGE_KEY = '@hatirlatici/token-usage';
const ERRORS_KEY = '@hatirlatici/api-errors';

// GPT-4o-mini resmi fiyatlandırması:
// Girdi (Input): 1M token başına $0.15
// Çıktı (Output): 1M token başına $0.60
export function calculateCostUsd(prompt: number, completion: number): number {
  const cost = (prompt * 0.15 + completion * 0.6) / 1000000;
  return Number(cost.toFixed(6));
}

const DEFAULT_STATS: TokenStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  requestCount: 0,
  lastRequestAt: null,
  estimatedCostUsd: 0,
  tokenCap: 0,
};

export async function loadTokenStats(): Promise<TokenStats> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    if (!raw) return DEFAULT_STATS;
    const parsed = JSON.parse(raw) as Partial<TokenStats>;
    const prompt = parsed.promptTokens ?? 0;
    const completion = parsed.completionTokens ?? 0;
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: parsed.totalTokens ?? prompt + completion,
      requestCount: parsed.requestCount ?? 0,
      lastRequestAt: parsed.lastRequestAt ?? null,
      estimatedCostUsd: calculateCostUsd(prompt, completion),
      tokenCap: parsed.tokenCap ?? 0,
    };
  } catch {
    return DEFAULT_STATS;
  }
}

export async function recordTokenUsage(prompt = 0, completion = 0): Promise<TokenStats> {
  const current = await loadTokenStats();
  const nextPrompt = current.promptTokens + prompt;
  const nextCompletion = current.completionTokens + completion;
  const nextTotal = nextPrompt + nextCompletion;
  const next: TokenStats = {
    promptTokens: nextPrompt,
    completionTokens: nextCompletion,
    totalTokens: nextTotal,
    requestCount: current.requestCount + 1,
    lastRequestAt: new Date().toISOString(),
    estimatedCostUsd: calculateCostUsd(nextPrompt, nextCompletion),
    tokenCap: current.tokenCap,
  };
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(next));
  return next;
}

export async function setTokenCap(cap: number): Promise<void> {
  const current = await loadTokenStats();
  const next: TokenStats = { ...current, tokenCap: Math.max(0, cap) };
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(next));
}

export async function resetTokenStats(): Promise<void> {
  const current = await loadTokenStats();
  const reset: TokenStats = {
    ...DEFAULT_STATS,
    tokenCap: current.tokenCap,
  };
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(reset));
}

export async function recordApiError(message: string): Promise<void> {
  try {
    const existing = await loadApiErrors();
    const entry: ApiErrorRecord = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message: message.trim(),
    };
    const updated = [entry, ...existing].slice(0, 20); // Son 20 hatayı sakla
    await AsyncStorage.setItem(ERRORS_KEY, JSON.stringify(updated));
  } catch {
    // Sessiz hata
  }
}

export async function loadApiErrors(): Promise<ApiErrorRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(ERRORS_KEY);
    return raw ? (JSON.parse(raw) as ApiErrorRecord[]) : [];
  } catch {
    return [];
  }
}

export async function clearApiErrors(): Promise<void> {
  await AsyncStorage.removeItem(ERRORS_KEY);
}
