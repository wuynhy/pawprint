import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Button, ErrorText, Field, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const { access_token } = await api.login(email.trim(), password);
      await signIn(access_token);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <Logo />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="current-password"
          />
          <ErrorText message={error} />
          <Button title="Sign In" onPress={submit} loading={busy} disabled={!email || !password} />
          <Link href="/forgot-password" style={[styles.muted, { textAlign: 'center' }]}>
            Forgot password?
          </Link>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Don’t have an account?{' '}
            <Link href="/register" style={{ textDecorationLine: 'underline', color: '#111' }}>
              Sign up
            </Link>
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
