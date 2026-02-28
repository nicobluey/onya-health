import crypto from 'node:crypto';
import { appendAudit, getCertificateById, updateCertificate } from '../../backend/lib/storage.js';
import { sendEmail } from '../../backend/lib/email.js';
import { error, info } from '../../backend/lib/logger.js';

const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://onya-health.vercel.app').replace(/\/$/, '');
const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

async function parseRawBody(req) {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  if (req.body && typeof req.body === 'object') {
    throw new Error('Raw request body unavailable for Stripe signature verification');
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += normalized.length;
    if (total > 2_000_000) {
      throw new Error('Request body too large');
    }
    chunks.push(normalized);
  }
  return Buffer.concat(chunks);
}

function verifyStripeEvent(rawBodyBuffer, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const rawBody = rawBodyBuffer.toString('utf8');
  const parts = String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) {
    throw new Error('Missing Stripe signature components');
  }

  const timestamp = timestampPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  const valid = signatures.some((signature) => safeTimingCompare(signature, expected));
  if (!valid) {
    throw new Error('Invalid Stripe signature');
  }

  return JSON.parse(rawBody);
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

async function sendDoctorReviewEmail(certificate) {
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
    const rawBody = await parseRawBody(req);
    const signature = req.headers['stripe-signature'];
    const event = verifyStripeEvent(rawBody, signature);

    if (event?.type === 'checkout.session.completed') {
      const session = event?.data?.object || {};
      const certificateId =
        session?.metadata?.certificate_id ||
        session?.client_reference_id ||
        session?.subscription_details?.metadata?.certificate_id ||
        null;

      if (certificateId) {
        const current = await getCertificateById(certificateId);
        if (current) {
          const alreadyPaid = current?.rawSubmission?.payment?.status === 'paid';
          if (!alreadyPaid) {
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
              });
              await sendDoctorReviewEmail(updated);
              info('stripe.webhook.checkout_completed', {
                certificateId: updated.id,
                stripeSessionId: session.id || null,
              });
            }
          }
        }
      }
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    error('stripe.webhook.failed', {
      message: err?.message || String(err),
    });
    sendJson(res, 400, { error: err?.message || 'Invalid Stripe webhook' });
  }
}
