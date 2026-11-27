import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatReportDate, methodLabels } from '@/components/ReportView';
import { careKindLabels, formatCareDate } from '@/lib/care';
import { API_URL, authHeaders } from '@/lib/api';

const stageLabels = { young: 'Young (under 1 year)', adult: 'Adult (1–7 years)', senior: 'Senior (7+ years)' };
const severityColors = {
  low: ['#ECFDF3', '#067647'],
  medium: ['#FFF4E5', '#B54708'],
  high: ['#FEF3F2', '#B42318'],
};

// Everything shown in the PDF comes from the user or the AI, so escape it before putting it in HTML.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ageRange(item) {
  return item.onset_max_years === null
    ? `${item.onset_min_years}+ years`
    : `${item.onset_min_years}–${item.onset_max_years} years`;
}

// The PDF is rendered offline, so the pet photo (which needs the login header) is embedded as data.
async function petPhotoDataUri(pet) {
  if (!pet.photo_url) return null;
  try {
    const target = new File(Paths.cache, `pdf-photo-${pet.id}`);
    if (target.exists) target.delete();
    const file = await File.downloadFileAsync(`${API_URL}${pet.photo_url}`, target, { headers: authHeaders() });
    const data = await file.base64();
    file.delete();
    return `data:image/jpeg;base64,${data}`;
  } catch (e) {
    console.warn('Leaving the photo out of the PDF:', e);
    return null;
  }
}

export function buildReportHtml({ pet, report, careEvents, photo }) {
  const breakdown = report.breed_breakdown
    .map((b) => `<tr><td>${esc(b.breed)}</td><td class="num">${esc(b.percent)}%</td></tr>`)
    .join('');

  const stages = ['young', 'adult', 'senior']
    .map((stage) => {
      const items = report.timeline.filter((t) => t.life_stage === stage);
      if (!items.length) return '';
      const risks = items
        .map((item) => {
          const [bg, fg] = severityColors[item.severity] ?? ['#eee', '#333'];
          return `
          <div class="risk">
            <div class="row">
              <strong>${esc(item.condition)}</strong>
              <span class="badge" style="background:${bg};color:${fg}">${esc(item.severity)}</span>
            </div>
            <div class="muted">Typical onset: ${esc(ageRange(item))}${
              item.from_breeds.length > 1 ? ` · Linked to: ${esc(item.from_breeds.join(', '))}` : ''
            }</div>
            <p>${esc(item.description)}</p>
            <div class="cols">
              <div><b>Signs to watch for</b><ul>${item.symptoms.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
              <div><b>Preventive care</b><ul>${item.prevention.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
            </div>
            ${item.ai_generated ? '<div class="muted small">AI-generated breed information. Confirm with your vet.</div>' : ''}
          </div>`;
        })
        .join('');
      return `<h3>${esc(stageLabels[stage])}</h3>${risks}`;
    })
    .join('');

  const care = careEvents.length
    ? `<table>${careEvents
        .map(
          (e) => `<tr>
            <td><strong>${esc(e.title)}</strong><div class="muted small">${esc(careKindLabels[e.kind] ?? e.kind)}${
              e.notes ? ` · ${esc(e.notes)}` : ''
            }</div></td>
            <td class="num">${esc(formatCareDate(e.date))}<div class="small ${e.status}">${esc(e.status)}</div></td>
          </tr>`,
        )
        .join('')}</table>`
    : '<p class="muted">No care entries yet.</p>';

  const age = pet.age_years !== null ? `${esc(pet.age_years)} ${pet.age_years === 1 ? 'year' : 'years'} old · ` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 36px; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 14px 0 6px; }
  .header { display: flex; gap: 16px; align-items: center; }
  .header img { width: 84px; height: 84px; border-radius: 14px; object-fit: cover; }
  .muted { color: #6b7280; } .small { font-size: 10.5px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 6px 0; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .risk { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .badge { font-size: 10px; padding: 2px 8px; border-radius: 6px; text-transform: capitalize; }
  .cols { display: flex; gap: 16px; } .cols > div { flex: 1; } ul { margin: 4px 0 0; padding-left: 16px; }
  p { margin: 6px 0; }
  .completed { color: #067647; } .upcoming { color: #B54708; }
  .footer { margin-top: 24px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head>
<body>
  <div class="header">
    ${photo ? `<img src="${photo}" />` : ''}
    <div>
      <div class="muted small">PawPrint DNA · Pet Health Report</div>
      <h1>${esc(pet.name)}</h1>
      <div class="muted">${age}${pet.species === 'dog' ? 'Dog' : 'Cat'}</div>
      <div class="muted small">${esc(methodLabels[report.input_method] ?? report.input_method)}, ${esc(
        formatReportDate(report.created_at, { withTime: true }),
      )}</div>
    </div>
  </div>

  <h2>Breed Breakdown</h2>
  <table>${breakdown}</table>
  ${
    report.input_method === 'photo'
      ? '<div class="muted small">Estimated by AI from photos. Percentages show how confident the estimate is, not a DNA result.</div>'
      : ''
  }

  <h2>Health Risk Timeline</h2>
  ${stages || '<p class="muted">No known breed-specific risks for this breed.</p>'}

  <h2>Care Log</h2>
  ${care}

  <div class="footer">
    Generated ${esc(new Date().toLocaleDateString())} by PawPrint DNA. This report is for information only and is not
    veterinary advice. Talk to your vet about your pet’s care.
  </div>
</body></html>`;
}

// Builds the PDF and opens the share sheet (Save to Files, AirDrop, Mail, ...).
export async function shareReportPdf({ pet, report, careEvents }) {
  const photo = await petPhotoDataUri(pet);
  const html = buildReportHtml({ pet, report, careEvents, photo });
  const { uri } = await Print.printToFileAsync({ html });

  // Give the file a readable name, e.g. "Mochi Health Report.pdf", instead of a random one.
  let shareUri = uri;
  try {
    const name = `${pet.name.replace(/[^\w\- ]+/g, '').trim() || 'Pet'} Health Report.pdf`;
    const target = new File(Paths.cache, name);
    if (target.exists) target.delete();
    new File(uri).moveSync(target);
    shareUri = target.uri;
  } catch (e) {
    console.warn('Sharing the PDF under its original name:', e);
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing isn’t available on this device.');
  }
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save Report as PDF' });
}
