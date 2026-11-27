import { Text, View } from 'react-native';

import { PawIcon } from './PawIcon';
import { colors } from './ui';

export function Logo() {
  return (
    <View style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <PawIcon size={56} />
      <Text style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>PawPrint DNA</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Your pet’s DNA insights</Text>
    </View>
  );
}
