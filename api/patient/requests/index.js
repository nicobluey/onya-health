import { listCertificates } from '../../../backend/lib/storage.js';
import {
  getPatientCertificatesForEmail,
  patientSummaryFromCertificate,
  requirePatient,
  sendJson,
} from '../../_lib/patientApi.js';

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

    sendJson(res, 200, {
      count: patientCertificates.length,
      requests: patientCertificates.map(patientSummaryFromCertificate),
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to load patient requests' });
  }
}
