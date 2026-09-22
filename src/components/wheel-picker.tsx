import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// iOS alarm saati gibi yukarı/aşağı kaydırılan seçici.
const WHEEL_ITEM_HEIGHT = 40;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2);
export const WHEEL_CONTAINER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;

export function WheelPicker({
  data,
  selectedIndex,
  onSelect,
  disabledIndexes,
}: {
  data: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  disabledIndexes?: Set<number>;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Modal her açıldığında (component yeniden mount olduğunda) doğru satıra atla.
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isDisabled(index: number) {
    return disabledIndexes?.has(index) ?? false;
  }

  function nearestEnabledIndex(index: number) {
    if (!isDisabled(index)) return index;
    for (let offset = 1; offset < data.length; offset++) {
      const up = index + offset;
      const down = index - offset;
      if (up < data.length && !isDisabled(up)) return up;
      if (down >= 0 && !isDisabled(down)) return down;
    }
    return index;
  }

  function resolveIndexFromOffset(offsetY: number) {
    const index = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    return Math.max(0, Math.min(data.length - 1, index));
  }

  function handleScrollEnd(offsetY: number) {
    const rawIndex = resolveIndexFromOffset(offsetY);
    const validIndex = nearestEnabledIndex(rawIndex);
    onSelect(validIndex);
    if (validIndex !== rawIndex) {
      scrollRef.current?.scrollTo({ y: validIndex * WHEEL_ITEM_HEIGHT, animated: true });
    }
  }

  function handleTapItem(index: number) {
    if (isDisabled(index)) return;
    onSelect(index);
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: true });
  }

  return (
    <View style={styles.wheelContainer}>
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => handleScrollEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => handleScrollEnd(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}>
        {data.map((label, index) => {
          const disabled = isDisabled(index);
          return (
            <TouchableOpacity
              key={`${label}-${index}`}
              style={styles.wheelItem}
              activeOpacity={0.6}
              disabled={disabled}
              onPress={() => handleTapItem(index)}>
              <Text
                style={[
                  styles.wheelItemText,
                  index === selectedIndex && styles.wheelItemTextActive,
                  disabled && styles.wheelItemTextDisabled,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheelContainer: {
    height: WHEEL_CONTAINER_HEIGHT,
    width: 90,
    overflow: 'hidden',
    position: 'relative',
  },
  wheelHighlight: {
    position: 'absolute',
    top: WHEEL_PADDING,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: 'rgba(193, 18, 31, 0.08)',
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    color: '#5A5A5A',
    fontSize: 18,
    fontWeight: '500',
  },
  wheelItemTextActive: {
    color: '#F5F5F5',
    fontSize: 22,
    fontWeight: '800',
  },
  wheelItemTextDisabled: {
    color: '#3A3A3A',
  },
});
