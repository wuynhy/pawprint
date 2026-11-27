// Care log entry types. Keys match the backend's schemas.CareKind.
export const careKinds = [
  { kind: 'checkup', label: 'Checkup', icon: '🩺' },
  { kind: 'vaccination', label: 'Vaccination', icon: '💉' },
  { kind: 'blood_work', label: 'Blood Work', icon: '🧪' },
  { kind: 'dental', label: 'Dental Cleaning', icon: '🦷' },
  { kind: 'medication', label: 'Medication', icon: '💊' },
  { kind: 'grooming', label: 'Grooming', icon: '✂️' },
  { kind: 'other', label: 'Other', icon: '📝' },
];

export const careKindLabels = Object.fromEntries(careKinds.map((k) => [k.kind, k.label]));
export const careKindIcons = Object.fromEntries(careKinds.map((k) => [k.kind, k.icon]));

// Care dates are calendar dates ("2026-02-10") with no time zone. Build them in local time so the
// day never shifts, as it would with new Date("2026-02-10") (which is read as UTC midnight).
export function parseCareDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toCareDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatCareDate(value) {
  return parseCareDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isFuture(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}
