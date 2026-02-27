import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { issueDoctorToken, validateDoctorCredentials, verifyDoctorToken } from './lib/auth.js';
import { calculateRisk } from './lib/risk.js';
import { buildCertificatePdf } from './lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from './lib/notes.js';
import {
  appendAudit,
  createCertificate,
  getCertificateById,
  isSupabaseStorageEnabled,
  listCertificates,
  updateCertificate,
} from './lib/storage.js';
import { sendEmail } from './lib/email.js';
import { error, info } from './lib/logger.js';

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const envText = fsSync.readFileSync(filePath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'backend', '.env'));

const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

const PORTAL_DIR = path.resolve(process.cwd(), 'backend', 'doctor-portal');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 2_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function buildDraftCertificate(requestBody) {
  const patient = requestBody.patient || {};
  const consult = requestBody.consult || {};
  const parsedStartDate = consult.startDate ? new Date(consult.startDate) : new Date();
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;

  return {
    fullName: patient.fullName || '',
    dob: patient.dob || '',
    email: patient.email || '',
    phone: patient.phone || '',
    address: patient.address || '',
    purpose: consult.purpose || '',
    symptom: consult.symptom || '',
    description: consult.description || '',
    startDate: startDate.toISOString().split('T')[0],
    durationDays: Number(consult.durationDays || 1),
  };
}

function doctorPayloadFromRequest(cert) {
  return {
    id: cert.id,
    createdAt: cert.createdAt,
    status: cert.status,
    serviceType: cert.serviceType,
    patientName: cert.certificateDraft.fullName,
    patientEmail: cert.certificateDraft.email,
    purpose: cert.certificateDraft.purpose,
    symptom: cert.certificateDraft.symptom,
    startDate: cert.certificateDraft.startDate,
    durationDays: cert.certificateDraft.durationDays,
    description: cert.certificateDraft.description,
    risk: cert.risk,
    decision: cert.decision || null,
  };
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

async function sendDoctorReviewEmail(certificate) {
  const reviewUrl = `${APP_BASE_URL}/doctor/login`;
  const html = `
    <p>A new medical certificate requires review.</p>
    <p><strong>Request ID:</strong> ${certificate.id}</p>
    <p><strong>Patient:</strong> ${certificate.certificateDraft.fullName}</p>
    <p><strong>Risk:</strong> ${certificate.risk.level} (${certificate.risk.score})</p>
    <p><a href="${reviewUrl}">Open doctor review queue</a></p>
  `;

  await sendEmail({
    to: DOCTOR_NOTIFICATION_EMAILS,
    subject: `Medical certificate review needed: ${certificate.id}`,
    html,
    text: `A new medical certificate (${certificate.id}) is ready for review. Visit ${reviewUrl}`,
  });
  info('certificate.doctor_review_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    recipients: DOCTOR_NOTIFICATION_EMAILS,
  });
}

async function sendPatientDecisionEmail(certificate) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  if (certificate.status === 'approved') {
    const pdfBuffer = buildCertificatePdf(certificate, {
      doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      doctorNotes: certificate?.decision?.notes || '',
    });
    const html = `
      <p>Your medical certificate is ready.</p>
      <p>Request ID: <strong>${certificate.id}</strong></p>
      <p>Please find your certificate PDF attached to this email.</p>
    `;

    await sendEmail({
      to: patientEmail,
      subject: 'Your medical certificate is ready',
      html,
      text: `Your medical certificate (${certificate.id}) is ready. The certificate PDF is attached.`,
      attachments: [
        {
          filename: `medical-certificate-${certificate.id}.pdf`,
          contentBase64: pdfBuffer.toString('base64'),
        },
      ],
    });
    info('certificate.patient_email.sent', {
      certificateId: certificate.id,
      outcome: 'approved',
      provider: currentEmailProvider(),
      patientEmail,
      hasPdfAttachment: true,
    });
    return;
  }

  const html = `
    <p>Your medical certificate request has been reviewed.</p>
    <p>Request ID: <strong>${certificate.id}</strong></p>
    <p>Outcome: <strong>Not approved</strong></p>
    <p>Please book another consult if your condition changes.</p>
  `;
  await sendEmail({
    to: patientEmail,
    subject: 'Update on your medical certificate request',
    html,
    text: `Your medical certificate request (${certificate.id}) was reviewed and not approved.`,
  });
  info('certificate.patient_email.sent', {
    certificateId: certificate.id,
    outcome: 'denied',
    provider: currentEmailProvider(),
    patientEmail,
    hasPdfAttachment: false,
  });
}

