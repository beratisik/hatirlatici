import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useGoals } from '@/context/GoalContext';
import {
  goalFromCoachAction,
  requestCoachTurn,
  taskSnapshot,
  type OpenAIChatMessage,
} from '@/lib/openai-coach';

const THREADS_KEY = '@hatirlatici/coach-threads';
const LEGACY_CHAT_KEY = '@hatirlatici/coach-chat';
const OPENING = 'Vakit nakittir. Bugün hangi hedefini ertelemeyi planlıyorsun?';
const DEFAULT_TITLE = 'Yeni sohbet';

const QUICK_REPLIES = [
  'Kitap Okuma',
  'Yürüyüş',
  'Vücut Geliştirme',
  'Ders Çalışma',
  'Dil Öğrenme',
] as const;

type BubbleKind = 'user' | 'coach' | 'system';

type ChatBubble = {
  id: string;
  kind: BubbleKind;
  text: string;
};

type CoachThread = {
  id: string;
  title: string;
  bubbles: ChatBubble[];
  history: OpenAIChatMessage[];
  updatedAt: number;
};

type ThreadStore = {
  activeId: string;
  threads: CoachThread[];
};

function newId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function freshThread(): CoachThread {
  return {
    id: newId(),
    title: DEFAULT_TITLE,
    bubbles: [{ id: newId(), kind: 'coach', text: OPENING }],
    history: [],
    updatedAt: Date.now(),
  };
}

function isStarted(items: ChatBubble[]) {
  return items.some((item) => item.kind === 'user');
}

function threadTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const known = QUICK_REPLIES.find(
    (item) => item.toLocaleLowerCase('tr-TR') === normalized.toLocaleLowerCase('tr-TR'),
  );
  const topic = known ?? normalized;
  const clipped = topic.length > 36 ? `${topic.slice(0, 36).trim()}…` : topic;
  return `Koç ile ${clipped}`;
}

function previewOf(items: ChatBubble[]): string {
  const last = [...items].reverse().find((item) => item.text !== OPENING);
  if (!last) return 'Henüz yazışma yok';
  return last.text.length > 72 ? `${last.text.slice(0, 72).trim()}…` : last.text;
}

function asBubbles(value: unknown): ChatBubble[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ChatBubble =>
      !!item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.text === 'string' &&
      (item.kind === 'user' || item.kind === 'coach' || item.kind === 'system'),
  );
}

function asHistory(value: unknown): OpenAIChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is OpenAIChatMessage =>
      !!item &&
      typeof item === 'object' &&
      (item.role === 'user' ||
        item.role === 'assistant' ||
        item.role === 'system' ||
        item.role === 'tool'),
  );
}

