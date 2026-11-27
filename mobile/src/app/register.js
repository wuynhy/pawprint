import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Button, ErrorText, Field, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { signIn } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const { access_token } = await api.register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
      });
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
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="First Name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last Name" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
            </View>
          </View>
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
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
          />
          <ErrorText message={error} />
          <Button
            title="Create Account"
            onPress={submit}
            loading={busy}
            disabled={!firstName || !lastName || !email || !password}
          />
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Already have an account?{' '}
            <Link href="/login" style={{ textDecorationLine: 'underline', color: '#111' }}>
              Sign in
            </Link>
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
