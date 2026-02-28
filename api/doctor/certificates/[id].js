import { getCertificateById } from '../../../backend/lib/storage.js';
import { doctorPayloadFromRequest, getDynamicRouteParam, requireDoctor, sendJson } from '../../_lib/doctorApi.js';

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
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(getDynamicRouteParam(req, 'id'));
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    sendJson(res, 200, {
      doctor: doctor.email,
      certificate: doctorPayloadFromRequest(certificate),
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to load certificate' });
  }
}
