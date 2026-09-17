import { useState } from 'react';
import {
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

import { useUser } from '@/context/GoalContext';

export default function SecurityScreen() {
  const router = useRouter();
  const { updatePassword } = useUser();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = currentPassword.trim().length > 0 && passwordsMatch;

  function clearMessage() {
    setMessage(null);
  }

  function handleUpdatePassword() {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setMessage({ type: 'error', text: 'Lütfen tüm alanları doldur.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Yeni şifreler eşleşmiyor. Kayıt yok.' });
      return;
    }
    const success = updatePassword(currentPassword, newPassword);
    if (!success) {
      setMessage({ type: 'error', text: 'Mevcut şifre yanlış.' });
      return;
    }
    setMessage({ type: 'success', text: 'Şifren güncellendi. Unutursan bahanen kalmaz.' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backHit} activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Geri</Text>
          </TouchableOpacity>

          <Text style={styles.title}>GÜVENLİK</Text>
          <Text style={styles.subtitle}>Şifreni değiştir. İki yeni şifre birebir aynı olmadan kayıt olmaz.</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ŞİFRE DEĞİŞTİR</Text>
            <TextInput
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                clearMessage();
              }}
              placeholder="Mevcut Şifre"
              placeholderTextColor="#6B6B6B"
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                clearMessage();
              }}
              placeholder="Yeni Şifre"
              placeholderTextColor="#6B6B6B"
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                clearMessage();
              }}
              placeholder="Yeni Şifre Tekrar"
              placeholderTextColor="#6B6B6B"
              style={[
                styles.input,
                confirmPassword.length > 0 && !passwordsMatch && styles.inputMismatch,
              ]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <Text style={styles.errorText}>Yeni şifreler eşleşmiyor.</Text>
            )}
            {!!message && (
              <Text style={message.type === 'error' ? styles.errorText : styles.successText}>
                {message.text}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.updateButton, !canSubmit && styles.updateButtonDisabled]}
              activeOpacity={0.85}
              onPress={handleUpdatePassword}
              disabled={!canSubmit}>
              <Text style={styles.updateButtonLabel}>ŞİFREYİ KAYDET</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    gap: 20,
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
  },
  subtitle: {
    color: '#8A8A8A',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
  },
  inputMismatch: {
    borderColor: '#C1121F',
  },
  errorText: {
    color: '#FF5C5C',
    fontSize: 13,
    fontWeight: '600',
  },
  successText: {
    color: '#3DDC84',
    fontSize: 13,
    fontWeight: '600',
  },
  updateButton: {
    backgroundColor: '#C1121F',
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonDisabled: {
    opacity: 0.4,
  },
  updateButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
