import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { Button, ErrorText, Field, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';

// Edit a pet's name and age. Species can't change, since reports are species-specific.
export default function EditPet() {
  const { id } = useLocalSearchParams();
  const petId = Number(id);
  const [pet, setPet] = useState(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPet(petId).then(
      (p) => {
        setPet(p);
        setName(p.name);
        setAge(p.age_years === null ? '' : String(p.age_years));
      },
      (e) => setError(e.message),
    );
  }, [petId]);

  async function save() {
    setError(null);
    const ageYears = age.trim() ? Number(age.replace(',', '.')) : null;
    if (ageYears !== null && (Number.isNaN(ageYears) || ageYears < 0 || ageYears > 40)) {
      return setError('Age must be a number of years between 0 and 40.');
    }
    setBusy(true);
    try {
      await api.updatePet(petId, { name: name.trim(), age_years: ageYears });
      router.back(); // the pet page reloads when it comes back into view
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!pet) {
    return <Screen>{error ? <ErrorText message={error} /> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Field label="Pet Name" value={name} onChangeText={setName} placeholder="e.g. Buddy" maxLength={80} />
      <Field
        label="Age (optional)"
        value={age}
        onChangeText={setAge}
        placeholder="Years, e.g. 2 or 0.5"
        keyboardType="decimal-pad"
      />
      <Text style={styles.muted}>
        Species: {pet.species === 'dog' ? 'Dog' : 'Cat'}. To change the breed, use Run New Analysis on the pet’s page.
      </Text>
      <ErrorText message={error} />
      <Button title="Save Changes" onPress={save} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
