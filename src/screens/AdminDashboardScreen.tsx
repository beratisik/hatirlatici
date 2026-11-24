import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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

import {
  useGoals,
  useUser,
  useWater,
  type PlanCategory,
  type Weekday,
} from '@/context/GoalContext';
import {
  COACH_PERSONAS,
  DEFAULT_COACH_VOICE,
  deleteCustomPersona,
  getAllPersonas,
  loadCoachVoice,
  saveCoachVoice,
  saveCustomPersona,
  type CoachPersona,
} from '@/lib/coach-prompt';
import {
  clearApiErrors,
  loadApiErrors,
  loadTokenStats,
  resetTokenStats,
  setTokenCap,
  type ApiErrorRecord,
  type TokenStats,
} from '@/lib/coach-analytics';
import { testCoachPrompt, type CoachAction } from '@/lib/openai-coach';
import { isRemoteEnabled, supabase } from '@/lib/supabase';

type Tab = 'stats' | 'users' | 'tokens' | 'coach' | 'presets' | 'system';

type PresetPack = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tasks: {
    title: string;
    time: string;
    daysOfWeek: Weekday[];
    sessionMinutes: number;
    category: PlanCategory;
  }[];
};

type AdminUserRecord = {
  id: string;
  name: string;
  surname: string;
  username: string;
  gender: string | null;
  score: number;
  goals_count: number;
  profile_key: string | null;
  updated_at: string;
};

type AdminUserDetail = {
  id: string;
  name: string;
  surname: string;
  username: string;
  gender: string | null;
  score: number;
  goals: Array<{
    id?: string;
    title: string;
    time?: string;
    daysOfWeek?: string[];
    category?: string;
    sessionMinutes?: number;
  }>;
  profile_key: string | null;
  water_settings?: {
    dailyTargetMl?: number;
    cupSizeMl?: number;
  } | null;
  updated_at: string;
};

