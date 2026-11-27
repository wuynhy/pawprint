import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card, SectionTitle, styles } from '@/components/ui';
import { careKindIcons, formatCareDate } from '@/lib/care';

const statusColors = {
  completed: { bg: '#ECFDF3', text: '#067647' },
  upcoming: { bg: '#FFF4E5', text: '#B54708' },
};

// The pet's care log (checkups, vaccinations, ...): upcoming entries first, then past ones.
export function CareLog({ petId, events }) {
  const sorted = [...events].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'upcoming' ? -1 : 1;
    // Upcoming: soonest first. Completed: most recent first.
    return a.status === 'upcoming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <SectionTitle>Care Log</SectionTitle>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/pet/[id]/care', params: { id: petId } })}
          accessibilityRole="button"
          accessibilityLabel="Add care entry"
          hitSlop={10}
        >
          <Text style={{ fontWeight: '600' }}>+ Add</Text>
        </Pressable>
      </View>

      {sorted.length === 0 && (
        <Text style={styles.muted}>Keep track of checkups, vaccinations, blood work and other care here.</Text>
      )}
      {sorted.map((e) => (
        <Card
          key={e.id}
          onPress={() => router.push({ pathname: '/pet/[id]/care', params: { id: petId, eventId: e.id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Text style={{ fontSize: 18 }}>{careKindIcons[e.kind] ?? '📝'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{e.title}</Text>
            <Text style={styles.muted}>{formatCareDate(e.date)}</Text>
            {e.notes ? (
              <Text style={[styles.muted, { fontSize: 12 }]} numberOfLines={1}>
                {e.notes}
              </Text>
            ) : null}
          </View>
          <Text
            style={{
              fontSize: 12,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
              overflow: 'hidden',
              backgroundColor: statusColors[e.status].bg,
              color: statusColors[e.status].text,
            }}
          >
            {e.status}
          </Text>
        </Card>
      ))}
    </>
  );
}
