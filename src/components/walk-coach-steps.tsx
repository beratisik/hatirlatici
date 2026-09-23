import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { WheelPicker } from '@/components/wheel-picker';

const PLACES = [
  'Yok, dışarıda yürüyeceğim',
  'Var, koşu bandı veya eliptik kullanacağım',
  'Koç karar versin',
] as const;

const FITNESS = [
  'Bütün gün masa başındayım, çok hamım',
  'Ara sıra spor yapıyorum (halı saha vb.)',
  'Sadece kafa dağıtmak istiyorum',
] as const;

const WINDOWS = ['Sabah işten önce', 'İş çıkışı, eve geçmeden', 'Akşam yemeği sonrası'] as const;

const BLOCKERS = ['Fiziksel yorgunluk, üşengeçlik', 'Hava durumu bahanesi', 'Düzensizlik'] as const;

export function WalkCoachSteps({
  step,
  place,
  onPlace,
  fitness,
  onFitness,
  focus,
  onFocus,
  blocker,
  onBlocker,
  startTime,
  endTime,
  activeClock,
  onActiveClock,
  hours,
  minutes,
  startHour,
  startMinute,
  endHour,
  endMinute,
  onStartHour,
  onStartMinute,
  onEndHour,
  onEndMinute,
}: {
  step: number;
  place: string | null;
  onPlace: (value: string) => void;
  fitness: string | null;
  onFitness: (value: string) => void;
  focus: string | null;
  onFocus: (value: string) => void;
  blocker: string | null;
  onBlocker: (value: string) => void;
  startTime: string;
  endTime: string;
  activeClock: 'start' | 'end';
  onActiveClock: (field: 'start' | 'end') => void;
  hours: string[];
  minutes: string[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  onStartHour: (index: number) => void;
  onStartMinute: (index: number) => void;
  onEndHour: (index: number) => void;
  onEndMinute: (index: number) => void;
}) {
  if (step === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.question}>Koşu bandın var mı?</Text>
        <View style={styles.options}>
          {PLACES.map((item) => (
            <Choice key={item} label={item} selected={place === item} onPress={() => onPlace(item)} />
          ))}
        </View>
      </View>
    );
  }

  if (step === 1) {
    return (
      <View style={styles.section}>
        <Text style={styles.question}>Şu anki fiziksel durumun ne?</Text>
        <View style={styles.options}>
          {FITNESS.map((item) => (
            <Choice
              key={item}
              label={item}
              selected={fitness === item}
              onPress={() => onFitness(item)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (step === 2) {
    return (
      <View style={styles.section}>
        <Text style={styles.question}>Sabah evden kaçta çıkıyor, akşam kaçta dönüyorsun?</Text>
        <View style={styles.clockRow}>
          <TouchableOpacity
            style={[styles.clockButton, activeClock === 'start' && styles.clockButtonActive]}
            activeOpacity={0.85}
            onPress={() => onActiveClock('start')}>
            <Text style={styles.clockLabel}>Evden çıkış</Text>
            <Text style={styles.clockValue}>{startTime}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clockButton, activeClock === 'end' && styles.clockButtonActive]}
            activeOpacity={0.85}
            onPress={() => onActiveClock('end')}>
            <Text style={styles.clockLabel}>Eve dönüş</Text>
            <Text style={styles.clockValue}>{endTime}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.wheelRow}>
          <WheelPicker
            key={`${activeClock}-hour`}
            data={hours}
            selectedIndex={activeClock === 'start' ? startHour : endHour}
            onSelect={activeClock === 'start' ? onStartHour : onEndHour}
          />
          <Text style={styles.timeSeparator}>:</Text>
          <WheelPicker
            key={`${activeClock}-minute`}
            data={minutes}
            selectedIndex={activeClock === 'start' ? startMinute : endMinute}
            onSelect={activeClock === 'start' ? onStartMinute : onEndMinute}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.question}>Hangi ara yürüyebilirsin?</Text>
      <View style={styles.options}>
        {WINDOWS.map((item) => (
          <Choice key={item} label={item} selected={focus === item} onPress={() => onFocus(item)} />
        ))}
      </View>
      <Text style={styles.question}>Seni en çok ne baltalıyor?</Text>
      <View style={styles.options}>
        {BLOCKERS.map((item) => (
          <Choice
            key={item}
            label={item}
            selected={blocker === item}
            onPress={() => onBlocker(item)}
          />
        ))}
      </View>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      activeOpacity={0.85}
      onPress={onPress}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  question: {
    color: '#F2F2F2',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 6,
  },
  options: {
    gap: 8,
  },
  chip: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  chipSelected: {
    borderColor: '#C1121F',
    backgroundColor: 'rgba(193, 18, 31, 0.12)',
  },
  chipLabel: {
    color: '#C8C8C8',
    fontSize: 14,
    fontWeight: '700',
  },
  chipLabelSelected: {
    color: '#FFFFFF',
  },
  clockRow: {
    flexDirection: 'row',
    gap: 10,
  },
  clockButton: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  clockButtonActive: {
    borderColor: '#C1121F',
  },
  clockLabel: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '700',
  },
  clockValue: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '800',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timeSeparator: {
    color: '#8A8A8A',
    fontSize: 24,
    fontWeight: '700',
  },
});
