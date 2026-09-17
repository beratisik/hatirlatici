import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EDIT_LOCK_MESSAGE } from '@/context/GoalContext';

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  destructive = false,
) {
  if (Platform.OS === 'web') {
    onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function confirmDeleteGoal(title: string, onConfirm: () => void) {
  confirmAction(
    'Görevi sil',
    `"${title}" kalıcı olarak silinecek. Geri dönüş yok.`,
    'Sil',
    onConfirm,
    true,
  );
}

export function confirmPauseGoal(title: string, onConfirm: () => void) {
  confirmAction(
    'Hedefi duraklat',
    `"${title}" arşive alınacak. Serin silinmez. İstediğin zaman geri yükle.`,
    'Duraklat',
    onConfirm,
  );
}

export function confirmFinishGoal(title: string, onConfirm: () => void) {
  confirmAction(
    'Hedefi bitir',
    `"${title}" kapatılacak. Mezuniyet karnen açılır. Geri dönüş yok.`,
    'Bitir',
    onConfirm,
    true,
  );
}

export function GoalMenuButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuHit} activeOpacity={0.7} onPress={onPress}>
      <Text style={styles.menuDots}>⋮</Text>
    </TouchableOpacity>
  );
}

export function GoalMenuSheet({
  visible,
  onClose,
  onEdit,
  onPause,
  onFinish,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  onDelete: () => void;
}) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        {onEdit ? (
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => {
              onClose();
              onEdit();
            }}>
            <Text style={styles.itemLabel}>Düzenle</Text>
          </TouchableOpacity>
        ) : null}
        {onPause ? (
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => {
              onClose();
              onPause();
            }}>
            <Text style={styles.itemLabel}>Duraklat</Text>
          </TouchableOpacity>
        ) : null}
        {onFinish ? (
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => {
              onClose();
              onFinish();
            }}>
            <Text style={styles.itemLabel}>Bitir</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.item}
          activeOpacity={0.8}
          onPress={() => {
            onClose();
            onDelete();
          }}>
          <Text style={[styles.itemLabel, styles.deleteLabel]}>Sil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.item} activeOpacity={0.8} onPress={onClose}>
          <Text style={styles.cancelLabel}>Vazgeç</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function CoachLockModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;

  return (
    <View style={styles.lockOverlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.lockBox}>
        <Text style={styles.lockKicker}>SERT KOÇ</Text>
        <Text style={styles.lockMessage}>{EDIT_LOCK_MESSAGE}</Text>
        <TouchableOpacity style={styles.lockButton} activeOpacity={0.85} onPress={onClose}>
          <Text style={styles.lockButtonLabel}>ANLADIM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDots: {
    color: '#C8C8C8',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
    paddingBottom: 24,
    paddingTop: 8,
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  itemLabel: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteLabel: {
    color: '#FF5C5C',
  },
  cancelLabel: {
    color: '#8A8A8A',
    fontSize: 15,
    fontWeight: '600',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 40,
  },
  lockBox: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 24,
    gap: 16,
    zIndex: 41,
  },
  lockKicker: {
    color: '#C1121F',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  lockMessage: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 28,
  },
  lockButton: {
    backgroundColor: '#C1121F',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  lockButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