function asThread(value: unknown): CoachThread | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CoachThread>;
  const bubbles = asBubbles(raw.bubbles);
  if (!raw.id || typeof raw.id !== 'string' || bubbles.length === 0) return null;
  const firstUser = bubbles.find((item) => item.kind === 'user');
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : firstUser
        ? threadTitle(firstUser.text)
        : DEFAULT_TITLE;
  return {
    id: raw.id,
    title,
    bubbles,
    history: asHistory(raw.history),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

async function loadThreads(): Promise<ThreadStore> {
  try {
    const raw = await AsyncStorage.getItem(THREADS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThreadStore>;
      const threads = Array.isArray(parsed.threads)
        ? parsed.threads.map(asThread).filter((item): item is CoachThread => !!item)
        : [];
      if (threads.length > 0) {
        const activeId = threads.some((item) => item.id === parsed.activeId)
          ? (parsed.activeId as string)
          : threads[0].id;
        return { activeId, threads };
      }
    }
  } catch {
    // Bozuk liste varsa eski tek sohbete düş.
  }

  try {
    const legacy = await AsyncStorage.getItem(LEGACY_CHAT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { bubbles?: unknown; history?: unknown };
      const bubbles = asBubbles(parsed.bubbles);
      if (bubbles.length > 0 && isStarted(bubbles)) {
        const firstUser = bubbles.find((item) => item.kind === 'user');
        const thread: CoachThread = {
          id: newId(),
          title: firstUser ? threadTitle(firstUser.text) : DEFAULT_TITLE,
          bubbles,
          history: asHistory(parsed.history),
          updatedAt: Date.now(),
        };
        return { activeId: thread.id, threads: [thread] };
      }
    }
  } catch {
    // Eski kayıt okunamazsa yeni sohbet aç.
  }

  const created = freshThread();
  return { activeId: created.id, threads: [created] };
}

export default function CoachPlanScreen() {
  const router = useRouter();
  const { addGoal, updateGoal, deleteGoal, goals } = useGoals();
  const listRef = useRef<FlatList<ChatBubble>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<OpenAIChatMessage[]>([]);
  const sessionRef = useRef(0);
  const activeIdRef = useRef('');

  const [ready, setReady] = useState(false);
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [activeId, setActiveId] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rename, setRename] = useState('');
  const [bubbles, setBubbles] = useState<ChatBubble[]>([
    { id: 'opening', kind: 'coach', text: OPENING },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  activeIdRef.current = activeId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await loadThreads();
      if (cancelled) return;
      const active = store.threads.find((item) => item.id === store.activeId) ?? store.threads[0];
      historyRef.current = active.history;
      setThreads(store.threads);
      setActiveId(active.id);
      setBubbles(active.bubbles);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready || !activeId) return;
    const next = threads.map((thread) =>
      thread.id === activeId
        ? { ...thread, bubbles, history: historyRef.current, updatedAt: Date.now() }
        : thread,
    );
    void AsyncStorage.setItem(
      THREADS_KEY,
      JSON.stringify({ activeId, threads: next } satisfies ThreadStore),
    );
  }, [bubbles, threads, activeId, ready]);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  const showQuickReplies =
    ready &&
    !sending &&
    bubbles.length === 1 &&
    bubbles[0]?.kind === 'coach' &&
    bubbles[0]?.text === OPENING;

  const activeThread = threads.find((item) => item.id === activeId);
  const activeTitle = activeThread?.title ?? DEFAULT_TITLE;

  function shownBubbles(thread: CoachThread) {
    return thread.id === activeId ? bubbles : thread.bubbles;
  }

  function snapshot(list: CoachThread[]): CoachThread[] {
    return list.map((thread) =>
      thread.id === activeIdRef.current
        ? { ...thread, bubbles, history: historyRef.current, updatedAt: Date.now() }
        : thread,
    );
  }

  function stopInFlight() {
    sessionRef.current += 1;
    abortRef.current?.abort();
    setSending(false);
    setDraft('');
  }

  function openSheet() {
    setRename(activeTitle === DEFAULT_TITLE ? '' : activeTitle);
    setSheetOpen(true);
  }

  function openThread(id: string) {
    if (id === activeIdRef.current) {
      setSheetOpen(false);
      return;
    }
    const saved = snapshot(threads);
    const target = saved.find((item) => item.id === id);
    if (!target) return;
    stopInFlight();
    historyRef.current = target.history;
    setThreads(saved);
    setActiveId(id);
    setBubbles(target.bubbles);
    setSheetOpen(false);
  }

  function startThread() {
    const saved = snapshot(threads);
    const current = saved.find((item) => item.id === activeIdRef.current);
    if (current && !isStarted(current.bubbles)) {
      setSheetOpen(false);
      return;
    }
    const created = freshThread();
    stopInFlight();
    historyRef.current = [];
    setThreads([created, ...saved]);
    setActiveId(created.id);
    setBubbles(created.bubbles);
    setSheetOpen(false);
  }

  function removeThread(id: string) {
    const saved = snapshot(threads).filter((item) => item.id !== id);
    const next = saved.length > 0 ? saved : [freshThread()];
    const nextActive = next.some((item) => item.id === activeIdRef.current)
      ? activeIdRef.current
      : next[0].id;
    const target = next.find((item) => item.id === nextActive) ?? next[0];
    if (nextActive !== activeIdRef.current) {
      stopInFlight();
      historyRef.current = target.history;
      setBubbles(target.bubbles);
    }
    setThreads(next);
    setActiveId(target.id);
  }

  function commitRename() {
    const trimmed = rename.trim();
    if (!trimmed) return;
    setThreads((prev) =>
      prev.map((item) => (item.id === activeIdRef.current ? { ...item, title: trimmed } : item)),
    );
  }

  async function handleSend(preset?: string) {
    const text = (typeof preset === 'string' ? preset : draft).trim();
    if (!text || sending) return;

    const userBubble: ChatBubble = { id: newId(), kind: 'user', text };
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== activeIdRef.current || thread.title !== DEFAULT_TITLE) return thread;
        if (thread.bubbles.some((item) => item.kind === 'user')) return thread;
        return { ...thread, title: threadTitle(text) };
      }),
    );
    setBubbles((prev) => [...prev, userBubble]);
    setDraft('');
    setSending(true);
    scrollToEnd();

    const session = sessionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const tasks = goals.filter((goal) => !goal.archived).map(taskSnapshot);
      const turn = await requestCoachTurn(historyRef.current, text, tasks, controller.signal);
      if (controller.signal.aborted || session !== sessionRef.current) return;
      historyRef.current = turn.nextHistory;

      const extra: ChatBubble[] = [];
      for (const action of turn.actions) {
        if (action.type === 'create') {
          addGoal(goalFromCoachAction(action));
          extra.push({
            id: newId(),
            kind: 'system',
            text: `🚨 Koç sana yeni bir görev atadı: ${action.title}`,
          });
        } else if (action.type === 'update' && action.target_task_id) {
          updateGoal(action.target_task_id, {
            title: action.title,
            time: action.scheduled_time,
            sessionMinutes: action.duration_minutes,
            daysOfWeek: action.days_of_week,
            category: goalFromCoachAction(action).category,
          });
          extra.push({
            id: newId(),
            kind: 'system',
            text: `Koç görevi güncelledi: ${action.title}`,
          });
        } else if (action.type === 'delete' && action.target_task_id) {
          const existing = goals.find((goal) => goal.id === action.target_task_id);
          deleteGoal(action.target_task_id);
          extra.push({
            id: newId(),
            kind: 'system',
            text: `Koç görevi sildi: ${action.title || existing?.title || 'Görev'}`,
          });
        }
      }
      extra.push({ id: newId(), kind: 'coach', text: turn.assistantText });
      setBubbles((prev) => [...prev, ...extra]);
      scrollToEnd();
    } catch (caught) {
      if (controller.signal.aborted || session !== sessionRef.current) return;
      const message =
        caught instanceof Error ? caught.message : 'Koç şu an cevap veremedi.';
      setBubbles((prev) => [...prev, { id: newId(), kind: 'coach', text: message }]);
      scrollToEnd();
    } finally {
      if (!controller.signal.aborted && session === sessionRef.current) setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Geri</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sohbetler"
            onPress={openSheet}>
            <Text style={styles.resetGlyph}>☰</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={openSheet}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>KOÇ</Text>
            <Text style={styles.chatName} numberOfLines={1}>
              {activeTitle}
            </Text>
            <Text style={styles.subtitle}>Bahanen burada ölür.</Text>
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <FlatList
          ref={listRef}
          style={styles.listFlex}
          data={bubbles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => <Bubble item={item} />}
          ListFooterComponent={
            sending ? (
              <View style={[styles.row, styles.rowCoach]}>
                <View style={[styles.bubble, styles.coachBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color="#C8C8C8" />
                  <Text style={styles.typingText}>Koç yazıyor...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {showQuickReplies && (
          <ScrollView
            horizontal
            style={styles.quickScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
            keyboardShouldPersistTaps="handled">
            {QUICK_REPLIES.map((label) => (
              <TouchableOpacity
                key={label}
                style={styles.quickChip}
                activeOpacity={0.85}
                onPress={() => void handleSend(label)}>
                <Text style={styles.quickLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Bahaneni yaz..."
            placeholderTextColor="#6B6B6B"
            style={styles.input}
            multiline
            editable={!sending}
            onSubmitEditing={() => void handleSend()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
            activeOpacity={0.85}
            disabled={!draft.trim() || sending}
            onPress={() => void handleSend()}>
            <Text style={styles.sendLabel}>Gönder</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSheetOpen(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>SOHBETLER</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setSheetOpen(false)}>
                <Text style={styles.sheetClose}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.renameLabel}>Bu sohbetin adı</Text>
            <TextInput
              value={rename}
              onChangeText={setRename}
              onBlur={commitRename}
              onSubmitEditing={commitRename}
              placeholder="Koç ile İngilizce"
              placeholderTextColor="#6B6B6B"
              style={styles.renameInput}
            />
            <TouchableOpacity style={styles.newThread} activeOpacity={0.85} onPress={startThread}>
              <Text style={styles.newThreadLabel}>+ Yeni sohbet</Text>
            </TouchableOpacity>
            <ScrollView style={styles.threadList} contentContainerStyle={styles.threadListContent}>
              {[...threads]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((thread) => {
                  const selected = thread.id === activeId;
                  const items = shownBubbles(thread);
                  return (
                    <View
                      key={thread.id}
                      style={[styles.threadRow, selected && styles.threadRowActive]}>
                      <TouchableOpacity
                        style={styles.threadMain}
                        activeOpacity={0.8}
                        onPress={() => openThread(thread.id)}>
                        <Text style={styles.threadTitle} numberOfLines={1}>
                          {thread.id === activeId ? activeTitle : thread.title}
                        </Text>
                        <Text style={styles.threadPreview} numberOfLines={2}>
                          {previewOf(items)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.threadDelete}
                        activeOpacity={0.7}
                        accessibilityLabel="Sohbeti sil"
                        onPress={() => removeThread(thread.id)}>
                        <Text style={styles.threadDeleteLabel}>Sil</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Bubble({ item }: { item: ChatBubble }) {
  if (item.kind === 'system') {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{item.text}</Text>
      </View>
    );
  }

  const mine = item.kind === 'user';
  return (
    <View style={[styles.row, mine ? styles.rowUser : styles.rowCoach]}>
      <View style={[styles.bubble, mine ? styles.userBubble : styles.coachBubble]}>
        <Text style={[styles.bubbleText, mine && styles.userText]}>{item.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    gap: 2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  resetButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetGlyph: {
    color: '#E4E4E4',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  backText: {
    color: '#B5B5B5',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCopy: {
    gap: 2,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  chatName: {
    color: '#E7B3B3',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: '#101010',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sheetClose: {
    color: '#B5B5B5',
    fontSize: 14,
    fontWeight: '700',
  },
  renameLabel: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
  },
  renameInput: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    color: '#F5F5F5',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  newThread: {
    backgroundColor: '#C1121F',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  newThreadLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  threadList: {
    flexGrow: 0,
    maxHeight: 320,
  },
  threadListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  threadRowActive: {
    borderColor: '#C1121F',
  },
  threadMain: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  threadTitle: {
    color: '#F2F2F2',
    fontSize: 15,
    fontWeight: '800',
  },
  threadPreview: {
    color: '#8A8A8A',
    fontSize: 12,
    lineHeight: 16,
  },
  threadDelete: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threadDeleteLabel: {
    color: '#C1121F',
    fontSize: 13,
    fontWeight: '800',
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 8,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowCoach: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#1F6F4A',
    borderBottomRightRadius: 4,
  },
  coachBubble: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: '#E8E8E8',
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#FFFFFF',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    color: '#9A9A9A',
    fontSize: 13,
    fontWeight: '600',
  },
  systemWrap: {
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: 'rgba(193, 18, 31, 0.16)',
    borderWidth: 1,
    borderColor: '#7A1414',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
  },
  systemText: {
    color: '#F5C4C4',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  quickScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  quickRow: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  quickChip: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2F5D7C',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickLabel: {
    color: '#9FC4E0',
    fontSize: 13,
    fontWeight: '700',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    backgroundColor: '#050505',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    color: '#F5F5F5',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
  },
  send: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#1F6F4A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
