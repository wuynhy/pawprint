import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ExistingPetCard, useExistingPet } from '@/components/ExistingPet';
import { Button, colors, ErrorText, Field, Notice, Screen, Segmented, styles } from '@/components/ui';
import { api } from '@/lib/api';

export default function AddManual() {
  const existing = useExistingPet();
  const [name, setName] = useState('');
  const [chosenSpecies, setSpecies] = useState('dog');
  // An existing pet's species is fixed; otherwise it's what the user picks.
  const species = existing.pet?.species ?? chosenSpecies;
  const [age, setAge] = useState('');
  const [breeds, setBreeds] = useState(null);
  const [breedId, setBreedId] = useState(null);
  const [otherBreed, setOtherBreed] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    let current = true; // ignore a slow response if the user switched species again
    api.listBreeds(species).then(
      (list) => current && setBreeds(list),
      (e) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [species]);

  function changeSpecies(next) {
    setSpecies(next);
    setBreeds(null);
    setBreedId(null);
    setOtherBreed('');
  }

  // Choosing a listed breed and typing one are mutually exclusive.
  function pickBreed(id) {
    setBreedId(id);
    setOtherBreed('');
  }

  function typeBreed(text) {
    setOtherBreed(text);
    if (text.trim()) setBreedId(null);
  }

  const typedBreed = otherBreed.trim();

  // Say why Continue is disabled; the Pet Name field can be scrolled out of view.
  let missing = null;
  if (!existing.isExisting && !name.trim()) missing = 'Enter a pet name at the top to continue.';
  else if (breedId === null && !typedBreed) missing = 'Pick a breed or type one to continue.';

  async function submit() {
    setError(null);
    const ageYears = age.trim() ? Number(age) : null;
    if (ageYears !== null && (Number.isNaN(ageYears) || ageYears < 0 || ageYears > 40)) {
      return setError('Age must be a number of years between 0 and 40.');
    }
    setBusy(true);
    let createdId = null;
    try {
      let petId = existing.pet?.id;
      if (!existing.isExisting) {
        petId = createdId = (await api.createPet({ name: name.trim(), species, age_years: ageYears })).id;
      }
      await api.analyzeManual(petId, breedId !== null ? { breedId } : { breedName: typedBreed });
      // Back to the existing pet's page (it reloads), or on to the new pet's page.
      if (existing.isExisting) router.back();
      else router.replace({ pathname: '/pet/[id]', params: { id: petId } });
    } catch (e) {
      // Don't leave a half-created pet behind if the analysis step failed.
      if (createdId !== null) await api.deletePet(createdId).catch(() => {});
      setError(e.message);
      setBusy(false);
    }
  }

  if (existing.isExisting && !existing.pet) {
    return <Screen>{existing.error ? <ErrorText message={existing.error} /> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      {existing.pet ? (
        <ExistingPetCard pet={existing.pet} />
      ) : (
        <>
          <Field label="Pet Name" value={name} onChangeText={setName} placeholder="e.g. Buddy" />

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Species</Text>
            <Segmented
              options={[
                { value: 'dog', label: 'Dog' },
                { value: 'cat', label: 'Cat' },
              ]}
              value={species}
              onChange={changeSpecies}
            />
          </View>
        </>
      )}

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Breed</Text>
        {breeds === null ? (
          <ActivityIndicator />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {breeds.map((b) => {
              const selected = b.id === breedId;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => pickBreed(b.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : colors.bg,
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : colors.text }}>{b.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Field
        label="Breed not listed? Type it"
        value={otherBreed}
        onChangeText={typeBreed}
        placeholder={species === 'dog' ? 'e.g. Shiba Inu' : 'e.g. Bengal'}
        autoCapitalize="words"
      />

      {!existing.isExisting && (
        <Field label="Age (optional)" value={age} onChangeText={setAge} placeholder="Years" keyboardType="decimal-pad" />
      )}

      <Notice>Health insights based on breed data may not be accurate without DNA testing.</Notice>
      {busy && breedId === null && (
        <Text style={styles.muted}>Looking up {typedBreed}… this can take a few seconds the first time.</Text>
      )}
      <ErrorText message={error} />
      {missing && <Text style={[styles.muted, { textAlign: 'center' }]}>{missing}</Text>}
      <Button title="Continue" onPress={submit} loading={busy} disabled={missing !== null} />
    </Screen>
  );
}
