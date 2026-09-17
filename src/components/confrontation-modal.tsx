import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function ConfrontationModal({
  visible,
  streak,
  message,
  onClose,
}: {
  visible: boolean;
  streak: number;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.screen}>
        <Text style={styles.kicker}>YÜZLEŞME</Text>
        <Text style={styles.streak}>{streak}</Text>
        <Text style={styles.streakLabel}>{streak === 1 ? 'GÜNLÜK SERİ' : 'GÜNLÜK SERİ'}</Text>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={onClose}>
          <Text style={styles.buttonLabel}>ANLADIM</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  kicker: {
    color: '#C1121F',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
  },
  streak: {
    color: '#C1121F',
    fontSize: 96,
    fontWeight: '900',
    lineHeight: 100,
  },
  streakLabel: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: -8,
  },
  message: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center',
    marginTop: 12,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#C1121F',
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
