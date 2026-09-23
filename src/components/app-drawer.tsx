import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DrawerAction = {
  id: string;
  icon: string;
  label: string;
  hint: string;
  accent: string;
  onPress: () => void;
};

/**
 * Ekranın solundan kaydırarak ya da hamburger ikonuyla açılan ekleme menüsü.
 * İçerideki kart swipe'larıyla çakışmaması için yalnızca kenar sürüklemesi açar.
 */
export function AppDrawer({
  open,
  onOpen,
  onClose,
  actions,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  actions: DrawerAction[];
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Drawer
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      drawerType="front"
      drawerPosition="left"
      swipeEdgeWidth={44}
      drawerStyle={styles.drawer}
      overlayStyle={styles.overlay}
      renderDrawerContent={() => (
        <View style={[styles.content, { paddingTop: insets.top + 28 }]}>
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>HATIRLATICI</Text>
            <Text style={styles.brandSubtitle}>Ne eklemek istiyorsun?</Text>
          </View>

          <View style={styles.actions}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.action}
                activeOpacity={0.8}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}>
                <View style={[styles.actionIcon, { borderColor: action.accent }]}>
                  <Text style={styles.actionIconGlyph}>{action.icon}</Text>
                </View>
                <View style={styles.actionText}>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionHint}>{action.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.footnote, { paddingBottom: insets.bottom + 20 }]}>
            Menüyü ekranın solundan kaydırarak da açabilirsin.
          </Text>
        </View>
      )}>
      {children}
    </Drawer>
  );
}

export function DrawerToggleButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.toggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Menüyü aç"
      onPress={onPress}>
      <View style={styles.toggleBar} />
      <View style={styles.toggleBar} />
      <View style={[styles.toggleBar, styles.toggleBarShort]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  drawer: {
    width: 292,
    backgroundColor: '#0B0B0B',
    borderRightWidth: 1,
    borderRightColor: '#1F1F1F',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  brand: {
    gap: 4,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  brandTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandSubtitle: {
    color: '#6B6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flex: 1,
    paddingTop: 20,
    gap: 10,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#0B0B0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconGlyph: {
    fontSize: 18,
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    color: '#F2F2F2',
    fontSize: 15,
    fontWeight: '800',
  },
  actionHint: {
    color: '#6B6B6B',
    fontSize: 12,
    lineHeight: 16,
  },
  footnote: {
    color: '#4A4A4A',
    fontSize: 11,
    lineHeight: 16,
  },
  toggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toggleBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#E4E4E4',
  },
  toggleBarShort: {
    width: 10,
    alignSelf: 'center',
    marginLeft: -6,
  },
});
