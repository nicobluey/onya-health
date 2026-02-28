import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import {
  issueDoctorToken,
  issuePatientToken,
  validateDoctorCredentials,
  verifyDoctorToken,
  verifyPatientToken,
} from './lib/auth.js';
import { calculateRisk } from './lib/risk.js';
import { buildCertificatePdf } from './lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from './lib/notes.js';
import {
  appendAudit,
  createCertificate,
  getCertificateById,
  isSupabaseStorageEnabled,
  listCertificates,
  updateCertificate,
} from './lib/storage.js';
import { sendEmail } from './lib/email.js';
import { error, info } from './lib/logger.js';

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const envText = fsSync.readFileSync(filePath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'backend', '.env'));

const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || CORS_ORIGIN || APP_BASE_URL;
const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 1121);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2711);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1917);
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

const PORTAL_DIR = path.resolve(process.cwd(), 'backend', 'doctor-portal');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 2_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 2_000_000) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
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
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) {
    throw new Error('Missing Stripe signature components');
  }

  const timestamp = timestampPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  const valid = signatures.some((signature) => safeTimingCompare(signature, expected));
  if (!valid) {
    throw new Error('Invalid Stripe signature');
  }

  return JSON.parse(rawBody);
}

function sanitizeNameForStripe(value) {
  return String(value || '').trim().slice(0, 120);
}

function stripePricingFromRequest(body) {
  const isUnlimited = Boolean(body?.consult?.isUnlimited);
  const durationDays = Math.max(1, Number(body?.consult?.durationDays || 1));

  if (isUnlimited) {
    return {
      mode: 'subscription',
      unitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING,
      displayName: 'Onyahealth Pro',
      description: 'Recurring medical certificate support',
      recurringInterval: 'day',
      recurringIntervalCount: 26,
    };
  }

  if (durationDays <= 1) {
    return {
      mode: 'payment',
      unitAmount: STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_SINGLE_DAY,
      displayName: 'Medical Consultation (Single day)',
      description: 'One-day medical certificate request',
    };
  }

  return {
    mode: 'payment',
    unitAmount: STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS,
    productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF,
    displayName: 'Medical Consultation (Multi-day)',
    description: 'Multi-day medical certificate request',
  };
}

