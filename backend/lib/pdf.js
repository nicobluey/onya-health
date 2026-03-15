import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_CANDIDATES = [
  path.resolve(__dirname, '..', '..', 'frontend', 'public', 'logo.png'),
  path.resolve(__dirname, '..', 'doctor-portal', 'logo.png'),
];

let cachedLogo = null;
let logoResolved = false;

function loadOnyaLogo() {
  if (logoResolved) return cachedLogo;
  logoResolved = true;

  for (const candidate of LOGO_CANDIDATES) {
    try {
      cachedLogo = fs.readFileSync(candidate);
      return cachedLogo;
    } catch {
      continue;
    }
  }

  cachedLogo = null;
  return null;
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

function safeText(value, fallback = 'Not provided') {
  const text = String(value || '').trim();
  return text || fallback;
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function formatLongDate(value) {
  const parsed = parseDate(value);
  if (!parsed) return 'Not provided';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function addDays(date, dayCount) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + dayCount);
  return result;
}

function formatAttendanceTarget(purpose) {
  const normalized = String(purpose || '').trim().toLowerCase();
  if (!normalized) return 'their usual activities';
  if (normalized.includes('work')) return 'work';
  if (normalized.includes('school') || normalized.includes('university') || normalized.includes('study')) {
    return 'study';
  }
  return normalized;
}

function normalizeSymptomVisibility(value) {
  return String(value || '').trim().toLowerCase() === 'public' ? 'public' : 'private';
}

function formatPeriod(startDate, durationDays) {
  const parsedStart = parseDate(startDate);
  if (!parsedStart) {
    return '';
  }

  const safeDuration = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 1;
  if (safeDuration <= 1) {
    return ` on ${formatLongDate(parsedStart)}`;
  }

  const endDate = addDays(parsedStart, safeDuration - 1);
  return ` from ${formatLongDate(parsedStart)} to ${formatLongDate(endDate)}`;
}

function buildReadablePeriod(startDate, durationDays) {
  const parsedStart = parseDate(startDate);
  const safeDuration = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 1;

  if (!parsedStart) {
    return `${safeDuration} day${safeDuration === 1 ? '' : 's'}`;
  }

  if (safeDuration <= 1) {
    return `${formatLongDate(parsedStart)} (1 day)`;
  }

  const endDate = addDays(parsedStart, safeDuration - 1);
  return `${formatLongDate(parsedStart)} to ${formatLongDate(endDate)} (${safeDuration} days)`;
}

function buildCertificateStatement({ issueDate, patientName, purpose, startDate, durationDays, symptom, symptomVisibility }) {
  const attendanceTarget = formatAttendanceTarget(purpose);
  const period = formatPeriod(startDate, durationDays);
  const symptoms = String(symptom || '').trim();
  const hasPublicSymptoms = normalizeSymptomVisibility(symptomVisibility) === 'public' && Boolean(symptoms);
  const conditionPhrase = hasPublicSymptoms
    ? `${patientName} is experiencing ${symptoms}`
    : `${patientName} is suffering from a medical condition`;

  return (
    `Following a telehealth consultation on ${issueDate}, ` +
    `${conditionPhrase} and is currently unfit to attend ${attendanceTarget}${period}. ` +
    'This certificate is based on clinician assessment.'
  );
}

function dataUrlToBuffer(dataUrl) {
  const marker = 'base64,';
  const index = String(dataUrl || '').indexOf(marker);
  if (index === -1) return null;
  return Buffer.from(String(dataUrl).slice(index + marker.length), 'base64');
}

function truncateText(value, maxChars = 140) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

async function buildQrBuffer(value) {
  const payload = String(value || '').trim();
  if (!payload) return null;

  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      margin: 0,
      width: 256,
      color: {
        dark: '#1F2937',
        light: '#0000',
      },
    });
    return dataUrlToBuffer(dataUrl);
  } catch {
    return null;
  }
}

