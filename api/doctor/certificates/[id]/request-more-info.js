import { appendAudit, getCertificateById, updateCertificate } from '../../../../backend/lib/storage.js';
import { info } from '../../../../backend/lib/logger.js';
import {
  doctorPayloadFromRequest,
  getDynamicRouteParam,
  isOpenForReview,
  parseJsonBody,
  requireDoctor,
  sendJson,
  sendPatientMoreInfoEmail,
} from '../../../_lib/doctorApi.js';

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
    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();
    if (!notes) {
      sendJson(res, 400, { error: 'Please add notes before requesting more information' });
      return;
    }

    const current = await getCertificateById(certId);
    if (!current) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isOpenForReview(current.status)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: current.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (item) => ({
      ...item,
      status: 'in_review',
      decision: {
        ...(item.decision || {}),
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
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to request more information' });
  }
}
