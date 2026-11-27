import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { formatReportDate, methodLabels, ReportView } from '@/components/ReportView';
import { Button, ErrorText, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { shareReportPdf } from '@/lib/pdf';
import { confirmDeleteReport } from '@/lib/reports';

// One saved report, opened from Report History.
export default function SavedReport() {
  const { id, reportId } = useLocalSearchParams();
  const petId = Number(id);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function savePdf() {
    setError(null);
    setPdfBusy(true);
    try {
      const [pet, careEvents] = await Promise.all([api.getPet(petId), api.listCare(petId)]);
      await shareReportPdf({ pet, report, careEvents });
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    api.getReport(petId, Number(reportId)).then(setReport, (e) => setError(e.message));
  }, [petId, reportId]);

  async function remove() {
    setError(null);
    try {
      if (await confirmDeleteReport(petId, report)) router.back();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!report) {
    return <Screen>{error ? <ErrorText message={error} /> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: formatReportDate(report.created_at) }} />
      <Text style={styles.muted}>
        {methodLabels[report.input_method] ?? report.input_method} ·{' '}
        {formatReportDate(report.created_at, { withTime: true })}
      </Text>

      <ReportView report={report} />

      <ErrorText message={error} />
      <Button title="Save Report as PDF" variant="secondary" onPress={savePdf} loading={pdfBusy} />
      <Button title="Delete Report" variant="danger" onPress={remove} />
    </Screen>
  );
}