function drawSignatureMark(doc, x, y) {
  doc
    .save()
    .lineWidth(2)
    .strokeColor('#131416')
    .moveTo(x, y + 22)
    .bezierCurveTo(x + 18, y + 32, x + 52, y + 30, x + 78, y + 14)
    .bezierCurveTo(x + 96, y + 4, x + 110, y + 0, x + 128, y + 6)
    .bezierCurveTo(x + 144, y + 10, x + 170, y + 12, x + 192, y + 6)
    .stroke()
    .restore();
}

function drawHolographicSeal(doc, centerX, centerY, size, verificationCode) {
  const radius = size / 2;
  const outerGradient = doc.radialGradient(centerX - 4, centerY - 4, 2, centerX, centerY, radius);
  outerGradient.stop(0, '#FEFCFF', 0.96).stop(0.32, '#CFFAFE', 0.92).stop(0.62, '#DDD6FE', 0.9).stop(1, '#93C5FD', 0.92);
  doc.circle(centerX, centerY, radius).fill(outerGradient);

  doc.save();
  doc.circle(centerX, centerY, radius).clip();
  doc
    .lineWidth(2)
    .strokeColor('#FFFFFF')
    .opacity(0.32)
    .moveTo(centerX - radius, centerY - radius + 8)
    .lineTo(centerX + radius, centerY + radius - 8)
    .stroke();
  doc
    .lineWidth(2)
    .strokeColor('#7DD3FC')
    .opacity(0.28)
    .moveTo(centerX - radius + 6, centerY + radius - 12)
    .lineTo(centerX + radius - 6, centerY - radius + 12)
    .stroke();
  doc.restore();

  doc.circle(centerX, centerY, radius).lineWidth(1.5).strokeColor('#60A5FA').stroke();
  doc.circle(centerX, centerY, radius - 6).lineWidth(1).strokeColor('#DBEAFE').stroke();

  const sealCode = String(verificationCode || '').slice(-6) || 'ONYA';
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#1E3A8A').text('ONYA VERIFIED', centerX - radius, centerY - 6, {
    width: size,
    align: 'center',
    lineBreak: false,
  });
  doc.font('Helvetica').fontSize(7).fillColor('#1E40AF').text(sealCode, centerX - radius, centerY + 5, {
    width: size,
    align: 'center',
    lineBreak: false,
  });
}

function drawHolographicPanel(doc, x, y, width, height, borderColor) {
  const gradient = doc.linearGradient(x, y, x + width, y + height);
  gradient.stop(0, '#F9FCFF', 0.98).stop(0.32, '#ECF5FF', 0.96).stop(0.66, '#E7F1FF', 0.95).stop(1, '#F6FAFF', 0.98);

  doc.roundedRect(x, y, width, height, 14).fillAndStroke(gradient, borderColor);

  doc.save();
  doc.roundedRect(x, y, width, height, 14).clip();
  for (let i = -height; i < width + height; i += 22) {
    doc
      .lineWidth(1)
      .strokeColor('#FFFFFF')
      .opacity(0.24)
      .moveTo(x + i, y + 2)
      .lineTo(x + i + height, y + height - 2)
      .stroke();
  }
  for (let i = -height; i < width + height; i += 36) {
    doc
      .lineWidth(0.8)
      .strokeColor('#BFDBFE')
      .opacity(0.32)
      .moveTo(x + i, y + height - 2)
      .lineTo(x + i + height, y + 2)
      .stroke();
  }
  doc.restore();
}