async function createStripeCheckoutSession({ certificate, body, pricing }) {
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  params.set('success_url', `${FRONTEND_BASE_URL.replace(/\/$/, '')}/patient?checkout=success`);
  params.set('cancel_url', `${FRONTEND_BASE_URL.replace(/\/$/, '')}/doctor?checkout=cancelled`);
  params.set('client_reference_id', certificate.id);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'aud');
  params.set('line_items[0][price_data][unit_amount]', String(pricing.unitAmount));
  params.set('line_items[0][price_data][product]', pricing.productId);
  params.set('line_items[0][price_data][product_data][name]', pricing.displayName);
  params.set('line_items[0][price_data][product_data][description]', pricing.description);
  params.set('metadata[certificate_id]', certificate.id);
  params.set('metadata[patient_email]', certificate.certificateDraft.email || '');
  params.set('metadata[service_type]', certificate.serviceType || 'doctor');
  params.set('metadata[patient_name]', sanitizeNameForStripe(certificate.certificateDraft.fullName));
  params.set('allow_promotion_codes', 'true');

  if (pricing.mode === 'subscription') {
    params.set('line_items[0][price_data][recurring][interval]', pricing.recurringInterval);
    params.set('line_items[0][price_data][recurring][interval_count]', String(pricing.recurringIntervalCount));
    params.set('subscription_data[metadata][certificate_id]', certificate.id);
    params.set('subscription_data[metadata][patient_email]', certificate.certificateDraft.email || '');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Stripe session create failed (${response.status})`;
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  return payload;
}

function buildDraftCertificate(requestBody) {
  const patient = requestBody.patient || {};
  const consult = requestBody.consult || {};
  const parsedStartDate = consult.startDate ? new Date(consult.startDate) : new Date();
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;

  return {
    fullName: patient.fullName || '',
    dob: patient.dob || '',
    email: patient.email || '',
    phone: patient.phone || '',
    address: patient.address || '',
    purpose: consult.purpose || '',
    symptom: consult.symptom || '',
    description: consult.description || '',
    startDate: startDate.toISOString().split('T')[0],
    durationDays: Number(consult.durationDays || 1),
  };
}

function doctorPayloadFromRequest(cert) {
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

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

function isStripeEnabled() {
  return Boolean(STRIPE_SECRET_KEY);
}

function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

function getPatientAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyPatientToken(token);
}

async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

async function requirePatient(req, res) {
  const payload = getPatientAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getPatientCertificatesForEmail(certificates, email) {
  const normalizedEmail = normalizeEmail(email);
  return certificates
    .filter((cert) => normalizeEmail(cert?.certificateDraft?.email) === normalizedEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function patientSummaryFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  return {
    id: certificate.id,
    createdAt: certificate.createdAt,
    status: certificate.status,
    serviceType: certificate.serviceType || 'doctor',
    purpose: draft.purpose || '',
    symptom: draft.symptom || '',
    description: draft.description || '',
    startDate: draft.startDate || null,
    durationDays: Number(draft.durationDays || 1),
    risk: certificate.risk || null,
    decision: certificate.decision || null,
  };
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

async function sendPatientDecisionEmail(certificate) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  if (certificate.status === 'approved') {
    const pdfBuffer = buildCertificatePdf(certificate, {
      doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      doctorNotes: certificate?.decision?.notes || '',
    });
    const html = `
      <p>Your medical certificate is ready.</p>
      <p>Request ID: <strong>${certificate.id}</strong></p>
      <p>Please find your certificate PDF attached to this email.</p>
    `;

    await sendEmail({
      to: patientEmail,
      subject: 'Your medical certificate is ready',
      html,
      text: `Your medical certificate (${certificate.id}) is ready. The certificate PDF is attached.`,
      attachments: [
        {
          filename: `medical-certificate-${certificate.id}.pdf`,
          contentBase64: pdfBuffer.toString('base64'),
        },
      ],
    });
    info('certificate.patient_email.sent', {
      certificateId: certificate.id,
      outcome: 'approved',
      provider: currentEmailProvider(),
      patientEmail,
      hasPdfAttachment: true,
    });
    return;
  }

  const html = `
    <p>Your medical certificate request has been reviewed.</p>
    <p>Request ID: <strong>${certificate.id}</strong></p>
    <p>Outcome: <strong>Not approved</strong></p>
    <p>Please book another consult if your condition changes.</p>
  `;
  await sendEmail({
    to: patientEmail,
    subject: 'Update on your medical certificate request',
    html,
    text: `Your medical certificate request (${certificate.id}) was reviewed and not approved.`,
  });
  info('certificate.patient_email.sent', {
    certificateId: certificate.id,
    outcome: 'denied',
    provider: currentEmailProvider(),
    patientEmail,
    hasPdfAttachment: false,
  });
}

async function sendPatientMoreInfoEmail(certificate, doctorEmail, notes) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  const html = `
    <p>Your doctor needs a little more information before finalising your medical certificate.</p>
    <p>Request ID: <strong>${certificate.id}</strong></p>
    <p><strong>Doctor note:</strong></p>
    <p>${String(notes || 'Please provide additional details to continue your review.').replace(/\n/g, '<br/>')}</p>
    <p>Reply with the requested details and we will continue your review.</p>
    <p>Reviewed by: ${doctorEmail}</p>
  `;

  await sendEmail({
    to: patientEmail,
    subject: 'More information requested for your medical certificate',
    html,
    text: `More information is required for request ${certificate.id}. Doctor note: ${notes || 'Please provide additional details.'}`,
  });
  info('certificate.more_info_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    patientEmail,
    doctorEmail,
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/stripe/webhook') {
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

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ received: true }));
      return;
    } catch (errorObject) {
      error('stripe.webhook.failed', {
        message: errorObject?.message || String(errorObject),
      });
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid Stripe webhook' }));
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'onya-health-backend',
      storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/certificates') {
    const body = await parseJsonBody(req);
    const patient = body.patient || {};

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const certificate = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: body,
      decision: null,
    };

    await createCertificate(certificate);
    await appendAudit({
      type: 'DOCTOR_NOTIFICATION_TRIGGERED',
      certificateId: certificate.id,
    });
    await sendDoctorReviewEmail(certificate);
    info('certificate.submitted', {
      certificateId: certificate.id,
      serviceType: certificate.serviceType,
      riskLevel: certificate.risk.level,
      riskScore: certificate.risk.score,
    });

    sendJson(res, 201, {
      id: certificate.id,
      status: certificate.status,
      risk: certificate.risk,
      message: 'Certificate submitted for doctor review',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout/session') {
    const body = await parseJsonBody(req);
    const patient = body.patient || {};

    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe is not configured on the server' });
      return;
    }

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const certificate = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'awaiting_payment',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: {
        ...body,
        payment: {
          provider: 'stripe',
          status: 'initiated',
        },
      },
      decision: null,
    };

    await createCertificate(certificate);
    const pricing = stripePricingFromRequest(body);
    const session = await createStripeCheckoutSession({ certificate, body, pricing });

    await updateCertificate(certificate.id, (current) => ({
      ...current,
      rawSubmission: {
        ...(current.rawSubmission || {}),
        payment: {
          ...(current.rawSubmission?.payment || {}),
          stripeSessionId: session.id || null,
          checkoutUrl: session.url || null,
          amount: pricing.unitAmount,
          currency: 'aud',
          mode: pricing.mode,
        },
      },
    }));

    await appendAudit({
      type: 'CHECKOUT_SESSION_CREATED',
      certificateId: certificate.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      amount: pricing.unitAmount,
      mode: pricing.mode,
    });

    const patientToken = issuePatientToken(normalizeEmail(patient.email));

    sendJson(res, 200, {
      certificateId: certificate.id,
      checkoutUrl: session.url,
      sessionId: session.id,
      patientToken,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/login') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const dob = String(body.dob || '').trim();

    if (!email) {
      sendJson(res, 400, { error: 'Email is required' });
      return;
    }

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, email);
    if (patientCertificates.length === 0) {
      sendJson(res, 404, { error: 'No patient account found for this email yet' });
      return;
    }

    const latest = patientCertificates[0];
    if (dob && latest?.certificateDraft?.dob && latest.certificateDraft.dob !== dob) {
      sendJson(res, 401, { error: 'Date of birth did not match our records' });
      return;
    }

    const token = issuePatientToken(email);
    sendJson(res, 200, {
      token,
      patient: {
        fullName: latest.certificateDraft.fullName || '',
        email,
        dob: latest.certificateDraft.dob || '',
      },
    });
    info('patient.login.success', { email });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/me') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);
    if (patientCertificates.length === 0) {
      sendJson(res, 404, { error: 'Patient account not found' });
      return;
    }

    const latest = patientCertificates[0];
    sendJson(res, 200, {
      patient: {
        fullName: latest.certificateDraft.fullName || '',
        email: normalizeEmail(patient.email),
        dob: latest.certificateDraft.dob || '',
        phone: latest.certificateDraft.phone || '',
      },
      queueCount: patientCertificates.filter((item) => isOpenForReview(item.status)).length,
      latestRequest: patientSummaryFromCertificate(latest),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/requests') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);

    sendJson(res, 200, {
      count: patientCertificates.length,
      requests: patientCertificates.map(patientSummaryFromCertificate),
    });
    return;
  }

  const patientRequestMatch = url.pathname.match(/^\/api\/patient\/requests\/([^/]+)$/);
  if (req.method === 'GET' && patientRequestMatch) {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certId = decodeURIComponent(patientRequestMatch[1]);
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
    return;
  }

  const patientMessageMatch = url.pathname.match(/^\/api\/patient\/requests\/([^/]+)\/message$/);
  if (req.method === 'POST' && patientMessageMatch) {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certId = decodeURIComponent(patientMessageMatch[1]);
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
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/login') {
    const body = await parseJsonBody(req);
    const email = String(body.email || '');
    const password = String(body.password || '');

    if (!validateDoctorCredentials(email, password)) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = issueDoctorToken(email);
    info('doctor.login.success', { email });
    sendJson(res, 200, {
      token,
      doctor: {
        email,
        name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/doctor/certificates') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const statusFilter = url.searchParams.get('status');
    const items = await listCertificates();

    const filtered = items
      .filter((item) => {
        if (!statusFilter) return true;
        if (statusFilter === 'pending') {
          return ['pending', 'submitted', 'triaged', 'assigned', 'in_review'].includes(item.status);
        }
        return item.status === statusFilter;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        serviceType: item.serviceType,
        patientName: item.certificateDraft.fullName,
        risk: item.risk,
      }));

    sendJson(res, 200, {
      doctor: doctor.email,
      count: filtered.length,
      certificates: filtered,
    });
    info('doctor.queue.loaded', {
      doctor: doctor.email,
      statusFilter: statusFilter || 'all',
      count: filtered.length,
    });
    return;
  }

  const certificateIdMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)$/);
  if (req.method === 'GET' && certificateIdMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(certificateIdMatch[1]);
    const certificate = await getCertificateById(certId);

    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    sendJson(res, 200, {
      doctor: doctor.email,
      certificate: doctorPayloadFromRequest(certificate),
    });
    return;
  }

  const autoNotesMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/auto-notes$/);
  if (req.method === 'POST' && autoNotesMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(autoNotesMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const notes = await generateDoctorNotes(certificate, doctor.email);
    info('doctor.notes.generated', {
      doctor: doctor.email,
      certificateId: certId,
      mode: 'auto-summary',
    });
    sendJson(res, 200, { notes });
    return;
  }

  const moreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/more-info$/);
  if (req.method === 'POST' && moreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(moreInfoMatch[1]);
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
    return;
  }

  const previewMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/pdf-preview$/);
  if (req.method === 'POST' && previewMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(previewMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    const previewCertificate = {
      ...certificate,
      decision: {
        ...(certificate.decision || {}),
        by: doctor.email,
        at: new Date().toISOString(),
        notes,
      },
    };

    const pdfBuffer = buildCertificatePdf(previewCertificate, {
      doctorName: doctor.email,
      doctorNotes: notes,
      isPreview: true,
    });
    info('doctor.pdf.preview.generated', {
      doctor: doctor.email,
      certificateId: certId,
      bytes: pdfBuffer.length,
    });

    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
    res.end(pdfBuffer);
    return;
  }

  const requestMoreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/request-more-info$/);
  if (req.method === 'POST' && requestMoreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(requestMoreInfoMatch[1]);
    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    if (!notes) {
      sendJson(res, 400, { error: 'Please add notes before requesting more information' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isOpenForReview(currentCertificate.status)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => ({
      ...current,
      status: 'in_review',
      decision: {
        ...(current.decision || {}),
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
    return;
  }

  const decisionMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/decision$/);
  if (req.method === 'POST' && decisionMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(decisionMatch[1]);
    const body = await parseJsonBody(req);
    const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null;
    const notes = String(body.notes || '').trim();

    if (!decision) {
      sendJson(res, 400, { error: 'Decision must be approved or denied' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isOpenForReview(currentCertificate.status)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => {
      if (!isOpenForReview(current.status)) {
        return current;
      }

      return {
        ...current,
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
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function servePortalFile(res, fileName) {
  const filePath = path.join(PORTAL_DIR, fileName);
  const html = await fs.readFile(filePath, 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

async function handlePortal(req, res, url) {
  if (req.method !== 'GET') {
    sendText(res, 404, 'Not found');
    return;
  }

  if (url.pathname === '/doctor' || url.pathname === '/doctor/login') {
    await servePortalFile(res, 'login.html');
    return;
  }

  if (url.pathname === '/doctor/queue') {
    await servePortalFile(res, 'queue.html');
    return;
  }

  if (url.pathname === '/doctor/review') {
    await servePortalFile(res, 'review.html');
    return;
  }

  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  res.on('finish', () => {
    info('http.request.completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.socket?.remoteAddress || null,
    });
  });

  try {
    const base = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url || '/', base);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handlePortal(req, res, url);
  } catch (errorObject) {
    error('http.request.unhandled_error', {
      requestId,
      method: req.method,
      url: req.url,
      message: errorObject?.message || String(errorObject),
      stack: errorObject?.stack || null,
    });
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  info('server.started', {
    appBaseUrl: APP_BASE_URL,
    doctorPortalLogin: `${APP_BASE_URL}/doctor/login`,
    storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    emailProvider: currentEmailProvider(),
    logFile: process.env.BACKEND_LOG_FILE || path.resolve(process.cwd(), 'backend', 'data', 'backend.log'),
  });
});
