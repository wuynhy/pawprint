import { Image, Text, View } from 'react-native';

import { colors } from '@/components/ui';
import { API_URL, authHeaders } from '@/lib/api';

// The pet's photo, or a dog/cat emoji when there isn't one. Photos need the login header,
// since they're only served to the pet's owner.
export function PetAvatar({ pet, size = 64, radius = 14 }) {
  const box = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (pet.photo_url) {
    return (
      <View style={box}>
        <Image
          source={{ uri: `${API_URL}${pet.photo_url}`, headers: authHeaders() }}
          style={{ width: size, height: size }}
          accessibilityLabel={`Photo of ${pet.name}`}
        />
      </View>
    );
  }

  return (
    <View style={box}>
      <Text style={{ fontSize: size / 2 }}>{pet.species === 'dog' ? '🐶' : '🐱'}</Text>
    </View>
  );
}
