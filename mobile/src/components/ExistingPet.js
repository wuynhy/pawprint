import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PetAvatar } from '@/components/PetAvatar';
import { Card, styles } from '@/components/ui';
import { api } from '@/lib/api';

// Manual Entry and Photo Analysis create a new pet, unless opened from a pet's page with
// ?petId=..., in which case the new report is added to that pet ("Run New Analysis").
export function useExistingPet() {
  const { petId } = useLocalSearchParams();
  const id = petId ? Number(petId) : null;
  const [pet, setPet] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id !== null) api.getPet(id).then(setPet, (e) => setError(e.message));
  }, [id]);

  return { isExisting: id !== null, pet, error };
}

// Shown in place of the name/species/age fields when analyzing an existing pet.
export function ExistingPetCard({ pet }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <PetAvatar pet={pet} size={48} radius={12} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600' }}>New report for {pet.name}</Text>
        <Text style={styles.muted}>
          {pet.species === 'dog' ? 'Dog' : 'Cat'} · Earlier reports stay in Report History.
        </Text>
      </View>
    </Card>
  );
}
