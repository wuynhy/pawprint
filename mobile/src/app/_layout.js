import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';

function RootStack() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="add-manual" options={{ title: 'Manual Entry' }} />
        <Stack.Screen name="add-photo" options={{ title: 'Photo Analysis' }} />
        <Stack.Screen name="pet/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="pet/[id]/history" options={{ title: 'Report History' }} />
        <Stack.Screen name="pet/[id]/report/[reportId]" options={{ title: 'Report' }} />
        <Stack.Screen name="pet/[id]/care" options={{ title: 'Care Entry' }} />
        <Stack.Screen name="pet/[id]/edit" options={{ title: 'Edit Pet' }} />
        <Stack.Screen name="account" options={{ title: 'Edit Profile' }} />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset Password' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
