import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type PasswordFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export function PasswordField({
  value,
  onChangeText,
  placeholder,
  style,
  containerStyle,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6B6B6B"
        style={[styles.input, style]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.toggle}
        activeOpacity={0.7}
        onPress={() => setVisible((prev) => !prev)}
        accessibilityLabel={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}>
        <Text style={styles.toggleLabel}>{visible ? '🙈' : '👁'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingRight: 52,
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
  },
  toggle: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 18,
  },
});
