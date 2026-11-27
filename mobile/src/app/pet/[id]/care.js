import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Button, colors, ErrorText, Field, Screen, Segmented, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { careKinds, careKindLabels, isFuture, parseCareDate, toCareDate } from '@/lib/care';

// Add a care log entry, or edit one when an eventId is passed.
export default function CareEntry() {
  const { id, eventId } = useLocalSearchParams();
  const petId = Number(id);
  const editing = eventId !== undefined;

  const [loaded, setLoaded] = useState(!editing);
  const [kind, setKind] = useState('checkup');
  const [title, setTitle] = useState(careKindLabels.checkup);
  const [date, setDate] = useState(new Date());
  const [status, setStatus] = useState('completed');
  const [statusTouched, setStatusTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.listCare(petId).then(
      (events) => {
        const event = events.find((e) => e.id === Number(eventId));
        if (!event) return setError('This care entry no longer exists.');
        setKind(event.kind);
        setTitle(event.title);
        setDate(parseCareDate(event.date));
        setStatus(event.status);
        setStatusTouched(true);
        setNotes(event.notes);
        setLoaded(true);
      },
      (e) => setError(e.message),
    );
  }, [editing, eventId, petId]);

  function pickKind(next) {
    // Keep a custom title; otherwise follow the chosen type.
    if (!title.trim() || title === careKindLabels[kind]) setTitle(careKindLabels[next]);
    setKind(next);
  }

  function pickDate(next) {
    setDate(next);
    // Future dates are usually appointments still to come, unless the user chose otherwise.
    if (!statusTouched) setStatus(isFuture(next) ? 'upcoming' : 'completed');
  }

  async function save() {
    setError(null);
    setBusy(true);
    const body = { kind, title: title.trim(), date: toCareDate(date), status, notes: notes.trim() };
    try {
      if (editing) await api.updateCare(petId, Number(eventId), body);
      else await api.addCare(petId, body);
      router.back();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this entry?', `${title} will be removed from the care log.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteCare(petId, Number(eventId));
            router.back();
          } catch (e) {
            setError(e.message);
          }
        },
      },
    ]);
  }

  if (!loaded) {
    return <Screen>{error ? <ErrorText message={error} /> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Edit Care Entry' : 'Add Care Entry' }} />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {careKinds.map((k) => {
            const selected = k.kind === kind;
            return (
              <Pressable
                key={k.kind}
                onPress={() => pickKind(k.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.bg,
                }}
              >
                <Text style={{ color: selected ? '#fff' : colors.text }}>
                  {k.icon} {k.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annual checkup" maxLength={80} />
      <DateField label="Date" value={date} onChange={pickDate} />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Status</Text>
        <Segmented
          options={[
            { value: 'completed', label: 'Completed' },
            { value: 'upcoming', label: 'Upcoming' },
          ]}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setStatusTouched(true);
          }}
        />
      </View>

      <Field
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Rabies booster, next due in 1 year"
        multiline
        maxLength={1000}
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
      />

      <ErrorText message={error} />
      <Button title={editing ? 'Save Changes' : 'Add to Care Log'} onPress={save} loading={busy} disabled={!title.trim()} />
      {editing && <Button title="Delete Entry" variant="danger" onPress={confirmDelete} />}
    </Screen>
  );
}
