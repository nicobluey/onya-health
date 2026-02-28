import crypto from 'node:crypto';

import {
  issueDoctorToken,
  issuePatientToken,
  validateDoctorCredentials,
  verifyDoctorToken,
  verifyPatientToken,
} from '../backend/lib/auth.js';
import { calculateRisk } from '../backend/lib/risk.js';
import { buildCertificatePdf } from '../backend/lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from '../backend/lib/notes.js';
import {
  appendAudit,
  createCertificate,
  getCertificateById,
  isSupabaseStorageEnabled,
  listCertificates,
  updateCertificate,
} from '../backend/lib/storage.js';
import { sendEmail } from '../backend/lib/email.js';
import { error, info } from '../backend/lib/logger.js';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

const DOCTOR_NOTIFICATION_EMAILS = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 1121);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2711);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1917);

const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.status(statusCode).json(payload);
}

function getRequestBaseUrl(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  const host = String(req.headers.host || '');
  if (!host) return 'http://localhost:3000';
  return `${protocol}://${host}`;
}

function getFrontendBaseUrl(req) {
  if (FRONTEND_BASE_URL) return FRONTEND_BASE_URL;
  return getRequestBaseUrl(req);
}

function getAppBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  return getRequestBaseUrl(req);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
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

function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function getPatientAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyPatientToken(token);
}

async function requirePatient(req, res) {
  const payload = getPatientAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

function getPatientCertificatesForEmail(certificates, email) {
  const normalizedEmail = normalizeEmail(email);
  return certificates
    .filter((cert) => normalizeEmail(cert?.certificateDraft?.email) === normalizedEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isApprovedCertificate(certificate) {
  const status = String(certificate?.status || '').toLowerCase();
  if (status === 'approved') return true;
  if (certificate?.decision?.result === 'approved') return true;
  return false;
}

function patientSummaryFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  const approved = isApprovedCertificate(certificate);

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
    certificatePdfUrl: approved
      ? `/api/patient/requests/${encodeURIComponent(certificate.id)}/certificate.pdf`
      : null,
  };
}

function doctorPayloadFromRequest(cert) {
  const dob = cert?.certificateDraft?.dob || '';
  let age = null;

  if (dob) {
    const birthday = new Date(dob);
    if (!Number.isNaN(birthday.getTime())) {
      const now = new Date();
      age = now.getFullYear() - birthday.getFullYear();
      const monthDiff = now.getMonth() - birthday.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthday.getDate())) {
        age -= 1;
      }
    }
  }

  return {
    id: cert.id,
    createdAt: cert.createdAt,
    status: cert.status,
    serviceType: cert.serviceType,
    patientName: cert.certificateDraft.fullName,
    patientEmail: cert.certificateDraft.email,
    patientDob: dob,
    patientAge: age,
    purpose: cert.certificateDraft.purpose,
    symptom: cert.certificateDraft.symptom,
    startDate: cert.certificateDraft.startDate,
    durationDays: cert.certificateDraft.durationDays,
    description: cert.certificateDraft.description,
    risk: cert.risk,
    decision: cert.decision || null,
  };
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

function isStripeEnabled() {
  return Boolean(STRIPE_SECRET_KEY);
}

async function createStripeCheckoutSession({ req, certificate, pricing }) {
  const frontendBase = getFrontendBaseUrl(req);
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  params.set('success_url', `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${frontendBase}/doctor?checkout=cancelled`);
  params.set('client_reference_id', certificate.id);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'aud');
  params.set('line_items[0][price_data][unit_amount]', String(pricing.unitAmount));
  params.set('line_items[0][price_data][product]', pricing.productId);
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
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  return payload;
}

