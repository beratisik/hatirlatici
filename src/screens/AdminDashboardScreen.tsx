import { useEffect, useState } from 'react';
import {
  Alert,
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

import { useGoals, type PlanCategory, type Weekday } from '@/context/GoalContext';
import { DEFAULT_COACH_VOICE, loadCoachVoice, saveCoachVoice } from '@/lib/coach-prompt';

const DUMMY_TASKS: {
  title: string;
  time: string;
  daysOfWeek: Weekday[];
  sessionMinutes: number;
  category: PlanCategory;
}[] = [
  {
    title: 'Sabah koşusu',
    time: '07:15',
    daysOfWeek: ['Monday', 'Wednesday', 'Friday'],
    sessionMinutes: 30,
    category: 'yuruyus',
  },
  {
    title: 'Kitap: 20 sayfa',
    time: '21:00',
    daysOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    sessionMinutes: 25,
    category: 'kitap',
  },
  {
    title: 'İngilizce kelime',
    time: '12:30',
    daysOfWeek: ['Tuesday', 'Thursday'],
    sessionMinutes: 20,
    category: 'dil',
  },
  {
    title: 'Üst vücut antrenmanı',
    time: '18:45',
    daysOfWeek: ['Monday', 'Thursday'],
    sessionMinutes: 45,
    category: 'vucut',
  },
  {
    title: 'Ders tekrarı',
    time: '16:00',
    daysOfWeek: ['Wednesday', 'Saturday'],
    sessionMinutes: 40,
    category: 'akademik',
  },
];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { addGoal, wipeAllData } = useGoals();
  const [voice, setVoice] = useState(DEFAULT_COACH_VOICE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadCoachVoice().then(setVoice);
  }, []);

  async function handleSaveVoice() {
    setSaving(true);
    try {
      await saveCoachVoice(voice);
    } finally {
      setSaving(false);
    }
  }

  function handleDummyTasks() {
    for (const task of DUMMY_TASKS) {
      addGoal({
        type: 'coach',
        title: task.title,
        description: 'Admin test görevi.',
        date: '',
        time: task.time,
        repeat: { unit: 'gun', interval: 1 },
        daysOfWeek: task.daysOfWeek,
        endDate: '',
        category: task.category,
        sessionMinutes: task.sessionMinutes,
        coachReason: 'Geliştirici menüsünden üretildi.',
      });
    }
  }

  function handleWipe() {
    Alert.alert(
      'Sistem verilerini sıfırla',
      'Tüm görevler, sohbetler, su kaydı ve oturum silinir. Geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hepsini sil',
          style: 'destructive',
          onPress: () => {
            void wipeAllData().then(() => router.replace('/'));
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>GELİŞTİRİCİ</Text>
        <Text style={styles.title}>ADMIN</Text>
        <Text style={styles.hint}>Bu ekran menülerde yok. Sadece gizli tetikleyiciyle açılır.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Yapay zeka tonu</Text>
          <Text style={styles.cardHint}>
            Sert koç system prompt’u. Kaydettikten sonra yeni sohbet turlarında kullanılır.
          </Text>
          <TextInput
            value={voice}
            onChangeText={setVoice}
            multiline
            textAlignVertical="top"
            style={styles.prompt}
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.secondary}
              activeOpacity={0.85}
              onPress={() => setVoice(DEFAULT_COACH_VOICE)}>
              <Text style={styles.secondaryLabel}>Varsayılana dön</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primary}
              activeOpacity={0.85}
              disabled={saving}
              onPress={() => void handleSaveVoice()}>
              <Text style={styles.primaryLabel}>{saving ? 'Kaydediliyor…' : 'Tonu kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.primary} activeOpacity={0.85} onPress={handleDummyTasks}>
          <Text style={styles.primaryLabel}>Test görevleri üret</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.danger} activeOpacity={0.85} onPress={handleWipe}>
          <Text style={styles.dangerLabel}>Sistem verilerini sıfırla</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
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
    letterSpacing: 1.6,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  hint: {
    color: '#7A7A7A',
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '800',
  },
  cardHint: {
    color: '#8A8A8A',
    fontSize: 12,
    lineHeight: 17,
  },
  prompt: {
    minHeight: 180,
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    color: '#E8E8E8',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    flex: 1,
    backgroundColor: '#1F6F4A',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondary: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  secondaryLabel: {
    color: '#C8C8C8',
    fontSize: 14,
    fontWeight: '700',
  },
  danger: {
    backgroundColor: '#C1121F',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 16,
  },
  dangerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
