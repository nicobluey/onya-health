function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value, maxChars = 86) {
  const text = String(value || '').trim();
  if (!text) return [''];

  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function pushWrapped(lines, label, value) {
  const wrapped = wrapText(value);
  if (!wrapped.length) {
    lines.push(`${label} `);
    return;
  }
  lines.push(`${label}${wrapped[0]}`);
  for (const continuation of wrapped.slice(1)) {
    lines.push(`  ${continuation}`);
  }
}

function buildPdfFromLines(lines) {
  let y = 760;
  const lineGap = 18;

  const contentCommands = ['BT', '/F1 12 Tf'];
  for (const line of lines) {
    contentCommands.push(`1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`);
    y -= lineGap;
  }
  contentCommands.push('ET');

  const contentStream = contentCommands.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let output = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((objectContent, index) => {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${index + 1} 0 obj\n${objectContent}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}

function normalizeVerificationCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function fallbackVerificationCode(certificateId) {
  const normalizedId = normalizeVerificationCode(certificateId);
  const suffix = (normalizedId.slice(-8) || '00000000').padStart(8, '0').slice(-8);
  return `ONYA${suffix}`;
}

export function buildCertificatePdf(certificate, options = {}) {
  const data = certificate.certificateDraft || {};
  const doctorName = options.doctorName || certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor';
  const doctorNotes = options.doctorNotes ?? certificate?.decision?.notes ?? '';
  const providerType = String(
    options.providerType || certificate?.decision?.providerType || ''
  ).trim();
  const registrationNumber = String(
    options.registrationNumber || certificate?.decision?.registrationNumber || ''
  )
    .trim()
    .toUpperCase();
  const verificationCode = normalizeVerificationCode(
    options.verificationCode || certificate?.rawSubmission?.verificationCode
  ) || fallbackVerificationCode(certificate?.id || '');
  const issuedAt = certificate?.decision?.at || certificate?.createdAt || new Date().toISOString();
  const baseUrl = String(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const verifyUrl =
    String(options.verifyUrl || '').trim() ||
    (baseUrl ? `${baseUrl}/verify?code=${encodeURIComponent(verificationCode)}` : '');
  const isPreview = Boolean(options.isPreview);

  const lines = [
    isPreview ? 'Onya Health Medical Certificate (Doctor Preview)' : 'Onya Health Medical Certificate',
    '------------------------------------------------------------',
    `Certificate ID: ${certificate.id || '-'}`,
    `Verification Code: ${verificationCode}`,
    verifyUrl ? `Verify Online: ${verifyUrl}` : `Verify Online: /verify (code: ${verificationCode})`,
    `Issued At: ${new Date(issuedAt).toLocaleString()}`,
    '',
    'Patient Details',
    '------------------------------------------------------------',
    `Patient Name: ${data.fullName || 'Not provided'}`,
    `Date of Birth: ${data.dob || 'Not provided'}`,
    `Purpose: ${data.purpose || 'Not provided'}`,
    `Primary Symptom: ${data.symptom || 'Not provided'}`,
    `Certificate Start Date: ${data.startDate || 'Not provided'}`,
    `Duration: ${Number(data.durationDays || 1)} day(s)`,
    '',
    'Clinical Summary',
    '------------------------------------------------------------',
    '',
    'Doctor Verification',
    '------------------------------------------------------------',
    `Reviewed By: ${doctorName}`,
    `Provider Type: ${providerType || 'Not provided'}`,
    `Registration Number: ${registrationNumber || 'Not provided'}`,
    `Risk Level: ${String(certificate?.risk?.level || '').toUpperCase()} (${certificate?.risk?.score ?? 0})`,
    '',
    'Doctor Notes',
    '------------------------------------------------------------',
    '',
    'This certificate was reviewed by an Onya Health doctor.',
  ];

  pushWrapped(lines, '', data.description || 'No summary provided.');
  lines.push('');
  pushWrapped(lines, '', doctorNotes || 'No additional doctor notes.');

  return buildPdfFromLines(lines);
}
