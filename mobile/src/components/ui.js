import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export const colors = {
  text: '#111111',
  muted: '#6B7280',
  border: '#E5E7EB',
  inputBg: '#F2F2F4',
  bg: '#FFFFFF',
  primary: '#111111',
  danger: '#DC2626',
  warnBg: '#FFF8E6',
  warnBorder: '#F5D78A',
  warnText: '#8A5A00',
};

export const severityColors = {
  low: { bg: '#ECFDF3', text: '#067647' },
  medium: { bg: '#FFF4E5', text: '#B54708' },
  high: { bg: '#FEF3F2', text: '#B42318' },
};

export function Screen({ children, scroll = true }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      // iOS draws a see-through header over the screen; this pads the content below it
      // (and below the status bar on screens without a header) so nothing is hidden.
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
}

export function Field({ label, ...props }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled }) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonOutline,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? '#fff' : colors.text} />
      ) : (
        <Text
          style={[styles.buttonText, { color: primary ? '#fff' : variant === 'danger' ? colors.danger : colors.text }]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children, onPress, style }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

export function ErrorText({ message }) {
  if (!message) return null;
  return <Text style={{ color: colors.danger }}>{message}</Text>;
}

export function Notice({ children }) {
  return (
    <View style={styles.notice}>
      <Text style={{ color: colors.warnText, fontSize: 13 }}>⚠ {children}</Text>
    </View>
  );
}

export function SectionTitle({ children }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentActive]}
        >
          <Text style={{ fontWeight: o.value === value ? '600' : '400', color: colors.text }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16, backgroundColor: colors.bg, flexGrow: 1 },
  label: { fontSize: 13, fontWeight: '500', color: colors.text },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    backgroundColor: colors.bg,
  },
  notice: {
    backgroundColor: colors.warnBg,
    borderColor: colors.warnBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  section: { fontSize: 13, color: colors.muted, marginTop: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted },
  segmented: { flexDirection: 'row', backgroundColor: colors.inputBg, borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.bg },
});
