import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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

const CHAT_STORAGE_KEY = '@hatirlatici/coach-chat';
const OPENING = 'Vakit nakittir. Bugün hangi hedefini ertelemeyi planlıyorsun?';

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

type PersistedChat = {
  bubbles: ChatBubble[];
  history: OpenAIChatMessage[];
};

function newId() {
  return `${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export default function CoachPlanScreen() {
  const router = useRouter();
  const { addGoal, updateGoal, deleteGoal, goals } = useGoals();
  const listRef = useRef<FlatList<ChatBubble>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<OpenAIChatMessage[]>([]);
  const sessionRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([
    { id: 'opening', kind: 'coach', text: OPENING },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as PersistedChat;
        if (Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0) {
          const started = parsed.bubbles.some((item) => item.kind === 'user');
          if (started) {
            setBubbles(parsed.bubbles);
            if (Array.isArray(parsed.history)) historyRef.current = parsed.history;
          } else {
            historyRef.current = [];
            setBubbles([{ id: 'opening', kind: 'coach', text: OPENING }]);
          }
        }
      } catch {
        // Bozuk sohbet kaydı varsa açılış mesajıyla devam.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({ bubbles, history: historyRef.current } satisfies PersistedChat),
    );
  }, [bubbles, ready]);

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

  function handleReset() {
    sessionRef.current += 1;
    abortRef.current?.abort();
    historyRef.current = [];
    setDraft('');
    setSending(false);
    setBubbles([{ id: newId(), kind: 'coach', text: OPENING }]);
  }

  async function handleSend(preset?: string) {
    const text = (typeof preset === 'string' ? preset : draft).trim();
    if (!text || sending) return;

    const userBubble: ChatBubble = { id: newId(), kind: 'user', text };
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
            accessibilityLabel="Yeni plan"
            onPress={handleReset}>
            <Text style={styles.resetGlyph}>↻</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>KOÇ</Text>
          <Text style={styles.subtitle}>Bahanen burada ölür.</Text>
        </View>
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
  subtitle: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600',
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
