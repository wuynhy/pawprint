import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';

import { ExistingPetCard, useExistingPet } from '@/components/ExistingPet';
import { Button, colors, ErrorText, Field, Notice, Screen, Segmented, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { pickImages } from '@/lib/photoPicker';

const MAX_PHOTOS = 3;

export default function AddPhoto() {
  const existing = useExistingPet();
  const [name, setName] = useState('');
  const [chosenSpecies, setSpecies] = useState('dog');
  // An existing pet's species is fixed; otherwise it's what the user picks.
  const species = existing.pet?.species ?? chosenSpecies;
  const [age, setAge] = useState('');
  const [photos, setPhotos] = useState([]);
  const [knownBreed, setKnownBreed] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);


  const room = MAX_PHOTOS - photos.length;

  async function addPhotos(source) {
    setError(null);
    try {
      const picked = await pickImages(source, { limit: room });
      setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e.message);
    }
  }

  function choosePhotos() {
    Alert.alert('Add photos', `Add up to ${room} more. Clear photos of the face and side work best.`, [
      { text: 'Take Photo', onPress: () => addPhotos('camera') },
      { text: 'Choose from Library', onPress: () => addPhotos('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

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
      await api.analyzePhoto(petId, photos, knownBreed.trim());
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

  // Say why Continue is disabled; the Pet Name field can be scrolled out of view.
  let missing = null;
  if (!existing.isExisting && !name.trim()) missing = 'Enter a pet name at the top to continue.';
  else if (photos.length === 0) missing = 'Add at least one photo to continue.';

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
              onChange={setSpecies}
            />
          </View>
        </>
      )}

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Pet Photos</Text>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <View key={p.uri}>
              <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: 12 }} />
              <Pressable
                onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>✕</Text>
              </Pressable>
            </View>
          ))}
          {room > 0 && (
            <Pressable
              onPress={choosePhotos}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              style={({ pressed }) => ({
                width: photos.length ? 96 : '100%',
                height: 96,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 22 }}>🖼</Text>
              <Text style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>
                {photos.length ? 'Add more' : `Upload 1–${MAX_PHOTOS} clear photos\nFront and side view recommended`}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Field
        label="Known Breed (optional)"
        value={knownBreed}
        onChangeText={setKnownBreed}
        placeholder={species === 'dog' ? 'e.g. Labrador mix' : 'e.g. Siamese'}
        autoCapitalize="words"
      />
      {!existing.isExisting && (
        <Field label="Age (optional)" value={age} onChangeText={setAge} placeholder="Years" keyboardType="decimal-pad" />
      )}

      <Notice>Health insights and breed estimates based on photos may not be accurate without DNA testing.</Notice>
      {busy && (
        <Text style={styles.muted}>Analyzing photos… this can take up to a minute for a mixed breed.</Text>
      )}
      <ErrorText message={error} />
      {missing && <Text style={[styles.muted, { textAlign: 'center' }]}>{missing}</Text>}
      <Button title="Continue" onPress={submit} loading={busy} disabled={missing !== null} />
    </Screen>
  );
}
