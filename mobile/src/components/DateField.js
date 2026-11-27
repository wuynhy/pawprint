import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';

import { styles } from '@/components/ui';

// A date-only input. iOS shows the native compact picker inline; Android opens the calendar dialog.
export function DateField({ label, value, onChange }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start' }}>
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            onChange={(event, date) => event.type === 'set' && date && onChange(date)}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value.toLocaleDateString()}`}
          onPress={() =>
            DateTimePickerAndroid.open({
              value,
              mode: 'date',
              onChange: (event, date) => event.type === 'set' && date && onChange(date),
            })
          }
          style={styles.input}
        >
          <Text>{value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </Pressable>
      )}
    </View>
  );
}
