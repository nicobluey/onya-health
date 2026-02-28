import { getCertificateById } from '../../../backend/lib/storage.js';
import {
  getDynamicRouteParam,
  normalizeEmail,
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

    const certId = decodeURIComponent(getDynamicRouteParam(req, 'id'));
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Request not found' });
      return;
    }
    if (normalizeEmail(certificate?.certificateDraft?.email) !== normalizeEmail(patient.email)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    sendJson(res, 200, {
      request: patientSummaryFromCertificate(certificate),
      certificateDraft: certificate.certificateDraft || {},
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to load request' });
  }
}
