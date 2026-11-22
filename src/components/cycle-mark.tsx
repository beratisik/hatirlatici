import { View } from 'react-native';

/** İçi boş daire, ortada adet damlası. Emoji fontuna bağlı değil. */
export function CycleMark({
  size = 22,
  color = '#C1121F',
}: {
  size?: number;
  color?: string;
}) {
  const ring = Math.max(1.5, size * 0.08);
  const drop = Math.max(6, Math.round(size * 0.34));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: drop,
          height: drop,
          backgroundColor: color,
          borderTopLeftRadius: drop,
          borderTopRightRadius: drop / 5,
          borderBottomLeftRadius: drop / 5,
          borderBottomRightRadius: drop,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}
