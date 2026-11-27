import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { CareLog } from '@/components/CareLog';
import { PetAvatar } from '@/components/PetAvatar';
import { formatReportDate, methodLabels, ReportView } from '@/components/ReportView';
import { Button, Card, colors, ErrorText, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { shareReportPdf } from '@/lib/pdf';
import { showPhotoMenu } from '@/lib/photoPicker';

export default function PetReport() {
  const { id } = useLocalSearchParams();
  const [pet, setPet] = useState(null);
  const [error, setError] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [care, setCare] = useState([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function savePdf() {
    setError(null);
    setPdfBusy(true);
    try {
      await shareReportPdf({ pet, report: pet.latest_report, careEvents: care });
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  }

  // Shows a spinner on the photo while the request runs.
  async function withPhotoBusy(request) {
    setError(null);
    setPhotoBusy(true);
    try {
      setPet(await request());
    } finally {
      setPhotoBusy(false);
    }
  }

  function choosePhoto() {
    showPhotoMenu({
      title: `Photo of ${pet.name}`,
      hasPhoto: Boolean(pet.photo_url),
      onPicked: (asset) => withPhotoBusy(() => api.uploadPetPhoto(pet.id, asset)),
      onRemove: () => withPhotoBusy(() => api.removePetPhoto(pet.id)),
      onError: setError,
    });
  }

  // Reload whenever the screen comes back into view, e.g. after deleting a report in Report History
  // or adding a care log entry.
  useFocusEffect(
    useCallback(() => {
      api.getPet(Number(id)).then(setPet, (e) => setError(e.message));
      api.listCare(Number(id)).then(setCare, (e) => setError(e.message));
    }, [id]),
  );

  function runNewAnalysis() {
    const open = (pathname) => () => router.push({ pathname, params: { petId: pet.id } });
    Alert.alert(`New analysis for ${pet.name}`, 'The result is added to this pet. Earlier reports stay in Report History.', [
      { text: 'Photo Analysis', onPress: open('/add-photo') },
      { text: 'Manual Entry', onPress: open('/add-manual') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmDelete() {
    Alert.alert(`Delete ${pet?.name}?`, 'This removes the pet profile, its reports and its care log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePet(Number(id));
            router.back();
          } catch (e) {
            setError(e.message);
          }
        },
      },
    ]);
  }

  if (!pet) {
    return <Screen>{error ? <ErrorText message={error} /> : <ActivityIndicator />}</Screen>;
  }

  const report = pet.latest_report;

  return (
    <Screen>
      <Stack.Screen options={{ title: pet.name }} />

      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable
          onPress={choosePhoto}
          disabled={photoBusy}
          accessibilityRole="button"
          accessibilityLabel={pet.photo_url ? 'Change photo' : 'Add photo'}
          style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: pressed || photoBusy ? 0.6 : 1 })}
        >
          <View>
            <PetAvatar pet={pet} size={88} radius={18} />
            {photoBusy && (
              <ActivityIndicator style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            )}
          </View>
          <Text style={{ fontSize: 12, color: colors.muted }}>{pet.photo_url ? 'Change photo' : 'Add photo'}</Text>
        </Pressable>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '600' }}>{pet.name}</Text>
          <Text style={styles.muted}>{report?.breed_breakdown[0]?.breed ?? 'No analysis yet'}</Text>
          {pet.age_years !== null && (
            <Text style={styles.muted}>
              {pet.age_years} {pet.age_years === 1 ? 'year' : 'years'} old
            </Text>
          )}
        </View>
      </View>

      <Button title={report ? 'Run New Analysis' : 'Run Analysis'} onPress={runNewAnalysis} />

      {report && (
        <>
          <Card
            onPress={() => router.push({ pathname: '/pet/[id]/history', params: { id: pet.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <Text style={{ fontSize: 18 }}>🗂</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>Report History</Text>
              <Text style={styles.muted}>
                Latest: {methodLabels[report.input_method] ?? report.input_method}, {formatReportDate(report.created_at)}
              </Text>
            </View>
            <Text style={styles.muted}>›</Text>
          </Card>

          <ReportView report={report} />
        </>
      )}

      <CareLog petId={pet.id} events={care} />

      <ErrorText message={error} />
      {report && (
        <Button title="Save Report as PDF" variant="secondary" onPress={savePdf} loading={pdfBusy} />
      )}
      {/* Edit + Delete side by side, as in the pet report design. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Edit Pet"
            variant="secondary"
            onPress={() => router.push({ pathname: '/pet/[id]/edit', params: { id: pet.id } })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Delete Pet" variant="danger" onPress={confirmDelete} />
        </View>
      </View>
    </Screen>
  );
}
