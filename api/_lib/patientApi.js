import { verifyPatientToken } from '../../backend/lib/auth.js';

export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

export async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function getPatientCertificatesForEmail(certificates, email) {
  const normalizedEmail = normalizeEmail(email);
  return certificates
    .filter((cert) => normalizeEmail(cert?.certificateDraft?.email) === normalizedEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function patientSummaryFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  return {
    id: certificate.id,
    createdAt: certificate.createdAt,
    status: certificate.status,
    serviceType: certificate.serviceType || 'doctor',
    purpose: draft.purpose || '',
    symptom: draft.symptom || '',
    description: draft.description || '',
    startDate: draft.startDate || null,
    durationDays: Number(draft.durationDays || 1),
    risk: certificate.risk || null,
    decision: certificate.decision || null,
  };
}

export function getPatientAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyPatientToken(token);
}

export async function requirePatient(req, res) {
  const payload = getPatientAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

export function getDynamicRouteParam(req, paramName) {
  const value = req.query?.[paramName];
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}