export async function buildCertificatePdf(certificate, options = {}) {
  const data = certificate?.certificateDraft || {};
  const verificationCode =
    normalizeVerificationCode(options.verificationCode || certificate?.rawSubmission?.verificationCode) ||
    fallbackVerificationCode(certificate?.id || '');

  const baseUrl = String(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const verifyUrl =
    String(options.verifyUrl || '').trim() ||
    (baseUrl ? `${baseUrl}/verify?code=${encodeURIComponent(verificationCode)}` : '');

  const issuedAt = certificate?.decision?.at || certificate?.createdAt || new Date().toISOString();
  const issueDate = formatLongDate(issuedAt);
  const issueDateIso = parseDate(issuedAt)?.toISOString().slice(0, 10) || '';

  const patientName = safeText(data.fullName, 'Patient name unavailable');
  const doctorName = safeText(
    options.doctorName || certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME,
    'Onya Health Doctor'
  );
  const providerType = safeText(
    options.providerType || certificate?.decision?.providerType,
    'Provider type not recorded'
  );
  const registrationNumber = safeText(
    String(options.registrationNumber || certificate?.decision?.registrationNumber || '')
      .trim()
      .toUpperCase(),
    'Registration number not recorded'
  );
  const doctorNotes = safeText(options.doctorNotes ?? certificate?.decision?.notes, 'No additional doctor notes.');
  const certificateId = safeText(certificate?.id, '-');

  const durationDaysRaw = Number(data.durationDays || 1);
  const durationDays = Number.isFinite(durationDaysRaw) && durationDaysRaw > 0 ? Math.floor(durationDaysRaw) : 1;
  const symptomVisibility = normalizeSymptomVisibility(data.symptomVisibility);
  const statement = buildCertificateStatement({
    issueDate,
    patientName,
    purpose: data.purpose,
    startDate: data.startDate,
    durationDays,
    symptom: data.symptom,
    symptomVisibility,
  });

  const logo = loadOnyaLogo();
  const qrBuffer = await buildQrBuffer(verifyUrl || verificationCode);
  const isPreview = Boolean(options.isPreview);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 38,
      info: {
        Title: 'Onya Health Medical Certificate',
        Author: 'Onya Health',
        Subject: `Medical certificate ${verificationCode}`,
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 38;
    const right = pageWidth - 38;
    const contentWidth = right - left;

    const colors = {
      text: '#0B1324',
      muted: '#4B5B74',
      accent: '#2E8CFF',
      panel: '#EEF5FF',
      border: '#C9DCF8',
    };

    let y = 34;
    let isFirstPage = true;

    if (logo) {
      doc.image(logo, left, y, { fit: [176, 48], align: 'left', valign: 'top' });
    } else {
      doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.text).text('Onya Health', left, y + 8);
    }

    const companyX = right - 210;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.text).text('Onya Health Pty Ltd', companyX, y + 2, {
      width: 210,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.muted).text('Telehealth Medical Certificates', companyX, y + 20, {
      width: 210,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.muted).text('support@onyahealth.com.au', companyX, y + 36, {
      width: 210,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.muted).text('www.onyahealth.com.au', companyX, y + 52, {
      width: 210,
      align: 'right',
    });

    y = 92;
    doc.font('Helvetica-Bold').fontSize(38).fillColor(colors.text).text('Medical Certificate', left, y, {
      width: contentWidth,
    });
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(colors.muted)
      .text('Doctor-reviewed telehealth certificate', left, y + 44, {
        width: contentWidth,
      });
    y += 62;

    doc.lineWidth(2.5).strokeColor(colors.accent).moveTo(left, y).lineTo(right, y).stroke();
    y += 16;

    const headerCardHeight = 118;
    const headerTopY = y;
    drawHolographicPanel(doc, left, headerTopY, contentWidth, headerCardHeight, '#B9D3F7');

    const qrTileSize = 74;
    const qrTileX = right - qrTileSize - 18;
    const qrTileY = headerTopY + (headerCardHeight - qrTileSize) / 2;

    doc
      .roundedRect(qrTileX - 6, qrTileY - 6, qrTileSize + 12, qrTileSize + 12, 12)
      .lineWidth(1)
      .fillAndStroke('#FFFFFF', '#CFE0F8');

    if (qrBuffer) {
      doc.image(qrBuffer, qrTileX, qrTileY, { fit: [qrTileSize, qrTileSize], align: 'center', valign: 'center' });
    } else {
      doc
        .rect(qrTileX, qrTileY, qrTileSize, qrTileSize)
        .lineWidth(1.1)
        .strokeColor(colors.accent)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(colors.muted)
        .text('QR unavailable', qrTileX + 6, qrTileY + 30, { width: qrTileSize - 12, align: 'center' });
    }

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(colors.muted)
      .text('Scan to verify', qrTileX - 8, qrTileY + qrTileSize + 8, { width: qrTileSize + 16, align: 'center' });

    const metaWidth = contentWidth - qrTileSize - 42;
    const codeX = left + 16;
    const codeY = headerTopY + 18;

    doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('DATE OF ISSUE', codeX, codeY);
    doc
      .font('Helvetica-Bold')
      .fontSize(15.5)
      .fillColor(colors.text)
      .text(issueDate, codeX, codeY + 18, { width: metaWidth, lineBreak: false });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text('CERTIFICATE CODE', codeX, codeY + 50);
    doc
      .font('Helvetica-Bold')
      .fontSize(17)
      .fillColor(colors.text)
      .text(verificationCode, codeX, codeY + 68, { width: metaWidth, lineBreak: false });

    y += headerCardHeight + 20;

    doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.text).text('Patient details', left, y);
    y += 22;

    doc.font('Helvetica-Bold').fontSize(13).text('Name:', left, y);
    doc.font('Helvetica').fontSize(13).text(patientName, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 22;

    doc.font('Helvetica-Bold').fontSize(12).text('Certificate Period:', left, y);
    const readablePeriod = buildReadablePeriod(data.startDate, durationDays);
    doc.font('Helvetica').fontSize(12).text(readablePeriod, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 28;

    doc.font('Helvetica-Bold').fontSize(22).fillColor(colors.text).text('Medical Certificate Statement', left, y, {
      width: contentWidth,
    });
    y += 30;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.text).text('Clinical statement', left, y);
    y += 20;

    doc.font('Helvetica').fontSize(12.5).fillColor(colors.text).text(statement, left, y, {
      width: contentWidth,
      lineGap: 2,
    });
    y = doc.y + 10;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.text).text('Doctor verification', left, y);
    y += 18;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(colors.text).text(`Doctor: ${doctorName}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(colors.text)
      .text(`Medical registration number: ${registrationNumber}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(colors.text)
      .text(`Provider type: ${providerType}`, left, y, { width: contentWidth });
    y = doc.y + 8;

    doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.text).text('Signature', left, y);
    drawSignatureMark(doc, left, y + 10);
    y += 40;

    if (doctorNotes && doctorNotes !== 'No additional doctor notes.') {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(colors.muted)
        .text(`Clinician note: ${truncateText(doctorNotes, 130)}`, left, y, {
          width: contentWidth,
          lineBreak: false,
        });
      y += 16;
    }

    const verificationHeight = 122;
    const verificationBottomPadding = 12;
    const maxVerificationY = doc.page.height - 38 - verificationHeight - verificationBottomPadding;
    const verificationTargetY = y + 20;
    if (verificationTargetY > maxVerificationY) {
      doc.addPage();
      y = 48;
      isFirstPage = false;
    }

    let verificationY = y + 20;
    const minVerificationY = 540;
    if (isFirstPage && verificationY < minVerificationY) verificationY = minVerificationY;

    drawHolographicPanel(doc, left, verificationY, contentWidth, verificationHeight, colors.border);

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(colors.text)
      .text('AUTHENTICITY VERIFICATION', left + 16, verificationY + 14, { lineBreak: false });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text('Use the code below at onyahealth.com.au/verify to confirm this certificate.', left + 16, verificationY + 32, {
        width: contentWidth - 150,
        lineBreak: false,
      });

    doc.font('Helvetica-Bold').fontSize(20).fillColor(colors.text).text(verificationCode, left + 16, verificationY + 64, {
      width: contentWidth - 170,
      lineBreak: false,
    });

    drawHolographicSeal(doc, right - 66, verificationY + 62, 82, verificationCode);

    const footerY = verificationY + verificationHeight + 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.text).text('Verification support:', left, footerY);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(colors.text)
      .text(`Certificate ID ${certificateId}${issueDateIso ? ` • Issued ${issueDateIso}` : ''}`, left + 106, footerY, {
        width: contentWidth - 106,
        lineBreak: false,
      });

    if (isPreview) {
      doc.save();
      doc.fillColor('#E6EBF0');
      doc.font('Helvetica-Bold').fontSize(96);
      doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text('PREVIEW', 92, 410, {
        width: doc.page.width - 184,
        align: 'center',
      });
      doc.restore();
    }

    doc.end();
  });
}
