import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Button, ErrorText, Field, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Step 1: enter your email and we email a 6-digit code.
// Step 2: enter the code and a new password. Success signs you in.
export default function ForgotPassword() {
  const { signIn } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      setMessage((await api.forgotPassword(email.trim())).detail);
      setStep('code');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function resetPassword() {
    setError(null);
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      const { access_token } = await api.resetPassword(email.trim(), code, password);
      await signIn(access_token); // the app switches to the dashboard once signed in
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (step === 'email') {
    return (
      <Screen>
        <Text style={styles.muted}>Enter your account email and we’ll send you a 6-digit code to reset your password.</Text>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <ErrorText message={error} />
        <Button title="Send Code" onPress={sendCode} loading={busy} disabled={!email.trim()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.muted}>
        {message} Check {email.trim()} (and your spam folder). The code expires in 15 minutes.
      </Text>
      <Field
        label="6-digit code"
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
      />
      <Field
        label="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        placeholder="At least 8 characters"
      />
      <Field label="Confirm New Password" value={confirm} onChangeText={setConfirm} secureTextEntry />
      <ErrorText message={error} />
      <Button
        title="Reset Password"
        onPress={resetPassword}
        loading={busy}
        disabled={code.length !== 6 || password.length < 8 || !confirm}
      />
      <Pressable
        onPress={() => {
          setStep('email');
          setCode('');
          setError(null);
        }}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={[styles.muted, { textAlign: 'center' }]}>Didn’t get it? Send a new code</Text>
      </Pressable>
    </Screen>
  );
}
