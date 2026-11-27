import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card, SectionTitle, severityColors, styles } from '@/components/ui';

const stageLabels = {
  young: 'Young (under 1 year)',
  adult: 'Adult (1–7 years)',
  senior: 'Senior (7+ years)',
};

export const methodLabels = { manual: 'Manual entry', photo: 'Photo analysis' };

// Report timestamps come from the server in UTC; older rows may lack the "Z" suffix.
export function formatReportDate(iso, { withTime = false } = {}) {
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

function ageRange(item) {
  return item.onset_max_years === null
    ? `${item.onset_min_years}+ years`
    : `${item.onset_min_years}–${item.onset_max_years} years`;
}

function RiskItem({ item }) {
  const [open, setOpen] = useState(false);
  const sev = severityColors[item.severity];
  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '600', flex: 1 }}>{item.condition}</Text>
        <Text
          style={{
            backgroundColor: sev.bg,
            color: sev.text,
            fontSize: 12,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {item.severity[0].toUpperCase() + item.severity.slice(1)}
        </Text>
      </View>
      <Text style={styles.muted}>Age range: {ageRange(item)}</Text>
      {open && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text>{item.description}</Text>
          <Text style={{ fontWeight: '600' }}>Signs to watch for</Text>
          {item.symptoms.map((s) => (
            <Text key={s}>• {s}</Text>
          ))}
          <Text style={{ fontWeight: '600' }}>Preventive care</Text>
          {item.prevention.map((p) => (
            <Text key={p}>• {p}</Text>
          ))}
          {item.from_breeds.length > 1 && <Text style={styles.muted}>Linked to: {item.from_breeds.join(', ')}</Text>}
          {item.ai_generated && (
            <Text style={[styles.muted, { fontSize: 12 }]}>
              AI-generated breed information. Confirm with your vet.
            </Text>
          )}
        </View>
      )}
      {!open && <Text style={[styles.muted, { fontSize: 12 }]}>Tap for details</Text>}
    </Card>
  );
}

// Breed breakdown + health risk timeline for one report. Used for the latest report on the pet
// page and for older reports opened from Report History.
export function ReportView({ report }) {
  const stages = ['young', 'adult', 'senior']
    .map((stage) => ({ stage, items: report.timeline.filter((t) => t.life_stage === stage) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <SectionTitle>Breed Breakdown</SectionTitle>
      <Card>
        {report.breed_breakdown.map((b) => (
          <View key={b.breed} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>{b.breed}</Text>
            <Text style={{ fontWeight: '600' }}>{b.percent}%</Text>
          </View>
        ))}
        {report.input_method === 'photo' && (
          <Text style={[styles.muted, { fontSize: 12, marginTop: 4 }]}>
            Estimated by AI from photos. Percentages show how confident the estimate is, not a DNA result.
          </Text>
        )}
      </Card>

      <SectionTitle>Health Risk Timeline</SectionTitle>
      {stages.length === 0 && <Text style={styles.muted}>No known breed-specific risks for this breed.</Text>}
      {stages.map(({ stage, items }) => (
        <View key={stage} style={{ gap: 8 }}>
          <Text style={{ fontWeight: '600', marginTop: 4 }}>{stageLabels[stage]}</Text>
          {items.map((item) => (
            <RiskItem key={item.condition} item={item} />
          ))}
        </View>
      ))}

      <Text style={[styles.muted, { fontSize: 12 }]}>
        This report is for information only and is not veterinary advice. Talk to your vet about your pet’s care.
      </Text>
    </>
  );
}