async function fetchStripeCheckoutSession(sessionId) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured on the server');
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Unable to load Stripe session (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return payload;
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

async function fetchStripeEvent(eventId) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured');
  }

  const response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Unable to verify Stripe event (${response.status})`);
  }

  return payload;
}

async function sendDoctorReviewEmail(certificate, req) {
  const reviewUrl = `${getAppBaseUrl(req)}/doctor/login`;
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
  const patientEmail = certificate?.certificateDraft?.email;
  if (!patientEmail) return;

  if (isApprovedCertificate(certificate)) {
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

    info('certificate.patient_email.sent', {
      certificateId: certificate.id,
      outcome: 'approved',
      provider: currentEmailProvider(),
      patientEmail,
      hasPdfAttachment: true,
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

  info('certificate.patient_email.sent', {
    certificateId: certificate.id,
    outcome: 'denied',
    provider: currentEmailProvider(),
    patientEmail,
    hasPdfAttachment: false,
  });
}

async function sendPatientMoreInfoEmail(certificate, doctorEmail, notes) {
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

  info('certificate.more_info_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    patientEmail,
    doctorEmail,
  });
}

async function markPaidFromStripeSession(session, trigger, req) {
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
    await sendDoctorReviewEmail(updated, req);
    info('stripe.payment.confirmed', {
      certificateId: updated.id,
      stripeSessionId: session.id || null,
      trigger,
      status: updated.status,
    });
  }

  return { ok: true, updated: true, certificateId: updated?.id || certificateId, status: updated?.status || null };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';

  return {
    url,
    serviceRoleKey,
    anonKey,
    enabled: Boolean(url && serviceRoleKey),
  };
}

async function supabaseAuthAdminRequest(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}/auth/v1/admin/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(`Supabase auth admin request failed (${response.status}) ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function supabaseRestRequest(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(`Supabase request failed (${response.status}) ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function registerDoctorAccount({ email, password, fullName }) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    const err = new Error('Doctor registration requires Supabase service role configuration');
    err.status = 500;
    throw err;
  }

  let created;
  try {
    created = await supabaseAuthAdminRequest(config, 'users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'provider', full_name: fullName || '' },
      },
    });
  } catch (authError) {
    const message = String(authError?.message || '');
    if (authError?.status === 422 || message.toLowerCase().includes('already')) {
      const conflict = new Error('Doctor account already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw authError;
  }

  const userId = created?.user?.id || created?.id || created?.data?.user?.id || created?.data?.id;
  if (!userId) {
    const err = new Error('Unable to create doctor account');
    err.status = 500;
    throw err;
  }

  await supabaseRestRequest(config, 'profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: userId,
      role: 'provider',
    },
  });

  // Best-effort provider row upsert for projects that include this table.
  try {
    await supabaseRestRequest(config, 'providers', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: {
        id: userId,
      },
    });
  } catch {
    // Ignore if providers schema differs.
  }

  return { userId };
}

async function authenticateDoctorViaSupabase(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const loginResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const loginText = await loginResponse.text();
  let loginData = null;
  try {
    loginData = loginText ? JSON.parse(loginText) : null;
  } catch {
    loginData = null;
  }

  if (!loginResponse.ok) {
    return null;
  }

  const userId = loginData?.user?.id;
  if (!userId) return null;

  let role = String(loginData?.user?.user_metadata?.role || '').toLowerCase();
  if (config.enabled) {
    try {
      const rows = await supabaseRestRequest(
        config,
        `profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      );
      role = String(rows?.[0]?.role || role).toLowerCase();
    } catch {
      // Ignore profile lookup errors and fallback to auth metadata role.
    }
  }

  if (!['provider', 'admin', 'doctor'].includes(role)) {
    return null;
  }

  return {
    email: normalizeEmail(loginData?.user?.email || email),
  };
}

