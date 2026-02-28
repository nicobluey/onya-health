import { getCertificateById } from '../../../../backend/lib/storage.js';
import { generateMoreInfoDraft } from '../../../../backend/lib/notes.js';
import { info } from '../../../../backend/lib/logger.js';
import { getDynamicRouteParam, requireDoctor, sendJson } from '../../../_lib/doctorApi.js';

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
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(getDynamicRouteParam(req, 'id'));
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
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to generate more-info draft' });
  }
}
