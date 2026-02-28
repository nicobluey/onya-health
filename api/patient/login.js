import { issuePatientToken } from '../../backend/lib/auth.js';
import { listCertificates } from '../../backend/lib/storage.js';
import { info } from '../../backend/lib/logger.js';
import {
  getPatientCertificatesForEmail,
  normalizeEmail,
  parseJsonBody,
  sendJson,
} from '../_lib/patientApi.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const dob = String(body.dob || '').trim();

    if (!email) {
      sendJson(res, 400, { error: 'Email is required' });
      return;
    }

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, email);
    if (patientCertificates.length === 0) {
      sendJson(res, 404, { error: 'No patient account found for this email yet' });
      return;
    }

    const latest = patientCertificates[0];
    if (dob && latest?.certificateDraft?.dob && latest.certificateDraft.dob !== dob) {
      sendJson(res, 401, { error: 'Date of birth did not match our records' });
      return;
    }

    const token = issuePatientToken(email);
    sendJson(res, 200, {
      token,
      patient: {
        fullName: latest.certificateDraft.fullName || '',
        email,
        dob: latest.certificateDraft.dob || '',
      },
    });
    info('patient.login.success', { email });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to log in right now' });
  }
}