function parseApiRoute(req) {
  const url = new URL(req.url || '/api', getRequestBaseUrl(req));
  const forcedPath = String(url.searchParams.get('__route') || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const directPath = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const routePath = (forcedPath || directPath).replace(/^index\/?/, '');
  const segments = routePath ? routePath.split('/').filter(Boolean) : [];
  return { url, routePath, segments };
}

function getStatusFilterFromUrl(url) {
  const value = url.searchParams.get('status');
  return value ? String(value) : null;
}

function isPdfPath(segments) {
  return segments.length === 4 && segments[0] === 'patient' && segments[1] === 'requests' && segments[3] === 'certificate.pdf';
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { url, routePath, segments } = parseApiRoute(req);

  try {
    if (req.method === 'GET' && routePath === 'health') {
      sendJson(res, 200, {
        ok: true,
        service: 'onya-health-backend',
        runtime: 'vercel-function',
        storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'stripe/webhook') {
      try {
        const signature = req.headers['stripe-signature'];
        let event = null;

        try {
          const rawBody = await parseRawBody(req);
          event = verifyStripeEvent(rawBody, signature);
        } catch (signatureError) {
          const parsedBody = req.body && typeof req.body === 'object' ? req.body : null;
          const eventId = parsedBody?.id;
          if (!eventId) {
            throw signatureError;
          }
          event = await fetchStripeEvent(eventId);
          info('stripe.webhook.signature_fallback', {
            eventId,
            message: signatureError?.message || String(signatureError),
          });
        }

        if (event?.type === 'checkout.session.completed') {
          const session = event?.data?.object || {};
          await markPaidFromStripeSession(session, 'stripe_webhook', req);
        }

        sendJson(res, 200, { received: true });
        return;
      } catch (err) {
        error('stripe.webhook.failed', {
          message: err?.message || String(err),
        });
        sendJson(res, 400, { error: err?.message || 'Invalid Stripe webhook' });
        return;
      }
    }

    if (req.method === 'POST' && routePath === 'checkout/session') {
      if (!isStripeEnabled()) {
        sendJson(res, 500, { error: 'Stripe is not configured on the server' });
        return;
      }

      const body = await parseJsonBody(req);
      const patient = body?.patient || {};

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
      const session = await createStripeCheckoutSession({ req, certificate, pricing });

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

      info('checkout.session.created', {
        certificateId: certificate.id,
        stripeSessionId: session.id || null,
        mode: pricing.mode,
        amount: pricing.unitAmount,
      });

      sendJson(res, 200, {
        certificateId: certificate.id,
        checkoutUrl: session.url,
        sessionId: session.id,
        patientToken,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'checkout/confirm') {
      const body = await parseJsonBody(req);
      const sessionId =
        String(url.searchParams.get('session_id') || '').trim() ||
        String(body?.sessionId || body?.session_id || '').trim();

      if (!sessionId) {
        sendJson(res, 400, { error: 'session_id is required' });
        return;
      }

      const session = await fetchStripeCheckoutSession(sessionId);
      const paymentStatus = String(session?.payment_status || '').toLowerCase();
      if (!['paid', 'no_payment_required'].includes(paymentStatus)) {
        sendJson(res, 409, {
          error: 'Payment is not completed yet',
          paymentStatus: session?.payment_status || null,
        });
        return;
      }

      const result = await markPaidFromStripeSession(session, 'checkout_success_confirm', req);
      sendJson(res, 200, {
        ok: true,
        sessionId,
        paymentStatus: session?.payment_status || null,
        certificateId: result?.certificateId || null,
        status: result?.status || null,
        updated: Boolean(result?.updated),
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/login') {
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

    if (req.method === 'GET' && routePath === 'patient/me') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certificates = await listCertificates();
      const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);
      if (patientCertificates.length === 0) {
        sendJson(res, 404, { error: 'Patient not found' });
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
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/requests') {
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

    if (req.method === 'GET' && segments.length === 3 && segments[0] === 'patient' && segments[1] === 'requests') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'patient' && segments[1] === 'requests' && segments[3] === 'message') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'GET' && isPdfPath(segments)) {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
      const certificate = await getCertificateById(certId);
      if (!certificate) {
        sendJson(res, 404, { error: 'Request not found' });
        return;
      }
      if (normalizeEmail(certificate?.certificateDraft?.email) !== normalizeEmail(patient.email)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!isApprovedCertificate(certificate)) {
        sendJson(res, 409, { error: 'Certificate is not ready yet' });
        return;
      }

      const pdfBuffer = buildCertificatePdf(certificate, {
        doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        doctorNotes: certificate?.decision?.notes || '',
      });

      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="medical-certificate-${certificate.id}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/register') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const fullName = String(body.fullName || body.name || '').trim();

      if (!email || !password) {
        sendJson(res, 400, { error: 'Email and password are required' });
        return;
      }
      if (password.length < 8) {
        sendJson(res, 400, { error: 'Password must be at least 8 characters' });
        return;
      }

      await registerDoctorAccount({ email, password, fullName });
      const token = issueDoctorToken(email);
      info('doctor.register.success', { email });
      sendJson(res, 201, {
        token,
        doctor: {
          email,
          name: fullName || email,
        },
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/login') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');

      let authenticatedEmail = null;
      if (validateDoctorCredentials(email, password)) {
        authenticatedEmail = email;
      } else {
        const supabaseAuth = await authenticateDoctorViaSupabase(email, password);
        if (supabaseAuth?.email) {
          authenticatedEmail = supabaseAuth.email;
        }
      }

      if (!authenticatedEmail) {
        sendJson(res, 401, { error: 'Invalid credentials' });
        return;
      }

      const token = issueDoctorToken(authenticatedEmail);
      info('doctor.login.success', { email: authenticatedEmail });
      sendJson(res, 200, {
        token,
        doctor: {
          email: authenticatedEmail,
          name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        },
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'doctor/certificates') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const statusFilter = getStatusFilterFromUrl(url);
      const items = await listCertificates();

      const filtered = items
        .filter((item) => {
          if (!statusFilter) return true;
          if (statusFilter === 'pending') {
            return isOpenForReview(item.status);
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
          assignedTo: item?.rawSubmission?.workflow?.assignedTo || null,
        }));

      sendJson(res, 200, {
        doctor: doctor.email,
        count: filtered.length,
        certificates: filtered,
      });
      return;
    }

    if (req.method === 'GET' && segments.length === 3 && segments[0] === 'doctor' && segments[1] === 'certificates') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'assign') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }
      if (!isOpenForReview(current.status)) {
        sendJson(res, 409, { error: 'Certificate already reviewed', status: current.status });
        return;
      }

      const updated = await updateCertificate(certId, (item) => ({
        ...item,
        status: 'assigned',
        rawSubmission: {
          ...(item.rawSubmission || {}),
          workflow: {
            ...(item.rawSubmission?.workflow || {}),
            assignedTo: doctor.email,
            assignedAt: new Date().toISOString(),
          },
        },
      }));

      await appendAudit({
        type: 'CERTIFICATE_ASSIGNED',
        certificateId: certId,
        by: doctor.email,
      });

      sendJson(res, 200, {
        message: 'Certificate assigned to you',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'close') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }

      if (!['approved', 'denied'].includes(String(current.status || '').toLowerCase())) {
        sendJson(res, 409, {
          error: 'Approve or deny the certificate before closing it',
          status: current.status,
        });
        return;
      }

      const updated = await updateCertificate(certId, (item) => ({
        ...item,
        rawSubmission: {
          ...(item.rawSubmission || {}),
          workflow: {
            ...(item.rawSubmission?.workflow || {}),
            closedBy: doctor.email,
            closedAt: new Date().toISOString(),
          },
        },
      }));

      await appendAudit({
        type: 'CERTIFICATE_CLOSED',
        certificateId: certId,
        by: doctor.email,
      });

      sendJson(res, 200, {
        message: 'Certificate closed',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'auto-notes') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'more-info') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'request-more-info') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

      await appendAudit({
        type: 'MORE_INFO_REQUESTED',
        certificateId: updated.id,
        by: doctor.email,
        notes,
      });
      await sendPatientMoreInfoEmail(updated, doctor.email, notes);

      sendJson(res, 200, {
        message: 'More information request sent to patient',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'pdf-preview') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'decision') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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
        if (!isOpenForReview(item.status)) return item;

        return {
          ...item,
          status: decision,
          decision: {
            by: doctor.email,
            at: new Date().toISOString(),
            notes,
            result: decision,
          },
        };
      });

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
  } catch (err) {
    error('api.request.failed', {
      method: req.method,
      routePath,
      message: err?.message || String(err),
      status: err?.status || null,
      data: err?.data || null,
    });
    sendJson(res, err?.status || 500, { error: err?.message || 'Internal server error' });
  }
}
