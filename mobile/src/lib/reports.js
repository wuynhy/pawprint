import { Alert } from 'react-native';

import { formatReportDate, methodLabels } from '@/components/ReportView';
import { api } from '@/lib/api';

// Asks before deleting; resolves true if the report was deleted.
export function confirmDeleteReport(petId, report) {
  return new Promise((resolve, reject) => {
    Alert.alert(
      'Delete this report?',
      `${methodLabels[report.input_method] ?? 'Report'} from ${formatReportDate(report.created_at)}. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => api.deleteReport(petId, report.id).then(() => resolve(true), reject),
        },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}
