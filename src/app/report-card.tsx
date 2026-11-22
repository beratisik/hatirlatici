import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  formatRepeatSummary,
  goalBooksRead,
  goalHoursSpent,
  useGoals,
} from '@/context/GoalContext';
import { categoryLabel } from '@/lib/coach';
import { shareReportCard } from '@/lib/share-report';

export default function ReportCardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { goals, user } = useGoals();
  const [sharing, setSharing] = useState(false);

  const goal = useMemo(() => goals.find((item) => item.id === id), [goals, id]);
  const hours = goal ? goalHoursSpent(goal) : 0;
  const books = goal ? goalBooksRead(goal) : 0;
  const pages = goal?.pagesRead ?? 0;
  const points = goal?.pointsEarned ?? 0;
  const isBook = goal?.category === 'kitap';

  const shareText = goal
    ? [
        'MEZUNİYET KARNESİ',
        user ? [user.name, user.surname].filter(Boolean).join(' ').toUpperCase() : 'Disiplin',
        goal.title,
        isBook ? `${books} kitap · ${pages} sayfa` : `${goal.completionCount} seans`,
        `${hours} saat · ${points} puan · ${goal.streak} günlük seri`,
        'hatirlatici',
      ].join('\n')
    : '';

  async function handleShare() {
    if (!shareText) return;
    setSharing(true);
    try {
      await shareReportCard(shareText);
    } catch {
      Alert.alert('Paylaşılamadı', shareText);
    } finally {
      setSharing(false);
    }
  }

  if (!goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>KARNE BULUNAMADI</Text>
          <TouchableOpacity onPress={() => router.replace('/home')}>
            <Text style={styles.backLink}>Ana sayfaya dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>‹ Kapat</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>MEZUNİYET KARNESİ</Text>
        <Text style={styles.name}>{user?.name ?? 'Disiplin'}</Text>
        <Text style={styles.program}>{categoryLabel(goal.category)}</Text>
        <Text style={styles.goalTitle}>{goal.title}</Text>
      </View>

      <View style={styles.card}>
        {isBook ? (
          <>
            <Stat label="OKUNAN KİTAP" value={String(books)} />
            <Stat label="SAYFA" value={String(pages)} />
          </>
        ) : (
          <Stat label="TAMAMLANAN SEANS" value={String(goal.completionCount)} />
        )}
        <Stat label="HARCANAN SAAT" value={hours.toFixed(1)} />
        <Stat label="KAZANILAN PUAN" value={String(points)} accent />
        <Stat label="SON SERİ" value={`${goal.streak} gün`} last />
      </View>

      <Text style={styles.repeat}>{formatRepeatSummary(goal.repeat)}</Text>
      {!!goal.coachReason && <Text style={styles.reason}>“{goal.coachReason}”</Text>}

      <TouchableOpacity
        style={styles.shareButton}
        activeOpacity={0.85}
        disabled={sharing}
        onPress={handleShare}>
        <Text style={styles.shareLabel}>{sharing ? 'PAYLAŞILIYOR…' : 'PAYLAŞ'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.stat, last && styles.statLast]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 12,
    gap: 6,
  },
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: '#B5B5B5',
    fontSize: 16,
    fontWeight: '600',
  },
  kicker: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 16,
  },
  name: {
    color: '#F5F5F5',
    fontSize: 32,
    fontWeight: '900',
  },
  program: {
    color: '#8A8A8A',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  goalTitle: {
    color: '#C8C8C8',
    fontSize: 16,
    marginTop: 4,
  },
  card: {
    marginTop: 28,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 18,
    padding: 8,
  },
  stat: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statValue: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '900',
  },
  statValueAccent: {
    color: '#3DDC84',
  },
  statLast: {
    borderBottomWidth: 0,
  },
  repeat: {
    color: '#6B6B6B',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  reason: {
    color: '#C8C8C8',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  shareButton: {
    marginTop: 'auto',
    marginBottom: 24,
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  shareLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  backLink: {
    color: '#C1121F',
    fontSize: 14,
    fontWeight: '700',
  },
});
