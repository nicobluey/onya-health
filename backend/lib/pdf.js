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

function buildCertificateStatement({ issueDate, patientName, purpose, startDate, durationDays, symptom }) {
  const attendanceTarget = formatAttendanceTarget(purpose);
  const period = formatPeriod(startDate, durationDays);
  const symptoms = String(symptom || '').trim();
  const symptomPhrase = symptoms ? ` reported symptoms including ${symptoms}` : ' reported symptoms';

  return (
    `Following a telehealth consultation on ${issueDate}, ` +
    `${patientName} is currently unfit to attend ${attendanceTarget}${period}. ` +
    `This certificate is based on clinician assessment and the patient's${symptomPhrase}.`
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
  const statement = buildCertificateStatement({
    issueDate,
    patientName,
    purpose: data.purpose,
    startDate: data.startDate,
    durationDays,
    symptom: data.symptom,
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
      text: '#121417',
      muted: '#5E6470',
      accent: '#70BF36',
      panel: '#F5F7FA',
      border: '#DCE2EA',
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

    y = 98;
    doc.font('Helvetica-Bold').fontSize(40).fillColor(colors.text).text('Medical Certificate', left, y, {
      width: contentWidth,
    });
    y += 50;

    doc.lineWidth(2.5).strokeColor(colors.accent).moveTo(left, y).lineTo(right, y).stroke();
    y += 16;

    const headerCardHeight = 72;
    doc
      .roundedRect(left, y, contentWidth, headerCardHeight, 9)
      .fillAndStroke(colors.panel, colors.border);

    doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('DATE OF ISSUE', left + 14, y + 14);
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(colors.text)
      .text(issueDate, left + 14, y + 34, { width: contentWidth * 0.58 });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(colors.muted)
      .text('CERTIFICATE CODE', right - 205, y + 14, { width: 190, align: 'right' });
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(colors.text)
      .text(verificationCode, right - 205, y + 34, { width: 190, align: 'right' });

    y += headerCardHeight + 20;

    doc.font('Helvetica-Bold').fontSize(15).fillColor(colors.text).text('RE:', left, y);
    y += 24;

    doc.font('Helvetica-Bold').fontSize(13).text('Name:', left, y);
    doc.font('Helvetica').fontSize(13).text(patientName, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 24;

    doc.font('Helvetica-Bold').fontSize(12).text('Date of Birth:', left, y);
    doc.font('Helvetica').fontSize(12).text(safeText(data.dob), left + 130, y, {
      width: contentWidth - 130,
    });
    y += 22;

    doc.font('Helvetica-Bold').fontSize(12).text('Certificate Period:', left, y);
    const readablePeriod = buildReadablePeriod(data.startDate, durationDays);
    doc.font('Helvetica').fontSize(12).text(readablePeriod, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 34;

    doc.font('Helvetica-Bold').fontSize(24).fillColor(colors.text).text('MEDICAL CERTIFICATE', left, y, {
      width: contentWidth,
      align: 'center',
    });
    y += 34;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(colors.text).text('This is to certify that:', left, y);
    y += 24;

    doc.font('Helvetica').fontSize(12.5).fillColor(colors.text).text(statement, left, y, {
      width: contentWidth,
      lineGap: 2,
    });
    y = doc.y + 14;

    doc.font('Helvetica-Bold').fontSize(17).fillColor(colors.text).text(doctorName, left, y, {
      width: contentWidth,
    });
    y = doc.y + 3;

    doc.font('Helvetica').fontSize(14).fillColor(colors.text).text(registrationNumber, left, y, {
      width: contentWidth,
    });
    y = doc.y + 2;

    doc.font('Helvetica').fontSize(13).fillColor(colors.text).text(providerType, left, y, {
      width: contentWidth,
    });
    y = doc.y + 10;

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

    const verificationHeight = 150;
    const verificationBottomPadding = 24;
    const maxVerificationY = doc.page.height - 38 - verificationHeight - verificationBottomPadding;
    const verificationTargetY = y + 20;
    if (verificationTargetY > maxVerificationY) {
      doc.addPage();
      y = 48;
      isFirstPage = false;
    }

    let verificationY = y + 20;
    const minVerificationY = 560;
    if (isFirstPage && verificationY < minVerificationY) verificationY = minVerificationY;

    doc
      .roundedRect(left, verificationY, contentWidth, verificationHeight, 20)
      .fillAndStroke('#F7FAFD', colors.border);

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(colors.muted)
      .text('AUTHENTICITY VERIFICATION', left + 16, verificationY + 16, { lineBreak: false });

    doc
      .font('Helvetica-Oblique')
      .fontSize(10.5)
      .fillColor(colors.muted)
      .text('Verify this certificate with the code below or by scanning the QR code.', left + 16, verificationY + 34, {
        width: contentWidth - 190,
        lineBreak: false,
      });

    const verifyText = verifyUrl
      ? 'Visit onyahealth.com.au/verify'
      : 'Visit onyahealth.com.au/verify';
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.muted).text(verifyText, left + 16, verificationY + 58, {
      width: contentWidth - 190,
      lineBreak: false,
    });

    doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.text).text(verificationCode, left + 16, verificationY + 92, {
      width: contentWidth - 220,
      lineBreak: false,
    });

    if (qrBuffer) {
      doc.image(qrBuffer, right - 152, verificationY + 26, { fit: [112, 112], align: 'center', valign: 'center' });
    } else {
      doc
        .rect(right - 150, verificationY + 26, 112, 112)
        .lineWidth(1)
        .strokeColor(colors.border)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('QR unavailable', right - 144, verificationY + 74, { width: 100, align: 'center' });
    }

    const footerY = verificationY + verificationHeight + 16;
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
