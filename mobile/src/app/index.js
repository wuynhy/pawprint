import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PawIcon } from '@/components/PawIcon';
import { PetAvatar } from '@/components/PetAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import { Card, colors, ErrorText, SectionTitle, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const inputMethods = [
  { icon: '🖼', title: 'Photo Analysis', subtitle: 'AI breed estimation', ready: true, href: '/add-photo' },
  { icon: '✎', title: 'Manual Entry', subtitle: 'Enter breed manually', ready: true, href: '/add-manual' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [pets, setPets] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setPets(await api.listPets());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Reload whenever the dashboard comes back into view, e.g. after adding or deleting a pet.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PawIcon size={28} />
            <Text style={{ fontSize: 17, fontWeight: '600' }}>PawPrint DNA</Text>
          </View>
          <Pressable
            onPress={() => router.push('/account')}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            hitSlop={8}
          >
            <UserAvatar user={user} size={36} />
          </Pressable>
        </View>

        <Text style={[styles.title, { marginTop: 12 }]}>My Pets</Text>
        <Text style={styles.muted}>Manage DNA profiles</Text>

        <SectionTitle>New Profile</SectionTitle>
        {inputMethods.map((m) => (
          <Card
            key={m.title}
            onPress={m.href ? () => router.push(m.href) : undefined}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: m.ready ? 1 : 0.5 }}
          >
            <Text style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{m.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{m.title}</Text>
              <Text style={styles.muted}>{m.ready ? m.subtitle : 'Coming soon'}</Text>
            </View>
            {m.ready && <Text style={styles.muted}>›</Text>}
          </Card>
        ))}

        <SectionTitle>Your Pets</SectionTitle>
        <ErrorText message={error} />
        {pets?.length === 0 && <Text style={styles.muted}>No pets yet. Add one above to get started.</Text>}
        {pets?.map((pet) => (
          <Card
            key={pet.id}
            onPress={() => router.push({ pathname: '/pet/[id]', params: { id: pet.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <PetAvatar pet={pet} size={40} radius={20} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{pet.name}</Text>
              <Text style={styles.muted}>{pet.latest_report?.breed_breakdown[0]?.breed ?? 'No analysis yet'}</Text>
            </View>
            <Text style={styles.muted}>›</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
