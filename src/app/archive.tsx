import { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import {
  describeArchiveReason,
  formatRepeatSummary,
  useGoals,
  type Goal,
} from '@/context/GoalContext';
import { confirmDeleteGoal, GoalMenuButton, GoalMenuSheet } from '@/components/goal-menu';

export default function ArchiveScreen() {
  const router = useRouter();
  const { goals, restoreGoal, deleteGoal } = useGoals();
  const [menuGoal, setMenuGoal] = useState<Goal | null>(null);
  const archivedGoals = goals.filter((goal) => goal.archived).slice().reverse();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ARŞİV</Text>
        <Text style={styles.count}>
          {archivedGoals.length > 0 ? `${archivedGoals.length} hedef` : 'Boş'}
        </Text>
      </View>

      <FlatList
        data={archivedGoals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={archivedGoals.length === 0 ? styles.emptyListContent : styles.listContent}
        renderItem={({ item }) => (
          <ArchivedGoalCard
            goal={item}
            onRestore={() => restoreGoal(item.id)}
            onOpenMenu={() => setMenuGoal(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>ARŞİV BOŞ</Text>
            <Text style={styles.emptySubtitle}>
              Kaydırıp arşivlediğin veya pasife çektiğin görevler burada listelenir.
            </Text>
          </View>
        }
      />

      <GoalMenuSheet
        visible={!!menuGoal}
        onClose={() => setMenuGoal(null)}
        onEdit={
          menuGoal
            ? () => router.push({ pathname: '/new-goal', params: { id: menuGoal.id } })
            : undefined
        }
        onDelete={() => {
          if (!menuGoal) return;
          confirmDeleteGoal(menuGoal.title, () => deleteGoal(menuGoal.id));
        }}
      />
    </SafeAreaView>
  );
}

function ArchivedGoalCard({
  goal,
  onRestore,
  onOpenMenu,
}: {
  goal: Goal;
  onRestore: () => void;
  onOpenMenu: () => void;
}) {
  const hasSchedule = !!(goal.date || goal.time);
  const repeatLabel = formatRepeatSummary(goal.repeat);
  const reason = describeArchiveReason(goal.archiveReason);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{goal.title}</Text>
        <View style={styles.cardHeaderRight}>
          <Text style={[styles.reasonText, { color: reason.color }]}>{reason.label}</Text>
          <GoalMenuButton onPress={onOpenMenu} />
        </View>
      </View>

      {!!goal.description && <Text style={styles.cardDescription}>{goal.description}</Text>}

      <View style={styles.cardFooter}>
        {hasSchedule && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{[goal.date, goal.time].filter(Boolean).join(' • ')}</Text>
          </View>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{repeatLabel}</Text>
        </View>
        {!!goal.endDate && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Bitiş {goal.endDate}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.restoreButton} activeOpacity={0.85} onPress={onRestore}>
        <Text style={styles.restoreButtonLabel}>GERİ YÜKLE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
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
  title: {
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  count: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#8A8A8A',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardTitle: {
    flex: 1,
    color: '#C8C8C8',
    fontSize: 15,
    fontWeight: '700',
  },
  reasonText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardDescription: {
    color: '#6B6B6B',
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#C7C7C7',
    fontSize: 12,
    fontWeight: '600',
  },
  restoreButton: {
    marginTop: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  restoreButtonLabel: {
    color: '#F5C400',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
