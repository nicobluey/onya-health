import { appendAudit, getCertificateById, updateCertificate } from '../../backend/lib/storage.js';
import { sendEmail } from '../../backend/lib/email.js';
import { info } from '../../backend/lib/logger.js';

const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://onya-health.vercel.app').replace(/\/$/, '');
const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

export function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

export async function sendDoctorReviewEmail(certificate) {
  const reviewUrl = `${APP_BASE_URL}/doctor/login`;
  const html = `
    <p>A new medical certificate requires review.</p>
    <p><strong>Request ID:</strong> ${certificate.id}</p>
    <p><strong>Patient:</strong> ${certificate.certificateDraft.fullName}</p>
    <p><strong>Risk:</strong> ${certificate.risk.level} (${certificate.risk.score})</p>
    <p><a href="${reviewUrl}">Open doctor review queue</a></p>
  `;

  await sendEmail({
    to: DOCTOR_NOTIFICATION_EMAILS,
    subject: `Medical certificate review needed: ${certificate.id}`,
    html,
    text: `A new medical certificate (${certificate.id}) is ready for review. Visit ${reviewUrl}`,
  });

  info('certificate.doctor_review_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    recipients: DOCTOR_NOTIFICATION_EMAILS,
  });
}

export async function markCertificatePaidFromStripeSession(session, trigger = 'stripe_event') {
  const certificateId =
    session?.metadata?.certificate_id ||
    session?.client_reference_id ||
    session?.subscription_details?.metadata?.certificate_id ||
    null;

  if (!certificateId) {
    return { ok: false, reason: 'missing_certificate_id' };
  }

  const current = await getCertificateById(certificateId);
  if (!current) {
    return { ok: false, reason: 'certificate_not_found', certificateId };
  }

  const alreadyPaid = current?.rawSubmission?.payment?.status === 'paid';
  if (alreadyPaid) {
    return { ok: true, updated: false, certificateId, status: current.status };
  }

  const updated = await updateCertificate(certificateId, (certificate) => ({
    ...certificate,
    status: isOpenForReview(certificate.status) ? certificate.status : 'pending',
    rawSubmission: {
      ...(certificate.rawSubmission || {}),
      payment: {
        provider: 'stripe',
        status: 'paid',
        stripeSessionId: session.id || null,
        stripeCustomerId: session.customer || null,
        stripePaymentIntentId: session.payment_intent || null,
        stripeSubscriptionId: session.subscription || null,
        paidAt: new Date().toISOString(),
        amountTotal: session.amount_total || null,
        currency: session.currency || 'aud',
      },
    },
  }));

  if (updated && isOpenForReview(updated.status)) {
    await appendAudit({
      type: 'PAYMENT_CONFIRMED',
      certificateId: updated.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      trigger,
    });
    await sendDoctorReviewEmail(updated);
    info('stripe.payment.confirmed', {
      certificateId: updated.id,
      stripeSessionId: session.id || null,
      trigger,
      status: updated.status,
    });
  }

  return {
    ok: true,
    updated: true,
    certificateId: updated?.id || certificateId,
    status: updated?.status || 'pending',
  };
}
