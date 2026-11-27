import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { Button, colors, ErrorText, Field, Screen, SectionTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showPhotoMenu } from '@/lib/photoPicker';

export default function Account() {
  const { user, setUser, signIn, signOut } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  async function run(kind, action) {
    setError(null);
    setMessage(null);
    setBusy(kind);
    try {
      setMessage(await action());
    } catch (e) {
      setError(e.message);
    }
    setBusy(null);
  }

  const saveProfile = () =>
    run('profile', async () => {
      setUser(await api.updateMe({ first_name: firstName.trim(), last_name: lastName.trim() }));
      return 'Profile saved.';
    });

  const changePassword = () =>
    run('password', async () => {
      const { access_token } = await api.changePassword(currentPassword, newPassword);
      await signIn(access_token);
      setCurrentPassword('');
      setNewPassword('');
      return 'Password changed.';
    });

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, pets, and all reports. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount();
              await signOut();
            } catch (e) {
              setError(e.message);
            }
          },
        },
      ],
    );
  }

  function changeAvatar() {
    showPhotoMenu({
      title: 'Profile Picture',
      hasPhoto: Boolean(user?.avatar_url),
      onPicked: (asset) => run('avatar', async () => setUser(await api.uploadAvatar(asset))),
      onRemove: () => run('avatar', async () => setUser(await api.removeAvatar())),
      onError: setError,
    });
  }

  return (
    <Screen>
      {/* Profile picture with a "Change Photo" button, as in the Edit Profile design. */}
      <View style={{ alignItems: 'center', gap: 10, marginVertical: 4 }}>
        <Pressable
          onPress={changeAvatar}
          disabled={busy === 'avatar'}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          <UserAvatar user={user} size={96} />
          {busy === 'avatar' && (
            <ActivityIndicator style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
          )}
        </Pressable>
        <Pressable
          onPress={changeAvatar}
          disabled={busy === 'avatar'}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 13 }}>🖼</Text>
          <Text style={{ fontSize: 13, fontWeight: '500' }}>
            {user?.avatar_url ? 'Change Photo' : 'Add Photo'}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="First Name" value={firstName} onChangeText={setFirstName} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last Name" value={lastName} onChangeText={setLastName} />
        </View>
      </View>
      <Field label="Email Address" value={user?.email} editable={false} />
      <Button
        title="Save Changes"
        onPress={saveProfile}
        loading={busy === 'profile'}
        disabled={!firstName.trim() || !lastName.trim()}
      />

      <SectionTitle>Security</SectionTitle>
      <Field label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <Field
        label="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        placeholder="At least 8 characters"
      />
      <Button
        title="Change Password"
        variant="secondary"
        onPress={changePassword}
        loading={busy === 'password'}
        disabled={!currentPassword || newPassword.length < 8}
      />

      {message && <Text>{message}</Text>}
      <ErrorText message={error} />

      <SectionTitle>Account</SectionTitle>
      <Button title="Log Out" variant="secondary" onPress={signOut} />
      <Button title="Delete Account" variant="danger" onPress={confirmDeleteAccount} />
    </Screen>
  );
}
