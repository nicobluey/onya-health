import { listCertificates } from '../../backend/lib/storage.js';
import {
  getPatientCertificatesForEmail,
  normalizeEmail,
  patientSummaryFromCertificate,
  requirePatient,
  sendJson,
} from '../_lib/patientApi.js';

const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);
    if (patientCertificates.length === 0) {
      sendJson(res, 404, { error: 'Patient account not found' });
      return;
    }

    const latest = patientCertificates[0];
    sendJson(res, 200, {
      patient: {
        fullName: latest.certificateDraft.fullName || '',
        email: normalizeEmail(patient.email),
        dob: latest.certificateDraft.dob || '',
        phone: latest.certificateDraft.phone || '',
      },
      queueCount: patientCertificates.filter((item) => isOpenForReview(item.status)).length,
      latestRequest: patientSummaryFromCertificate(latest),
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to load patient account' });
  }
}
