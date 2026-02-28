import { appendAudit, getCertificateById, updateCertificate } from '../../../../backend/lib/storage.js';
import { info } from '../../../../backend/lib/logger.js';
import {
  doctorPayloadFromRequest,
  getDynamicRouteParam,
  isOpenForReview,
  parseJsonBody,
  requireDoctor,
  sendJson,
  sendPatientDecisionEmail,
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
    const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null;
    const notes = String(body.notes || '').trim();

    if (!decision) {
      sendJson(res, 400, { error: 'Decision must be approved or denied' });
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

    const updated = await updateCertificate(certId, (item) => {
      if (!isOpenForReview(item.status)) {
        return item;
      }
      return {
        ...item,
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
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to submit decision' });
  }
}
