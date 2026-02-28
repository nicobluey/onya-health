import { verifyDoctorToken } from '../../backend/lib/auth.js';
import { buildCertificatePdf } from '../../backend/lib/pdf.js';
import { sendEmail } from '../../backend/lib/email.js';

export const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

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

export function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

export async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
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

export function doctorPayloadFromRequest(cert) {
  return {
    id: cert.id,
    createdAt: cert.createdAt,
    status: cert.status,
    serviceType: cert.serviceType,
    patientName: cert.certificateDraft.fullName,
    patientEmail: cert.certificateDraft.email,
    purpose: cert.certificateDraft.purpose,
    symptom: cert.certificateDraft.symptom,
    startDate: cert.certificateDraft.startDate,
    durationDays: cert.certificateDraft.durationDays,
    description: cert.certificateDraft.description,
    risk: cert.risk,
    decision: cert.decision || null,
  };
}

export function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

export function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

export async function sendPatientDecisionEmail(certificate) {
  const patientEmail = certificate?.certificateDraft?.email;
  if (!patientEmail) return;

  if (certificate.status === 'approved') {
    const pdfBuffer = buildCertificatePdf(certificate, {
      doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      doctorNotes: certificate?.decision?.notes || '',
    });
    await sendEmail({
      to: patientEmail,
      subject: 'Your medical certificate is ready',
      html: `
        <p>Your medical certificate is ready.</p>
        <p>Request ID: <strong>${certificate.id}</strong></p>
        <p>Please find your certificate PDF attached to this email.</p>
      `,
      text: `Your medical certificate (${certificate.id}) is ready. The certificate PDF is attached.`,
      attachments: [
        {
          filename: `medical-certificate-${certificate.id}.pdf`,
          contentBase64: pdfBuffer.toString('base64'),
        },
      ],
    });
    return;
  }

  await sendEmail({
    to: patientEmail,
    subject: 'Update on your medical certificate request',
    html: `
      <p>Your medical certificate request has been reviewed.</p>
      <p>Request ID: <strong>${certificate.id}</strong></p>
      <p>Outcome: <strong>Not approved</strong></p>
      <p>Please book another consult if your condition changes.</p>
    `,
    text: `Your medical certificate request (${certificate.id}) was reviewed and not approved.`,
  });
}

export async function sendPatientMoreInfoEmail(certificate, doctorEmail, notes) {
  const patientEmail = certificate?.certificateDraft?.email;
  if (!patientEmail) return;

  await sendEmail({
    to: patientEmail,
    subject: 'More information requested for your medical certificate',
    html: `
      <p>Your doctor needs a little more information before finalising your medical certificate.</p>
      <p>Request ID: <strong>${certificate.id}</strong></p>
      <p><strong>Doctor note:</strong></p>
      <p>${String(notes || 'Please provide additional details to continue your review.').replace(/\n/g, '<br/>')}</p>
      <p>Reply with the requested details and we will continue your review.</p>
      <p>Reviewed by: ${doctorEmail}</p>
    `,
    text: `More information is required for request ${certificate.id}. Doctor note: ${notes || 'Please provide additional details.'}`,
  });
}
