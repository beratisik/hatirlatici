import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function confirmDeleteGoal(title: string, onConfirm: () => void) {
  Alert.alert('Görevi sil', `"${title}" kalıcı olarak silinecek. Geri dönüş yok.`, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: onConfirm },
  ]);
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
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
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
});