async function sendPatientMoreInfoEmail(certificate, doctorEmail, notes) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  const html = `
    <p>Your doctor needs a little more information before finalising your medical certificate.</p>
    <p>Request ID: <strong>${certificate.id}</strong></p>
    <p><strong>Doctor note:</strong></p>
    <p>${String(notes || 'Please provide additional details to continue your review.').replace(/\n/g, '<br/>')}</p>
    <p>Reply with the requested details and we will continue your review.</p>
    <p>Reviewed by: ${doctorEmail}</p>
  `;

  await sendEmail({
    to: patientEmail,
    subject: 'More information requested for your medical certificate',
    html,
    text: `More information is required for request ${certificate.id}. Doctor note: ${notes || 'Please provide additional details.'}`,
  });
  info('certificate.more_info_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    patientEmail,
    doctorEmail,
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'onya-health-backend',
      storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/certificates') {
    const body = await parseJsonBody(req);
    const patient = body.patient || {};

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const certificate = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: body,
      decision: null,
    };

    await createCertificate(certificate);
    await appendAudit({
      type: 'DOCTOR_NOTIFICATION_TRIGGERED',
      certificateId: certificate.id,
    });
    await sendDoctorReviewEmail(certificate);
    info('certificate.submitted', {
      certificateId: certificate.id,
      serviceType: certificate.serviceType,
      riskLevel: certificate.risk.level,
      riskScore: certificate.risk.score,
    });

    sendJson(res, 201, {
      id: certificate.id,
      status: certificate.status,
      risk: certificate.risk,
      message: 'Certificate submitted for doctor review',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/login') {
    const body = await parseJsonBody(req);
    const email = String(body.email || '');
    const password = String(body.password || '');

    if (!validateDoctorCredentials(email, password)) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = issueDoctorToken(email);
    info('doctor.login.success', { email });
    sendJson(res, 200, {
      token,
      doctor: {
        email,
        name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/doctor/certificates') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const statusFilter = url.searchParams.get('status');
    const items = await listCertificates();

    const filtered = items
      .filter((item) => {
        if (!statusFilter) return true;
        if (statusFilter === 'pending') {
          return ['pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(item.status);
        }
        return item.status === statusFilter;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        serviceType: item.serviceType,
        patientName: item.certificateDraft.fullName,
        risk: item.risk,
      }));

    sendJson(res, 200, {
      doctor: doctor.email,
      count: filtered.length,
      certificates: filtered,
    });
    info('doctor.queue.loaded', {
      doctor: doctor.email,
      statusFilter: statusFilter || 'all',
      count: filtered.length,
    });
    return;
  }

  const certificateIdMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)$/);
  if (req.method === 'GET' && certificateIdMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(certificateIdMatch[1]);
    const certificate = await getCertificateById(certId);

    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    sendJson(res, 200, {
      doctor: doctor.email,
      certificate: doctorPayloadFromRequest(certificate),
    });
    return;
  }

  const autoNotesMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/auto-notes$/);
  if (req.method === 'POST' && autoNotesMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(autoNotesMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const notes = await generateDoctorNotes(certificate, doctor.email);
    info('doctor.notes.generated', {
      doctor: doctor.email,
      certificateId: certId,
      mode: 'auto-summary',
    });
    sendJson(res, 200, { notes });
    return;
  }

  const moreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/more-info$/);
  if (req.method === 'POST' && moreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(moreInfoMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const notes = await generateMoreInfoDraft(certificate);
    info('doctor.notes.generated', {
      doctor: doctor.email,
      certificateId: certId,
      mode: 'more-info-draft',
    });
    sendJson(res, 200, { notes });
    return;
  }

  const previewMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/pdf-preview$/);
  if (req.method === 'POST' && previewMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(previewMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    const previewCertificate = {
      ...certificate,
      decision: {
        ...(certificate.decision || {}),
        by: doctor.email,
        at: new Date().toISOString(),
        notes,
      },
    };

    const pdfBuffer = buildCertificatePdf(previewCertificate, {
      doctorName: doctor.email,
      doctorNotes: notes,
      isPreview: true,
    });
    info('doctor.pdf.preview.generated', {
      doctor: doctor.email,
      certificateId: certId,
      bytes: pdfBuffer.length,
    });

    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
    res.end(pdfBuffer);
    return;
  }

  const requestMoreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/request-more-info$/);
  if (req.method === 'POST' && requestMoreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(requestMoreInfoMatch[1]);
    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    if (!notes) {
      sendJson(res, 400, { error: 'Please add notes before requesting more information' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isOpenForReview(currentCertificate.status)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => ({
      ...current,
      status: 'in_review',
      decision: {
        ...(current.decision || {}),
        by: doctor.email,
        at: new Date().toISOString(),
        notes,
      },
    }));

    if (!updated) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    await appendAudit({
      type: 'MORE_INFO_REQUESTED',
      certificateId: updated.id,
      by: doctor.email,
      notes,
    });
    await sendPatientMoreInfoEmail(updated, doctor.email, notes);
    info('doctor.more_info.requested', {
      doctor: doctor.email,
      certificateId: updated.id,
    });

    sendJson(res, 200, {
      message: 'More information request sent to patient',
      certificate: doctorPayloadFromRequest(updated),
    });
    return;
  }

  const decisionMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/decision$/);
  if (req.method === 'POST' && decisionMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(decisionMatch[1]);
    const body = await parseJsonBody(req);
    const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null;
    const notes = String(body.notes || '').trim();

    if (!decision) {
      sendJson(res, 400, { error: 'Decision must be approved or denied' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isOpenForReview(currentCertificate.status)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => {
      if (!isOpenForReview(current.status)) {
        return current;
      }

      return {
        ...current,
        status: decision,
        decision: {
          by: doctor.email,
          at: new Date().toISOString(),
          notes,
        },
      };
    });

    if (!updated) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    if (updated.status !== decision) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: updated.status,
      });
      return;
    }

    await appendAudit({
      type: 'CERTIFICATE_REVIEWED',
      certificateId: updated.id,
      decision,
      by: doctor.email,
    });
    await sendPatientDecisionEmail(updated);
    info('doctor.decision.submitted', {
      doctor: doctor.email,
      certificateId: updated.id,
      decision,
    });

    sendJson(res, 200, {
      message: `Certificate ${decision}`,
      certificate: doctorPayloadFromRequest(updated),
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function servePortalFile(res, fileName) {
  const filePath = path.join(PORTAL_DIR, fileName);
  const html = await fs.readFile(filePath, 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

async function handlePortal(req, res, url) {
  if (req.method !== 'GET') {
    sendText(res, 404, 'Not found');
    return;
  }

  if (url.pathname === '/doctor' || url.pathname === '/doctor/login') {
    await servePortalFile(res, 'login.html');
    return;
  }

  if (url.pathname === '/doctor/queue') {
    await servePortalFile(res, 'queue.html');
    return;
  }

  if (url.pathname === '/doctor/review') {
    await servePortalFile(res, 'review.html');
    return;
  }

  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  res.on('finish', () => {
    info('http.request.completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.socket?.remoteAddress || null,
    });
  });

  try {
    const base = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url || '/', base);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handlePortal(req, res, url);
  } catch (errorObject) {
    error('http.request.unhandled_error', {
      requestId,
      method: req.method,
      url: req.url,
      message: errorObject?.message || String(errorObject),
      stack: errorObject?.stack || null,
    });
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  info('server.started', {
    appBaseUrl: APP_BASE_URL,
    doctorPortalLogin: `${APP_BASE_URL}/doctor/login`,
    storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    emailProvider: currentEmailProvider(),
    logFile: process.env.BACKEND_LOG_FILE || path.resolve(process.cwd(), 'backend', 'data', 'backend.log'),
  });
});
