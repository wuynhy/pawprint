import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatReportDate, methodLabels } from '@/components/ReportView';
import { Card, colors, ErrorText, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { confirmDeleteReport } from '@/lib/reports';

function breedSummary(report) {
  return report.breed_breakdown.map((b) => `${b.breed} ${b.percent}%`).join(' · ');
}

export default function ReportHistory() {
  const { id } = useLocalSearchParams();
  const petId = Number(id);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  // Reload on focus so a report deleted from its detail screen disappears here too.
  useFocusEffect(
    useCallback(() => {
      api.listReports(petId).then(setReports, (e) => setError(e.message));
    }, [petId]),
  );

  async function remove(report) {
    setError(null);
    try {
      if (await confirmDeleteReport(petId, report)) {
        setReports((list) => list.filter((r) => r.id !== report.id));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  if (reports === null) {
    return <Screen>{error ? <ErrorText message={error} /> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Text style={styles.muted}>
        Every analysis is saved here. Tap a report to view it; the newest one is shown on the pet’s page.
      </Text>
      <ErrorText message={error} />
      {reports.length === 0 && <Text style={styles.muted}>No reports yet.</Text>}

      {reports.map((report, index) => (
        <Card
          key={report.id}
          onPress={() =>
            router.push({ pathname: '/pet/[id]/report/[reportId]', params: { id: petId, reportId: report.id } })
          }
          style={{ gap: 4 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontWeight: '600', flex: 1 }}>{formatReportDate(report.created_at, { withTime: true })}</Text>
            {index === 0 && (
              <Text
                style={{
                  fontSize: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 6,
                  overflow: 'hidden',
                  backgroundColor: colors.inputBg,
                }}
              >
                Latest
              </Text>
            )}
          </View>
          <Text style={styles.muted}>{methodLabels[report.input_method] ?? report.input_method}</Text>
          <Text numberOfLines={2}>{breedSummary(report)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={[styles.muted, { flex: 1, fontSize: 12 }]}>
              {report.timeline.length} health {report.timeline.length === 1 ? 'risk' : 'risks'}
            </Text>
            <Pressable
              onPress={() => remove(report)}
              accessibilityRole="button"
              accessibilityLabel={`Delete report from ${formatReportDate(report.created_at)}`}
              hitSlop={10}
            >
              <Text style={{ color: colors.danger, fontWeight: '500' }}>Delete</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
