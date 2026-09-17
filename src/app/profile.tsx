import { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { describeGender, getRank, useUser } from '@/context/GoalContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, score, updateAvatar, logout } = useUser();
  const rank = getRank(score);

  const [picking, setPicking] = useState(false);
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);

  const displayName = user?.name || 'Kullanıcı';
  const displayEmail = user?.email || '—';
  const initial = displayName.charAt(0).toUpperCase() || '?';
  const avatarUri = user?.avatarUri ?? null;

  function handleGoBack() {
    router.back();
  }

  function handleLogout() {
    logout();
    router.replace('/');
  }

  function handleAvatarPress() {
    setAvatarMenuVisible(true);
  }

  function handleViewAvatar() {
    setAvatarMenuVisible(false);
    setViewerVisible(true);
  }

  function handleUploadAvatar() {
    setAvatarMenuVisible(false);
    void handlePickAvatar();
  }

  async function handlePickAvatar() {
    if (picking) return;
    setPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin yok', 'Profil fotoğrafı seçmek için galeri izni vermen gerekiyor.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        updateAvatar(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Hata', 'Fotoğraf seçilemedi. Tekrar dene.');
    } finally {
      setPicking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={handleGoBack}>
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>PROFİL</Text>

        <View style={styles.userCard}>
          <TouchableOpacity style={styles.avatarHit} activeOpacity={0.8} onPress={handleAvatarPress}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>{picking ? '...' : '+'}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.userEmail}>{displayEmail}</Text>
            <Text style={styles.userGender}>{describeGender(user?.gender ?? null)}</Text>
            <Text style={styles.avatarHint}>Görüntüle veya yeni fotoğraf yükle</Text>
          </View>
        </View>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>DİSİPLİN SKORU</Text>
          <Text style={[styles.scoreValue, score < 0 && styles.scoreValueNegative]}>{score}</Text>

          <View style={styles.rankDivider} />

          <Text style={[styles.rankTitle, { color: rank.color }]}>{rank.title}</Text>
          <Text style={styles.rankQuote}>“{rank.quote}”</Text>
        </View>

        <TouchableOpacity
          style={styles.securityButton}
          activeOpacity={0.85}
          onPress={() => router.push('/settings/security')}>
          <View>
            <Text style={styles.securityButtonLabel}>ŞİFRE VE GÜVENLİK</Text>
            <Text style={styles.securityButtonHint}>Mevcut şifre + yeni şifre tekrarı</Text>
          </View>
          <Text style={styles.securityChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} activeOpacity={0.85} onPress={handleLogout}>
          <Text style={styles.logoutButtonLabel}>ÇIKIŞ YAP</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={avatarMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarMenuVisible(false)}>
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setAvatarMenuVisible(false)}
          />
          <View style={styles.menuSheet}>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.8} onPress={handleViewAvatar}>
              <Text style={styles.menuItemLabel}>Profil resmini görüntüle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.8}
              onPress={handleUploadAvatar}>
              <Text style={styles.menuItemLabel}>Yeni profil resmi yükle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.8}
              onPress={() => setAvatarMenuVisible(false)}>
              <Text style={styles.menuCancelLabel}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewerVisible}
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.viewerScreen}>
          <TouchableOpacity
            style={styles.viewerClose}
            activeOpacity={0.7}
            onPress={() => setViewerVisible(false)}>
            <Text style={styles.viewerCloseText}>‹ Kapat</Text>
          </TouchableOpacity>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.viewerImage} contentFit="contain" />
          ) : (
            <View style={styles.viewerPlaceholder}>
              <Text style={styles.viewerPlaceholderText}>{initial}</Text>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 26,
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
    color: '#F2F2F2',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 18,
  },
  avatarHit: {
    width: 72,
    height: 72,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1A1A',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    color: '#F5F5F5',
    fontSize: 19,
    fontWeight: '800',
  },
  userEmail: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '500',
  },
  userGender: {
    color: '#C8C8C8',
    fontSize: 12,
    fontWeight: '600',
  },
  avatarHint: {
    color: '#6B6B6B',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  scoreCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  scoreLabel: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  scoreValue: {
    color: '#3DDC84',
    fontSize: 44,
    fontWeight: '900',
  },
  scoreValueNegative: {
    color: '#FF5C5C',
  },
  rankDivider: {
    width: 40,
    height: 2,
    backgroundColor: '#2A2A2A',
    marginTop: 4,
    marginBottom: 2,
  },
  rankTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  rankQuote: {
    color: '#9A9A9A',
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  securityButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securityButtonLabel: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  securityButtonHint: {
    color: '#7A7A7A',
    fontSize: 12,
    marginTop: 4,
  },
  securityChevron: {
    color: '#8A8A8A',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
  logoutButton: {
    marginTop: 'auto',
    backgroundColor: '#C1121F',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  menuSheet: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
    paddingBottom: 24,
    paddingTop: 8,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemLabel: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '700',
  },
  menuCancelLabel: {
    color: '#8A8A8A',
    fontSize: 15,
    fontWeight: '600',
  },
  viewerScreen: {
    flex: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 52,
    left: 24,
    zIndex: 2,
    paddingVertical: 6,
    paddingRight: 12,
  },
  viewerCloseText: {
    color: '#B5B5B5',
    fontSize: 16,
    fontWeight: '600',
  },
  viewerImage: {
    width: '100%',
    height: '70%',
  },
  viewerPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#C1121F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 84,
    fontWeight: '800',
  },
});