const PRESET_PACKS: PresetPack[] = [
  {
    id: 'fitness',
    name: 'Spor & Kondisyon Paketi',
    emoji: '💪',
    description: 'Sabah koşusu, direnç egzersizi ve esneme rutini.',
    tasks: [
      {
        title: 'Sabah Koşusu (3 km)',
        time: '07:15',
        daysOfWeek: ['Monday', 'Wednesday', 'Friday'],
        sessionMinutes: 30,
        category: 'yuruyus',
      },
      {
        title: 'Kuvvet Antrenmanı (Push/Pull)',
        time: '18:30',
        daysOfWeek: ['Tuesday', 'Thursday', 'Saturday'],
        sessionMinutes: 45,
        category: 'vucut',
      },
    ],
  },
  {
    id: 'mind_study',
    name: 'Akademik & Zihin Paketi',
    emoji: '📚',
    description: 'Kitap okuma, Pomodoro odak çalışması ve yabancı dil.',
    tasks: [
      {
        title: 'Kitap: 25 Sayfa',
        time: '21:30',
        daysOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        sessionMinutes: 30,
        category: 'kitap',
      },
      {
        title: 'Pomodoro: Derin Çalışma',
        time: '15:00',
        daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        sessionMinutes: 50,
        category: 'akademik',
      },
      {
        title: 'Yabancı Dil Tekrarı',
        time: '12:45',
        daysOfWeek: ['Tuesday', 'Thursday'],
        sessionMinutes: 20,
        category: 'dil',
      },
    ],
  },
  {
    id: 'discipline',
    name: 'Demir İrade (Goggins Tarzı)',
    emoji: '🔥',
    description: 'Erken kalkış, soğuk duş mentalitesi ve aralıksız disiplin.',
    tasks: [
      {
        title: 'Şafak Disiplini: 5K Koşu',
        time: '06:00',
        daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        sessionMinutes: 40,
        category: 'yuruyus',
      },
      {
        title: 'Akşam Zihin Arınması & Günlük',
        time: '22:00',
        daysOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        sessionMinutes: 15,
        category: 'kitap',
      },
    ],
  },
];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { goals, addGoal, deleteGoal, wipeAllData } = useGoals();
  const { user, score, profile } = useUser();
  const { water } = useWater();

  const [activeTab, setActiveTab] = useState<Tab>('stats');

  // --- AI Koç & Kişilikler ---
  const [personas, setPersonas] = useState<CoachPersona[]>(COACH_PERSONAS);
  const [voice, setVoice] = useState(DEFAULT_COACH_VOICE);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('tough');
  const [savingVoice, setSavingVoice] = useState(false);

  // Yeni Kişilik Ekleme Modalı
  const [showAddPersonaModal, setShowAddPersonaModal] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState('');
  const [newPersonaEmoji, setNewPersonaEmoji] = useState('🤖');
  const [newPersonaDesc, setNewPersonaDesc] = useState('');
  const [newPersonaPrompt, setNewPersonaPrompt] = useState(DEFAULT_COACH_VOICE);

  // Canlı Test Konsolu
  const [testInput, setTestInput] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ message: string; actions: CoachAction[] } | null>(
    null,
  );

  // --- Token & Maliyet İstatistikleri ---
  const [tokenStats, setTokenStats] = useState<TokenStats>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    lastRequestAt: null,
    estimatedCostUsd: 0,
    tokenCap: 0,
  });
  const [capInput, setCapInput] = useState('');
  const [apiErrors, setApiErrors] = useState<ApiErrorRecord[]>([]);

  // --- Kullanıcılar Dizini & İnceleme Modalı ---
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  // --- Veritabanı Sağlık Durumu ---
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [checkingDb, setCheckingDb] = useState<boolean>(false);

  useEffect(() => {
    void refreshAll();
  }, []);

  async function refreshAll() {
    await Promise.all([
      loadPersonasAndVoice(),
      refreshTokenData(),
      checkDatabaseHealth(),
      fetchAdminUsers(),
    ]);
  }

  async function loadPersonasAndVoice() {
    try {
      const all = await getAllPersonas();
      setPersonas(all);
      const loadedVoice = await loadCoachVoice();
      setVoice(loadedVoice);
      const match = all.find((p) => p.prompt.trim() === loadedVoice.trim());
      if (match) setSelectedPersonaId(match.id);
    } catch {
      // Varsayılan
    }
  }

  async function refreshTokenData() {
    try {
      const stats = await loadTokenStats();
      setTokenStats(stats);
      setCapInput(stats.tokenCap > 0 ? String(stats.tokenCap) : '');
      const errors = await loadApiErrors();
      setApiErrors(errors);
    } catch {
      // Sessiz
    }
  }

  async function checkDatabaseHealth() {
    if (!isRemoteEnabled() || !supabase) {
      setDbConnected(false);
      setDbLatency(null);
      return;
    }
    setCheckingDb(true);
    const start = Date.now();
    try {
      const res = await supabase.rpc('is_username_taken', { candidate: 'admin_ping_check' });
      const elapsed = Date.now() - start;
      if (!res.error) {
        setDbConnected(true);
        setDbLatency(elapsed);
      } else {
        setDbConnected(false);
      }
    } catch {
      setDbConnected(false);
    } finally {
      setCheckingDb(false);
    }
  }

  async function fetchAdminUsers() {
    if (!isRemoteEnabled() || !supabase) {
      setUsersError('Bulut bağlantısı (Supabase) etkin değil.');
      return;
    }
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const { data, error } = await supabase.rpc('get_admin_users');
      if (error) {
        // Fonksiyon yoksa doğrudan profiles tablosunu dene
        const direct = await supabase
          .from('profiles')
          .select('id, name, surname, username, gender, updated_at');
        if (direct.data && direct.data.length > 0) {
          setAdminUsers(
            direct.data.map((p: any) => ({
              id: p.id,
              name: p.name,
              surname: p.surname || '',
              username: p.username,
              gender: p.gender || null,
              score: 0,
              goals_count: 0,
              profile_key: null,
              updated_at: p.updated_at,
            })),
          );
        } else {
          setUsersError(
            'Supabase üzerinde get_admin_users fonksiyonu tanımlı değil. schema.sql dosyasındaki fonksiyonu Supabase SQL Editöründe çalıştırın.',
          );
        }
      } else if (data) {
        setAdminUsers(data as AdminUserRecord[]);
      }
    } catch (err: any) {
      setUsersError(err.message || 'Kullanıcılar alınırken hata oluştu.');
    } finally {
      setLoadingUsers(false);
    }
  }

  async function inspectUser(targetUser: AdminUserRecord) {
    setSelectedUser(targetUser);
    setUserDetail(null);
    setLoadingDetail(true);
    setShowUserModal(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.rpc('get_admin_user_details', {
          target_user_id: targetUser.id,
        });
        if (!error && data) {
          setUserDetail(data as AdminUserDetail);
          return;
        }
      }
      // Yedek durum
      setUserDetail({
        id: targetUser.id,
        name: targetUser.name,
        surname: targetUser.surname,
        username: targetUser.username,
        gender: targetUser.gender,
        score: targetUser.score,
        goals: [],
        profile_key: targetUser.profile_key,
        updated_at: targetUser.updated_at,
      });
    } catch {
      setUserDetail({
        id: targetUser.id,
        name: targetUser.name,
        surname: targetUser.surname,
        username: targetUser.username,
        gender: targetUser.gender,
        score: targetUser.score,
        goals: [],
        profile_key: targetUser.profile_key,
        updated_at: targetUser.updated_at,
      });
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleSelectPersona(persona: CoachPersona) {
    setSelectedPersonaId(persona.id);
    setVoice(persona.prompt);
  }

  async function handleSaveVoice() {
    setSavingVoice(true);
    try {
      await saveCoachVoice(voice);
      Alert.alert('Başarılı', 'Yapay zeka sistem talimatı kaydedildi. Yeni koç sohbetlerinde geçerli olacak.');
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setSavingVoice(false);
    }
  }

  async function handleCreateCustomPersona() {
    if (!newPersonaName.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen kişiliğe bir ad verin.');
      return;
    }
    try {
      const updated = await saveCustomPersona({
        name: newPersonaName.trim(),
        emoji: newPersonaEmoji.trim() || '🤖',
        description: newPersonaDesc.trim() || 'Özel tanımlanmış koç üslubu.',
        prompt: newPersonaPrompt.trim() || DEFAULT_COACH_VOICE,
      });
      const all = [...COACH_PERSONAS, ...updated];
      setPersonas(all);
      const created = updated[0];
      if (created) {
        setSelectedPersonaId(created.id);
        setVoice(created.prompt);
      }
      setShowAddPersonaModal(false);
      setNewPersonaName('');
      setNewPersonaDesc('');
      Alert.alert('Kişilik Eklendi', `"${newPersonaName}" kişiliği başarıyla oluşturuldu.`);
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  }

  function handleDeleteCustomPersona(persona: CoachPersona) {
    Alert.alert(
      'Kişiliği Sil',
      `"${persona.name}" kişiliğini silmek istediğinizden emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const updated = await deleteCustomPersona(persona.id);
            const all = [...COACH_PERSONAS, ...updated];
            setPersonas(all);
            if (selectedPersonaId === persona.id) {
              const fallback = COACH_PERSONAS[0];
              setSelectedPersonaId(fallback.id);
              setVoice(fallback.prompt);
            }
          },
        },
      ],
    );
  }

  async function handleRunCoachTest() {
    if (!testInput.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen test etmek için bir kullanıcı mesajı yazın.');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      // Aktif olarak düzenlenmekte olan prompt ile doğrudan test ediyoruz!
      const result = await testCoachPrompt(voice, testInput.trim());
      setTestResult({ message: result.assistantText, actions: result.actions });
      await refreshTokenData();
    } catch (e: any) {
      Alert.alert('Koç Hatası', e.message || 'Yanıt alınamadı.');
      await refreshTokenData();
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSaveTokenCap() {
    const val = parseInt(capInput.trim(), 10);
    const cap = isNaN(val) || val < 0 ? 0 : val;
    await setTokenCap(cap);
    await refreshTokenData();
    Alert.alert(
      'Bütçe Tavanı Güncellendi',
      cap > 0
        ? `Yeni limit ${cap.toLocaleString('tr-TR')} token olarak belirlendi.`
        : 'Token harcama limiti kaldırıldı (Limitsiz).',
    );
  }

  function handleResetTokenStats() {
    Alert.alert(
      'Sayaçları Sıfırla',
      'Token kullanım geçmişi ve tahmini maliyet sıfırlanacaktır. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            await resetTokenStats();
            await refreshTokenData();
          },
        },
      ],
    );
  }

  function handleClearErrors() {
    Alert.alert('Hata Kayıtlarını Temizle', 'Tüm API hata geçmişi silinecektir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: async () => {
          await clearApiErrors();
          await refreshTokenData();
        },
      },
    ]);
  }

  function handleApplyPresetPack(pack: PresetPack) {
    for (const task of pack.tasks) {
      addGoal({
        type: 'coach',
        title: task.title,
        description: `${pack.name} kapsamındaki görev.`,
        date: '',
        time: task.time,
        repeat: { unit: 'gun', interval: 1 },
        daysOfWeek: task.daysOfWeek,
        endDate: '',
        category: task.category,
        sessionMinutes: task.sessionMinutes,
        coachReason: `Admin Paneli: ${pack.name}`,
      });
    }
    Alert.alert('Eklendi', `"${pack.name}" görevleri anasayfanıza başarıyla eklendi.`);
  }

  function handleClearAdminGoals() {
    const adminGoals = goals.filter(
      (g) =>
        g.coachReason?.includes('Admin') ||
        g.coachReason?.includes('Geliştirici') ||
        g.description?.includes('Admin'),
    );
    if (adminGoals.length === 0) {
      Alert.alert('Bilgi', 'Silinecek test/admin görevi bulunamadı.');
      return;
    }
    for (const g of adminGoals) {
      deleteGoal(g.id);
    }
    Alert.alert('Temizlendi', `${adminGoals.length} adet test görevi kaldırıldı.`);
  }

  function handleWipe() {
    Alert.alert(
      'Sistem Verilerini Sıfırla',
      'Tüm hedefler, seri puanları, su içme planı ve yerel oturum silinecektir. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tümünü Sıfırla',
          style: 'destructive',
          onPress: () => {
            void wipeAllData().then(() => router.replace('/'));
          },
        },
      ],
    );
  }

  const completedGoalsCount = goals.filter((g) => g.streak > 0).length;
  const bestStreak = goals.reduce((max, g) => Math.max(max, g.streak), 0);
  const costTry = (tokenStats.estimatedCostUsd * 38.0).toFixed(4);

  const filteredUsers = adminUsers.filter((u) => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.surname.toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Üst Başlık & Durum */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Uygulamaya Dön</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <View
              style={[
                styles.statusBadge,
                dbConnected ? styles.statusBadgeOnline : styles.statusBadgeOffline,
              ]}>
              <View
                style={[styles.statusDot, dbConnected ? styles.dotOnline : styles.dotOffline]}
              />
              <Text style={styles.statusText}>
                {checkingDb
                  ? 'Kontrol ediliyor...'
                  : dbConnected
                  ? `DB Canlı (${dbLatency}ms)`
                  : 'DB Çevrimdışı'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.kicker}>GELİŞTİRİCİ & YÖNETİM MERKEZİ</Text>
        <Text style={styles.title}>YÖNETİM PANELİ</Text>
        <Text style={styles.subtitle}>
          AI maliyetlerini, sistem talimatlarını, kayıtlı kullanıcıları ve uygulama durumunu kod yazmadan yönetin.
        </Text>

        {/* Yatay Kayan Sekme Çubuğu */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'stats' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('stats')}>
            <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
              📊 Genel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'users' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => {
              setActiveTab('users');
              void fetchAdminUsers();
            }}>
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              👥 Kullanıcılar ({adminUsers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'tokens' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => {
              setActiveTab('tokens');
              void refreshTokenData();
            }}>
            <Text style={[styles.tabText, activeTab === 'tokens' && styles.tabTextActive]}>
              🪙 Token & Maliyet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'coach' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('coach')}>
            <Text style={[styles.tabText, activeTab === 'coach' && styles.tabTextActive]}>
              🤖 AI Koç
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'presets' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('presets')}>
            <Text style={[styles.tabText, activeTab === 'presets' && styles.tabTextActive]}>
              🎯 Şablonlar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'system' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => setActiveTab('system')}>
            <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>
              ⚙️ Sistem
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 1: GENEL BAKIŞ                                                */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'stats' && (
          <View style={styles.tabContent}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>AKTİF HEDEF</Text>
                <Text style={styles.statValue}>{goals.length}</Text>
                <Text style={styles.statSub}>{completedGoalsCount} tanesi seride</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>EN YÜKSEK SERİ</Text>
                <Text style={[styles.statValue, { color: '#FF7B00' }]}>{bestStreak} Gün</Text>
                <Text style={styles.statSub}>Kesintisiz disiplin</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TOPLAM PUAN</Text>
                <Text style={[styles.statValue, { color: '#3DDC84' }]}>{score}</Text>
                <Text style={styles.statSub}>Kullanıcı skoru</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>SU TÜKETİMİ</Text>
                <Text style={[styles.statValue, { color: '#208AEF' }]}>
                  {water.consumedMl} ml
                </Text>
                <Text style={styles.statSub}>Hedef: {water.targetMl} ml</Text>
              </View>
            </View>

            {/* Oturum & Profil Bilgisi */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>👤 Mevcut Yönetici Oturumu</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Kullanıcı Adı:</Text>
                <Text style={styles.infoVal}>@{user?.username || 'Giriş yapılmadı'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>E-posta:</Text>
                <Text style={styles.infoVal}>{user?.email || 'Yerel oturum'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Karakter Arketipi:</Text>
                <Text style={styles.infoVal}>{profile?.toUpperCase() || 'BELİRLENMEDİ'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Çalışma Modu:</Text>
                <Text style={[styles.infoVal, { color: isRemoteEnabled() ? '#3DDC84' : '#FFB703' }]}>
                  {isRemoteEnabled() ? 'Bulut Senkronize (Supabase)' : 'Cihaz İçi (Offline)'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtnOutline}
              activeOpacity={0.8}
              onPress={() => void checkDatabaseHealth()}>
              <Text style={styles.actionBtnOutlineLabel}>
                {checkingDb ? 'Test Ediliyor...' : '🔄 Veritabanı Bağlantısını Yenile'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 2: KAYITLI KULLANICILAR DİZİNİ                                */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'users' && (
          <View style={styles.tabContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionHeader}>👥 KAYITLI KULLANICI DİZİNİ</Text>
              <TouchableOpacity
                onPress={() => void fetchAdminUsers()}
                activeOpacity={0.7}
                style={styles.refreshIconBtn}>
                <Text style={styles.refreshIconBtnText}>🔄 Yenile</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardHint}>
              Supabase PostgreSQL veritabanında kayıtlı tüm kullanıcıların hedefleri, puanları ve profilleri:
            </Text>

            {/* Arama Kutusu */}
            <TextInput
              value={userSearchQuery}
              onChangeText={setUserSearchQuery}
              placeholder="İsim veya @kullanıcıadı ile ara..."
              placeholderTextColor="#666"
              style={styles.searchBar}
            />

            {loadingUsers ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color="#C1121F" size="large" />
                <Text style={styles.loadingText}>Kullanıcı listesi getiriliyor...</Text>
              </View>
            ) : usersError ? (
              <View style={styles.errorNoticeBox}>
                <Text style={styles.errorNoticeTitle}>⚠️ Bilgi / Uyarı</Text>
                <Text style={styles.errorNoticeDesc}>{usersError}</Text>
              </View>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptyNoticeBox}>
                <Text style={styles.emptyNoticeText}>Kayıtlı kullanıcı bulunamadı.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredUsers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.userCard}
                    activeOpacity={0.85}
                    onPress={() => void inspectUser(u)}>
                    <View style={styles.userAvatarBox}>
                      <Text style={styles.userAvatarText}>
                        {u.gender === 'kadin' ? '👩' : u.gender === 'erkek' ? '👨' : '👤'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.userDisplayName}>
                        {u.name} {u.surname}
                      </Text>
                      <Text style={styles.userUsername}>@{u.username}</Text>
                      <View style={styles.userPillRow}>
                        <View style={styles.userPillScore}>
                          <Text style={styles.userPillScoreText}>🏆 {u.score} P</Text>
                        </View>
                        <View style={styles.userPillGoals}>
                          <Text style={styles.userPillGoalsText}>🎯 {u.goals_count} Hedef</Text>
                        </View>
                        {u.profile_key && (
                          <View style={styles.userPillArchetype}>
                            <Text style={styles.userPillArchetypeText}>
                              {u.profile_key.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.inspectArrow}>İncele ›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 3: TOKEN VE HARCAMA ANALİZİ                                   */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'tokens' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionHeader}>🪙 OPENAI GPT-4O-MINI MALİYET & TÜKETİM</Text>
            <Text style={styles.cardHint}>
              Kullanıcıların AI koç ile konuşmalarında tüketilen token miktarı ve gerçek zamanlı maliyeti:
            </Text>

            {/* Maliyet & Token Metrikleri */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TOPLAM TOKEN</Text>
                <Text style={[styles.statValue, { color: '#FFB703' }]}>
                  {tokenStats.totalTokens.toLocaleString('tr-TR')}
                </Text>
                <Text style={styles.statSub}>
                  Girdi: {tokenStats.promptTokens.toLocaleString('tr-TR')} · Çıktı:{' '}
                  {tokenStats.completionTokens.toLocaleString('tr-TR')}
                </Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>TAHMİNİ MALİYET</Text>
                <Text style={[styles.statValue, { color: '#3DDC84' }]}>
                  ${tokenStats.estimatedCostUsd.toFixed(4)}
                </Text>
                <Text style={styles.statSub}>Yaklaşık ~{costTry} ₺</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>İSTEK SAYISI</Text>
                <Text style={styles.statValue}>{tokenStats.requestCount}</Text>
                <Text style={styles.statSub}>Koç turn sayısı</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>BÜTÇE TAVANI</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: tokenStats.tokenCap > 0 ? '#FF5C5C' : '#8A8A8A' },
                  ]}>
                  {tokenStats.tokenCap > 0
                    ? `${(tokenStats.tokenCap / 1000).toFixed(0)}k`
                    : 'Limitsiz'}
                </Text>
                <Text style={styles.statSub}>
                  {tokenStats.tokenCap > 0
                    ? `%${Math.min(
                        100,
                        Math.round((tokenStats.totalTokens / tokenStats.tokenCap) * 100),
                      )} kullanıldı`
                    : 'Güvenlik limiti yok'}
                </Text>
              </View>
            </View>

            {/* Bütçe Tavanı Belirleme */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🛡️ Token Harcama Limiti (Budget Cap)</Text>
              <Text style={styles.cardHint}>
                Fatura güvenliği için maksimum token harcama limiti koyabilirsiniz. Limit aşılınca sistem API çağrılarını otomatik durdurur:
              </Text>

              <View style={styles.capInputRow}>
                <TextInput
                  value={capInput}
                  onChangeText={setCapInput}
                  placeholder="Örn: 50000 (0 = Limitsiz)"
                  placeholderTextColor="#666"
                  keyboardType="number-pad"
                  style={styles.capInputField}
                />
                <TouchableOpacity
                  style={styles.capSaveBtn}
                  activeOpacity={0.85}
                  onPress={() => void handleSaveTokenCap()}>
                  <Text style={styles.capSaveBtnLabel}>Kaydet</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quickCapsRow}>
                <TouchableOpacity
                  style={styles.quickCapPill}
                  onPress={() => {
                    setCapInput('20000');
                    void setTokenCap(20000).then(refreshTokenData);
                  }}>
                  <Text style={styles.quickCapText}>20k (~$0.01)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickCapPill}
                  onPress={() => {
                    setCapInput('50000');
                    void setTokenCap(50000).then(refreshTokenData);
                  }}>
                  <Text style={styles.quickCapText}>50k (~$0.03)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickCapPill}
                  onPress={() => {
                    setCapInput('100000');
                    void setTokenCap(100000).then(refreshTokenData);
                  }}>
                  <Text style={styles.quickCapText}>100k (~$0.06)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickCapPill, { borderColor: '#444' }]}
                  onPress={() => {
                    setCapInput('');
                    void setTokenCap(0).then(refreshTokenData);
                  }}>
                  <Text style={[styles.quickCapText, { color: '#888' }]}>Kaldır</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.resetStatsBtn}
                activeOpacity={0.8}
                onPress={handleResetTokenStats}>
                <Text style={styles.resetStatsBtnLabel}>🔄 Token Sayaçlarını Sıfırla</Text>
              </TouchableOpacity>
            </View>

            {/* Canlı API Hata Günlüğü (Live Error Log) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>⚠️ Canlı API Hata Günlüğü ({apiErrors.length})</Text>
                {apiErrors.length > 0 && (
                  <TouchableOpacity onPress={handleClearErrors} activeOpacity={0.7}>
                    <Text style={styles.resetLink}>Temizle</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.cardHint}>
                OpenAI veya veritabanı ile iletişimde yaşanan son hatalar:
              </Text>

              {apiErrors.length === 0 ? (
                <View style={styles.cleanLogBox}>
                  <Text style={styles.cleanLogText}>✅ Kayıtlı API hatası yok. Sistem sorunsuz çalışıyor.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {apiErrors.map((err) => (
                    <View key={err.id} style={styles.errorLogItem}>
                      <Text style={styles.errorLogTime}>{err.timestamp}</Text>
                      <Text style={styles.errorLogMsg}>{err.message}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 4: AI KOÇ STÜDYOSU (PERSONA, PROMPT & CANLI TEST)             */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'coach' && (
          <View style={styles.tabContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionHeader}>🎭 KOÇ KİŞİLİKLERİ</Text>
              <TouchableOpacity
                style={styles.addPersonaBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setNewPersonaName('');
                  setNewPersonaDesc('');
                  setNewPersonaEmoji('⚡');
                  setNewPersonaPrompt(DEFAULT_COACH_VOICE);
                  setShowAddPersonaModal(true);
                }}>
                <Text style={styles.addPersonaBtnLabel}>+ Yeni Kişilik Ekle</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardHint}>
              Bir karaktere dokunarak yapay zekanın üslubunu tek tıkla değiştirebilirsiniz. Dilediğiniz kadar yeni kişilik üretebilirsiniz:
            </Text>

            {/* Persona Kartları */}
            <View style={styles.personaGrid}>
              {personas.map((p) => {
                const isSelected = selectedPersonaId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.personaCard, isSelected && styles.personaCardSelected]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectPersona(p)}>
                    <View style={styles.personaTopRow}>
                      <Text style={styles.personaEmoji}>{p.emoji}</Text>
                      {p.isCustom && (
                        <View style={styles.customBadgeRow}>
                          <View style={styles.customBadge}>
                            <Text style={styles.customBadgeText}>ÖZEL</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteCustomPersona(p)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={styles.deleteCustomIcon}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.personaName, isSelected && styles.personaNameSelected]}>
                      {p.name}
                    </Text>
                    <Text style={styles.personaDesc} numberOfLines={2}>
                      {p.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Canlı Prompt Editörü */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>⚙️ Sistem Talimatı (System Prompt)</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setVoice(DEFAULT_COACH_VOICE);
                    setSelectedPersonaId('tough');
                  }}>
                  <Text style={styles.resetLink}>Varsayılana Dön</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardHint}>
                OpenAI GPT-4o-mini'ye gönderilen yönlendirici talimat metni:
              </Text>
              <TextInput
                value={voice}
                onChangeText={(t) => {
                  setVoice(t);
                  setSelectedPersonaId('');
                }}
                multiline
                textAlignVertical="top"
                style={styles.promptInput}
              />
              <TouchableOpacity
                style={[styles.saveBtn, savingVoice && { opacity: 0.5 }]}
                activeOpacity={0.85}
                disabled={savingVoice}
                onPress={() => void handleSaveVoice()}>
                <Text style={styles.saveBtnLabel}>
                  {savingVoice ? 'KAYDEDİLİYOR...' : '💾 KOÇ ÜSLUBUNU KAYDET'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Canlı Koç Test Simülatörü */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🧪 Canlı Koç Test Simülatörü</Text>
              <Text style={styles.cardHint}>
                Yukarıda düzenlenen sistem talimatının gerçekte nasıl tepki verdiğini test edin:
              </Text>
              <TextInput
                value={testInput}
                onChangeText={setTestInput}
                placeholder="Örn: Bugün canım hiç çalışmak istemiyor..."
                placeholderTextColor="#666"
                style={styles.testInputField}
              />
              <TouchableOpacity
                style={[styles.testRunBtn, testLoading && { opacity: 0.5 }]}
                activeOpacity={0.85}
                disabled={testLoading}
                onPress={() => void handleRunCoachTest()}>
                {testLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.testRunBtnLabel}>⚡ Koçu Test Et</Text>
                )}
              </TouchableOpacity>

              {testResult && (
                <View style={styles.testOutputBox}>
                  <Text style={styles.testOutputTitle}>KOÇUN YANITI:</Text>
                  <Text style={styles.testOutputMessage}>"{testResult.message}"</Text>
                  {testResult.actions.length > 0 && (
                    <View style={styles.actionsBox}>
                      <Text style={styles.actionsTitle}>
                        ÜRETİLEN EYLEMLER ({testResult.actions.length}):
                      </Text>
                      {testResult.actions.map((act, i) => (
                        <Text key={i} style={styles.actionItem}>
                          • [{act.type.toUpperCase()}] {act.title} ({act.scheduled_time} -{' '}
                          {act.duration_minutes} dk)
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 5: HEDEF VE GÖREV ŞABLONLARI                                  */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'presets' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionHeader}>📦 HAZIR HEDEF PAKETLERİ</Text>
            <Text style={styles.cardHint}>
              Kullanıcı deneyimini test etmek için telefonunuza tek dokunuşla hazır alışkanlık paketleri yükleyin:
            </Text>

            {PRESET_PACKS.map((pack) => (
              <View key={pack.id} style={styles.packCard}>
                <View style={styles.packHeader}>
                  <Text style={styles.packEmoji}>{pack.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.packTitle}>{pack.name}</Text>
                    <Text style={styles.packDesc}>{pack.description}</Text>
                  </View>
                </View>

                <View style={styles.packTaskList}>
                  {pack.tasks.map((t, idx) => (
                    <Text key={idx} style={styles.packTaskItem}>
                      ✓ {t.title} · {t.time} ({t.daysOfWeek.length} gün/hafta)
                    </Text>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.addPackBtn}
                  activeOpacity={0.85}
                  onPress={() => handleApplyPresetPack(pack)}>
                  <Text style={styles.addPackBtnLabel}>+ Bu Paketi Hesabıma Ekle</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.cleanPackBtn}
              activeOpacity={0.85}
              onPress={handleClearAdminGoals}>
              <Text style={styles.cleanPackBtnLabel}>🗑️ Tüm Test/Admin Görevlerini Temizle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* SEKME 6: SİSTEM & BAKIM ARAÇLARI                                    */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'system' && (
          <View style={styles.tabContent}>
            {/* Ortam Değişkenleri Bilgisi */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔒 Ortam ve Güvenlik Parametreleri</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Supabase URL:</Text>
                <Text style={styles.infoVal} numberOfLines={1}>
                  {process.env.EXPO_PUBLIC_SUPABASE_URL || 'Tanımlı değil'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>OpenAI API Key:</Text>
                <Text style={styles.infoVal}>
                  {process.env.EXPO_PUBLIC_OPENAI_API_KEY
                    ? '••••••••' + process.env.EXPO_PUBLIC_OPENAI_API_KEY.slice(-6)
                    : 'Eksik'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Bundle ID:</Text>
                <Text style={styles.infoVal}>com.berat.hatirlatici</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Expo SDK:</Text>
                <Text style={styles.infoVal}>v58.0.26</Text>
              </View>
            </View>

            {/* Tehlikeli Alan */}
            <View style={[styles.card, { borderColor: '#C1121F' }]}>
              <Text style={[styles.cardTitle, { color: '#FF5C5C' }]}>⚠️ Tehlikeli Alan</Text>
              <Text style={styles.cardHint}>
                Aşağıdaki işlem tüm yerel verileri, test hedeflerini ve oturumu kalıcı olarak sıfırlar.
              </Text>
              <TouchableOpacity style={styles.dangerBtn} activeOpacity={0.85} onPress={handleWipe}>
                <Text style={styles.dangerBtnLabel}>SİSTEMİ VE TÜM VERİLERİ SIFIRLA</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 1: YENİ KİŞİLİK OLUŞTURMA MODALI                             */}
      {/* ------------------------------------------------------------------- */}
      <Modal visible={showAddPersonaModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ Yeni Koç Kişiliği Oluştur</Text>
              <TouchableOpacity
                onPress={() => setShowAddPersonaModal(false)}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.inputLabel}>Kişilik Adı:</Text>
              <TextInput
                value={newPersonaName}
                onChangeText={setNewPersonaName}
                placeholder="Örn: Agresif Girişimci, Nörobilimci..."
                placeholderTextColor="#666"
                style={styles.modalInput}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 80 }}>
                  <Text style={styles.inputLabel}>Emoji:</Text>
                  <TextInput
                    value={newPersonaEmoji}
                    onChangeText={setNewPersonaEmoji}
                    style={[styles.modalInput, { textAlign: 'center', fontSize: 20 }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Kısa Açıklama:</Text>
                  <TextInput
                    value={newPersonaDesc}
                    onChangeText={setNewPersonaDesc}
                    placeholder="Örn: Sert, veri odaklı ve stratejik..."
                    placeholderTextColor="#666"
                    style={styles.modalInput}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Sistem Talimatı (Prompt):</Text>
              <TextInput
                value={newPersonaPrompt}
                onChangeText={setNewPersonaPrompt}
                multiline
                textAlignVertical="top"
                style={[styles.modalInput, { minHeight: 180, fontSize: 12 }]}
              />

              <TouchableOpacity
                style={styles.modalSaveBtn}
                activeOpacity={0.85}
                onPress={() => void handleCreateCustomPersona()}>
                <Text style={styles.modalSaveBtnText}>💾 Kişiliği Kaydet & Kullan</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL 2: KULLANICI İNCELEME MODALI (INSPECTION MODAL)               */}
      {/* ------------------------------------------------------------------- */}
      <Modal visible={showUserModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  👤 {selectedUser?.name} {selectedUser?.surname}
                </Text>
                <Text style={styles.modalSubTitle}>@{selectedUser?.username}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowUserModal(false)}
                style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {loadingDetail ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator color="#C1121F" size="large" />
                  <Text style={styles.loadingText}>Kullanıcı detayları yükleniyor...</Text>
                </View>
              ) : (
                <>
                  {/* Özet Kartları */}
                  <View style={styles.detailGrid}>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailLabel}>TOPLAM PUAN</Text>
                      <Text style={[styles.detailValue, { color: '#3DDC84' }]}>
                        {userDetail?.score ?? selectedUser?.score ?? 0}
                      </Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailLabel}>HEDEF SAYISI</Text>
                      <Text style={styles.detailValue}>
                        {userDetail?.goals?.length ?? selectedUser?.goals_count ?? 0}
                      </Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailLabel}>ARKETİP</Text>
                      <Text style={[styles.detailValue, { fontSize: 16, color: '#FFB703' }]}>
                        {userDetail?.profile_key?.toUpperCase() ||
                          selectedUser?.profile_key?.toUpperCase() ||
                          'YOK'}
                      </Text>
                    </View>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailLabel}>CİNSİYET</Text>
                      <Text style={[styles.detailValue, { fontSize: 16 }]}>
                        {selectedUser?.gender ? selectedUser.gender.toUpperCase() : 'BİLİNMİYOR'}
                      </Text>
                    </View>
                  </View>

                  {/* Hedefler Listesi */}
                  <Text style={styles.sectionHeader}>🎯 AKTİF HEDEFLERİ</Text>
                  {userDetail?.goals && userDetail.goals.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {userDetail.goals.map((g, idx) => (
                        <View key={g.id || idx} style={styles.goalDetailItem}>
                          <Text style={styles.goalDetailTitle}>• {g.title}</Text>
                          <Text style={styles.goalDetailSub}>
                            Saat: {g.time || 'Belirtilmedi'} · Seans: {g.sessionMinutes || 30} dk ·
                            Kategori: {g.category || 'Genel'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyNoticeBox}>
                      <Text style={styles.emptyNoticeText}>Kullanıcının kayıtlı hedefi bulunmuyor.</Text>
                    </View>
                  )}

                  {/* Su Tüketim Ayarları */}
                  {userDetail?.water_settings && (
                    <>
                      <Text style={[styles.sectionHeader, { marginTop: 12 }]}>💧 SU AYARLARI</Text>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoKey}>Günlük Hedef:</Text>
                        <Text style={styles.infoVal}>
                          {userDetail.water_settings.dailyTargetMl || 2500} ml
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={{ height: 20 }} />
                </>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
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
    paddingBottom: 48,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backHit: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: '#B5B5B5',
    fontSize: 15,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  statusBadgeOnline: {
    backgroundColor: '#0D2818',
    borderColor: '#1F6F4A',
    borderWidth: 1,
  },
  statusBadgeOffline: {
    backgroundColor: '#280D0D',
    borderColor: '#6F1F1F',
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: '#3DDC84',
  },
  dotOffline: {
    backgroundColor: '#FF5C5C',
  },
  statusText: {
    color: '#D4D4D4',
    fontSize: 11,
    fontWeight: '700',
  },
  kicker: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: '#8A8A8A',
    fontSize: 13,
    lineHeight: 18,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#222222',
  },
  tabText: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabContent: {
    gap: 16,
  },
  sectionHeader: {
    color: '#B5B5B5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  refreshIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
  },
  refreshIconBtnText: {
    color: '#3DDC84',
    fontSize: 11,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#121212',
    borderColor: '#242424',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  statLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  statSub: {
    color: '#666666',
    fontSize: 11,
  },
  card: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  resetLink: {
    color: '#C1121F',
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoKey: {
    color: '#888888',
    fontSize: 13,
  },
  infoVal: {
    color: '#EDEDED',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '60%',
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnOutlineLabel: {
    color: '#C8C8C8',
    fontSize: 13,
    fontWeight: '700',
  },
  searchBar: {
    backgroundColor: '#0E0E0E',
    borderColor: '#242424',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 13,
  },
  centerBox: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  errorNoticeBox: {
    backgroundColor: '#280D0D',
    borderColor: '#6F1F1F',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  errorNoticeTitle: {
    color: '#FF5C5C',
    fontSize: 13,
    fontWeight: '800',
  },
  errorNoticeDesc: {
    color: '#CCCCCC',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyNoticeBox: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyNoticeText: {
    color: '#666',
    fontSize: 13,
  },
  userCard: {
    backgroundColor: '#121212',
    borderColor: '#202020',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 22,
  },
  userDisplayName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  userUsername: {
    color: '#888888',
    fontSize: 12,
  },
  userPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  userPillScore: {
    backgroundColor: '#0D2818',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userPillScoreText: {
    color: '#3DDC84',
    fontSize: 10,
    fontWeight: '700',
  },
  userPillGoals: {
    backgroundColor: '#1A2A3A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userPillGoalsText: {
    color: '#208AEF',
    fontSize: 10,
    fontWeight: '700',
  },
  userPillArchetype: {
    backgroundColor: '#2A1F0D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userPillArchetypeText: {
    color: '#FFB703',
    fontSize: 10,
    fontWeight: '700',
  },
  inspectArrow: {
    color: '#C1121F',
    fontSize: 13,
    fontWeight: '700',
  },
  capInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  capInputField: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  capSaveBtn: {
    backgroundColor: '#1F6F4A',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  capSaveBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  quickCapsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickCapPill: {
    backgroundColor: '#181818',
    borderColor: '#303030',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickCapText: {
    color: '#D0D0D0',
    fontSize: 11,
    fontWeight: '600',
  },
  resetStatsBtn: {
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  resetStatsBtnLabel: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '700',
  },
  cleanLogBox: {
    backgroundColor: '#0D2818',
    borderColor: '#1F6F4A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  cleanLogText: {
    color: '#3DDC84',
    fontSize: 12,
    fontWeight: '600',
  },
  errorLogItem: {
    backgroundColor: '#1A0E0E',
    borderColor: '#4A1F1F',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  errorLogTime: {
    color: '#FF7B00',
    fontSize: 10,
    fontWeight: '800',
  },
  errorLogMsg: {
    color: '#E0E0E0',
    fontSize: 12,
    lineHeight: 16,
  },
  addPersonaBtn: {
    backgroundColor: '#1F6F4A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addPersonaBtnLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  personaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  personaCard: {
    width: '48%',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  personaCardSelected: {
    borderColor: '#C1121F',
    backgroundColor: '#1A0E10',
  },
  personaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personaEmoji: {
    fontSize: 24,
  },
  customBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customBadge: {
    backgroundColor: '#FF7B00',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
  deleteCustomIcon: {
    fontSize: 14,
  },
  personaName: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '800',
  },
  personaNameSelected: {
    color: '#FF5C5C',
  },
  personaDesc: {
    color: '#777777',
    fontSize: 11,
    lineHeight: 15,
  },
  promptInput: {
    minHeight: 160,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 10,
    color: '#E0E0E0',
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  saveBtn: {
    backgroundColor: '#1F6F4A',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  saveBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  testInputField: {
    backgroundColor: '#0A0A0A',
    borderColor: '#242424',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 13,
  },
  testRunBtn: {
    backgroundColor: '#C1121F',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  testRunBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  testOutputBox: {
    backgroundColor: '#080808',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  testOutputTitle: {
    color: '#FF7B00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  testOutputMessage: {
    color: '#EEEEEE',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actionsBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#202020',
    gap: 4,
  },
  actionsTitle: {
    color: '#3DDC84',
    fontSize: 11,
    fontWeight: '800',
  },
  actionItem: {
    color: '#B0B0B0',
    fontSize: 12,
  },
  packCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  packHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  packEmoji: {
    fontSize: 32,
  },
  packTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  packDesc: {
    color: '#8A8A8A',
    fontSize: 12,
    lineHeight: 16,
  },
  packTaskList: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  packTaskItem: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  addPackBtn: {
    backgroundColor: '#202020',
    borderColor: '#333333',
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  addPackBtnLabel: {
    color: '#3DDC84',
    fontSize: 13,
    fontWeight: '800',
  },
  cleanPackBtn: {
    borderWidth: 1,
    borderColor: '#4A1F1F',
    backgroundColor: '#1A0B0B',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  cleanPackBtnLabel: {
    color: '#FF5C5C',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerBtn: {
    backgroundColor: '#C1121F',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 16,
  },
  dangerBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  // Modal Stilleri
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#262626',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202020',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubTitle: {
    color: '#888888',
    fontSize: 13,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
    gap: 14,
  },
  inputLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#0A0A0A',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  modalSaveBtn: {
    backgroundColor: '#1F6F4A',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0A0A0A',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  detailLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
  },
  detailValue: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
  },
  goalDetailItem: {
    backgroundColor: '#0A0A0A',
    borderColor: '#202020',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  goalDetailTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  goalDetailSub: {
    color: '#777777',
    fontSize: 11,
  },
});
