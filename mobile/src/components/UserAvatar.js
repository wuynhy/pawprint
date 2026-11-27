import { Image, Text, View } from 'react-native';

import { colors } from '@/components/ui';
import { API_URL, authHeaders } from '@/lib/api';

// The user's profile picture, or their first initial when they haven't added one.
export function UserAvatar({ user, size = 36 }) {
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (user?.avatar_url) {
    return (
      <View style={box}>
        <Image
          source={{ uri: `${API_URL}${user.avatar_url}`, headers: authHeaders() }}
          style={{ width: size, height: size }}
          accessibilityLabel="Your profile picture"
        />
      </View>
    );
  }

  return (
    <View style={box}>
      <Text style={{ fontWeight: '600', fontSize: size * 0.42 }}>{user?.first_name?.[0]?.toUpperCase()}</Text>
    </View>
  );
}
