import { appendAudit, getCertificateById } from '../../../../backend/lib/storage.js';
import { sendEmail } from '../../../../backend/lib/email.js';
import { info } from '../../../../backend/lib/logger.js';
import {
  getDynamicRouteParam,
  normalizeEmail,
  parseJsonBody,
  requirePatient,
  sendJson,
} from '../../../_lib/patientApi.js';

const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

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

    const body = await parseJsonBody(req);
    const message = String(body.message || '').trim();
    if (!message) {
      sendJson(res, 400, { error: 'Message is required' });
      return;
    }

    await appendAudit({
      type: 'PATIENT_MESSAGE_SENT',
      certificateId: certId,
      by: normalizeEmail(patient.email),
      message,
    });

    await sendEmail({
      to: DOCTOR_NOTIFICATION_EMAILS,
      subject: `Patient message for request ${certId}`,
      html: `
        <p>Patient message received for certificate <strong>${certId}</strong>.</p>
        <p><strong>From:</strong> ${normalizeEmail(patient.email)}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br/>')}</p>
      `,
      text: `Patient message for ${certId} from ${normalizeEmail(patient.email)}: ${message}`,
    });

    info('patient.message.sent', {
      certificateId: certId,
      patientEmail: normalizeEmail(patient.email),
      provider: currentEmailProvider(),
    });

    sendJson(res, 200, { message: 'Message sent to doctor' });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to send message' });
  }
}
