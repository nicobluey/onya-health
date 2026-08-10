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

function calendarDateParts(value) {
  const raw = String(value || '').trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return {
      year: Number(dateOnlyMatch[1]),
      month: Number(dateOnlyMatch[2]),
      day: Number(dateOnlyMatch[3]),
    };
  }

  const parsed = parseDate(value);
  if (!parsed) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(parsed);
  const partValue = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: partValue('year'),
    month: partValue('month'),
    day: partValue('day'),
  };
}

function formatIsoCalendarDate(value) {
  const parts = calendarDateParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function calculatePatientAge(dob, atDate = new Date()) {
  const birth = calendarDateParts(dob);
  const reference = calendarDateParts(atDate);
  if (!birth || !reference || birth.year < 1900 || birth.year > reference.year) return null;

  let age = reference.year - birth.year;
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? age : null;
}

export function buildCertificateIdentityDetails(certificate, issuedAt = new Date()) {
  const data = certificate?.certificateDraft || {};
  const age = calculatePatientAge(data.dob, issuedAt);
  return {
    patientName: safeText(data.fullName, 'Patient name unavailable'),
    ageAtConsultation: age === null ? '' : `${age} years`,
  };
}

function addDays(date, dayCount) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + dayCount);
  return result;
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

export function buildDefaultCertificateStatement(certificate, issuedAt = new Date()) {
  const data = certificate?.certificateDraft || {};
  const issueDate = formatLongDate(issuedAt);
  const patientName = safeText(data.fullName, 'the patient');
  const durationDaysRaw = Number(data.durationDays || 1);
  const durationDays = Number.isFinite(durationDaysRaw) && durationDaysRaw > 0 ? Math.floor(durationDaysRaw) : 1;
  const period = formatPeriod(data.startDate, durationDays);

  return (
    `Following a telehealth consultation on ${issueDate}, in my opinion ${patientName} was suffering from a medical condition ` +
    `and was unfit to attend work${period}. ` +
    'This certificate is based on my clinical assessment of the patient on the date of consultation as stated above.'
  );
}

function dataUrlToBuffer(dataUrl) {
  const marker = 'base64,';
  const index = String(dataUrl || '').indexOf(marker);
  if (index === -1) return null;
  return Buffer.from(String(dataUrl).slice(index + marker.length), 'base64');
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

  const consultationAt = certificate?.decision?.at || certificate?.createdAt || new Date().toISOString();
  const issuedAt = certificate?.decision?.reissuedAt || consultationAt;
  const issueDate = formatLongDate(issuedAt);
  const issueDateIso = formatIsoCalendarDate(issuedAt);

  const patientIdentity = buildCertificateIdentityDetails(certificate, consultationAt);
  const patientName = patientIdentity.patientName;
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
  const providerNumber = safeText(
    String(options.providerNumber || certificate?.decision?.providerNumber || '').trim().toUpperCase(),
    'Provider number not recorded'
  );
  const certificateId = safeText(certificate?.id, '-');

  const durationDaysRaw = Number(data.durationDays || 1);
  const durationDays = Number.isFinite(durationDaysRaw) && durationDaysRaw > 0 ? Math.floor(durationDaysRaw) : 1;
  const storedStatement =
    certificate?.decision?.certificateStatement || certificate?.rawSubmission?.workflow?.certificateStatement || '';
  const statement = String(options.certificateStatement ?? storedStatement).trim() ||
    buildDefaultCertificateStatement(certificate, consultationAt);
  const revision = Math.max(
    1,
    Number(certificate?.decision?.revision || certificate?.rawSubmission?.workflow?.certificateRevision || 1)
  );

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
    doc.font('Helvetica').fontSize(10.5).fillColor(colors.muted).text('www.supadoc.com.au', companyX, y + 52, {
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

    const headerCardHeight = 112;
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
    y += 20;

    doc.font('Helvetica-Bold').fontSize(13).text('Name:', left, y);
    doc.font('Helvetica').fontSize(13).text(patientName, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 22;

    if (patientIdentity.ageAtConsultation) {
      doc.font('Helvetica-Bold').fontSize(12).text('Age at consultation:', left, y, {
        width: 126,
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(12).text(patientIdentity.ageAtConsultation, left + 130, y, {
        width: contentWidth - 130,
        lineBreak: false,
      });
      y += 22;
    }

    doc.font('Helvetica-Bold').fontSize(12).text('Certificate Period:', left, y);
    const readablePeriod = buildReadablePeriod(data.startDate, durationDays);
    doc.font('Helvetica').fontSize(12).text(readablePeriod, left + 130, y, {
      width: contentWidth - 130,
    });
    y += 28;

    doc.font('Helvetica-Bold').fontSize(20).fillColor(colors.text).text('Medical Certificate Statement', left, y, {
      width: contentWidth,
    });
    y += 26;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.text).text('Clinical statement', left, y);
    y += 18;

    doc.font('Helvetica').fontSize(12.5).fillColor(colors.text).text(statement, left, y, {
      width: contentWidth,
      lineGap: 2,
    });
    y = doc.y + 10;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.text).text('Doctor verification', left, y);
    y += 16;

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
      .text(`Medicare provider number: ${providerNumber}`, left, y, { width: contentWidth });
    y = doc.y + 2;
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(colors.text)
      .text(`Provider type: ${providerType}`, left, y, { width: contentWidth });
    y = doc.y + 8;

    doc.font('Helvetica-Bold').fontSize(14).fillColor(colors.text).text('Signature', left, y);
    if (Buffer.isBuffer(options.signatureImage) && options.signatureImage.length > 0) {
      try {
        doc.image(options.signatureImage, left, y + 8, {
          fit: [190, 36],
          align: 'left',
          valign: 'center',
        });
      } catch {
        drawSignatureMark(doc, left, y + 10);
      }
    } else {
      drawSignatureMark(doc, left, y + 10);
    }

    y += 46;

    const verificationHeight = 112;
    const verificationBottomSpace = 44;
    const maxVerificationY = doc.page.height - 38 - verificationHeight - verificationBottomSpace;
    if (y > maxVerificationY) {
      doc.addPage();
      y = 48;
      isFirstPage = false;
    }

    let verificationY = Math.min(y + 12, maxVerificationY);
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
      .text('Use the code below at supadoc.com.au/verify to confirm this certificate.', left + 16, verificationY + 32, {
        width: contentWidth - 150,
        lineBreak: false,
      });

    doc.font('Helvetica-Bold').fontSize(20).fillColor(colors.text).text(verificationCode, left + 16, verificationY + 64, {
      width: contentWidth - 170,
      lineBreak: false,
    });

    drawHolographicSeal(doc, right - 66, verificationY + 62, 82, verificationCode);

    const footerY = verificationY + verificationHeight + 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.text).text('Verification support', left, footerY, {
      lineBreak: false,
    });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(colors.text)
      .text(`Certificate ID ${certificateId}${issueDateIso ? ` | Issued ${issueDateIso}` : ''}${revision > 1 ? ` | Revision ${revision}` : ''}`, left, footerY + 15, {
        width: contentWidth,
        lineBreak: false,
      });

    doc.end();
  });
}
