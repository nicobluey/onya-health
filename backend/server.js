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
import {
  authenticatePatientAccount,
  createPatientAccount,
  getPatientAccountByEmail,
  isLikelyEmail as isLikelyPatientEmail,
  issuePasswordResetToken,
  resetPasswordWithToken,
  setPatientAccountPassword,
  updatePatientAccountProfile,
} from './lib/patient-auth.js';
import {
  authenticateDoctorAccount,
  createDoctorAccount,
  getDoctorAccountByEmail,
  isLikelyEmail as isLikelyDoctorEmail,
  issueDoctorPasswordResetToken,
  listDoctorEmails,
  resetDoctorPasswordWithToken,
} from './lib/doctor-auth.js';
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
import {
  renderDoctorPatientMessageEmail,
  renderDoctorPasswordResetEmail,
  renderDoctorReviewEmail,
  renderDoctorWelcomeEmail,
  renderPatientCertificateDeniedEmail,
  renderPatientCertificateReadyEmail,
  renderPatientMoreInfoEmail,
  renderPatientPasswordResetEmail,
  renderPatientWelcomeEmail,
} from './lib/email-templates.js';
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
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`)
  .trim()
  .replace(/\/$/, '');
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '*').trim();
const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const DOCTOR_NOTIFICATION_EMAILS_CONFIGURED = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';
const CERTIFICATE_TIME_ZONE = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 1121);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2711);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1917);
const STRIPE_AMOUNT_CARER_CERT_AUD_CENTS = Math.max(
  0,
  Number(process.env.STRIPE_AMOUNT_CARER_CERT_AUD_CENTS || 1000)
);
const PATIENT_PASSWORD_RESET_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.PATIENT_PASSWORD_RESET_TTL_MS || 1000 * 60 * 60)
);
const PATIENT_PASSWORD_RESET_PATH = process.env.PATIENT_PASSWORD_RESET_PATH || '/patient/reset-password';
const DOCTOR_PASSWORD_RESET_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.DOCTOR_PASSWORD_RESET_TTL_MS || 1000 * 60 * 60)
);
const DOCTOR_PASSWORD_RESET_PATH = process.env.DOCTOR_PASSWORD_RESET_PATH || '/doctor/login';
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);

const PORTAL_DIR = path.resolve(process.cwd(), 'backend', 'doctor-portal');

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'null') return '';
  if (raw === '*') return '*';

  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return '';
  }
}

function parseCorsOrigins(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const tokens = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokens.includes('*')) return ['*'];

  const origins = [];
  for (const token of tokens) {
    const origin = normalizeOrigin(token);
    if (origin && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

function buildAllowedCorsOrigins() {
  const configuredOrigins = parseCorsOrigins(CORS_ORIGIN);
  if (configuredOrigins.includes('*')) return ['*'];

  const derivedOrigins = [
    ...configuredOrigins,
    normalizeOrigin(FRONTEND_BASE_URL),
    normalizeOrigin(APP_BASE_URL),
    normalizeOrigin(process.env.VERCEL_URL),
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  ].filter(Boolean);

  return Array.from(new Set(derivedOrigins));
}

const ALLOWED_CORS_ORIGINS = buildAllowedCorsOrigins();
const DEFAULT_CORS_ORIGIN = ALLOWED_CORS_ORIGINS[0] || '';

function appendVaryHeader(res, headerName) {
  const existingValue = String(res.getHeader('Vary') || '');
  const parts = existingValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.includes(headerName)) {
    parts.push(headerName);
    res.setHeader('Vary', parts.join(', '));
  }
}

function resolveCorsOrigin(req, res) {
  if (ALLOWED_CORS_ORIGINS.includes('*')) return '*';

  const request = req || res?.req;
  const requestOrigin = normalizeOrigin(request?.headers?.origin || '');
  if (requestOrigin && ALLOWED_CORS_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (requestOrigin) return '';
  return DEFAULT_CORS_ORIGIN;
}

function setCors(res, req) {
  const existingOrigin = normalizeOrigin(res.getHeader('Access-Control-Allow-Origin') || '');
  const allowedOrigin = req ? resolveCorsOrigin(req, res) : existingOrigin || resolveCorsOrigin(req, res);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else {
    res.removeHeader('Access-Control-Allow-Origin');
  }
  if (allowedOrigin && allowedOrigin !== '*') {
    appendVaryHeader(res, 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
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
  const includeCarerCertificate = !isUnlimited && Boolean(body?.consult?.includeCarerCertificate);
  const carerCertificateAmount = includeCarerCertificate ? STRIPE_AMOUNT_CARER_CERT_AUD_CENTS : 0;

  if (isUnlimited) {
    return {
      mode: 'subscription',
      baseUnitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      carerCertificateAmount: 0,
      includeCarerCertificate: false,
      unitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING,
      displayName: 'Onyahealth Pro',
      description: 'Recurring medical certificate support',
      recurringInterval: 'day',
      recurringIntervalCount: 26,
    };
  }

  if (durationDays <= 1) {
    const baseUnitAmount = STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS;
    return {
      mode: 'payment',
      baseUnitAmount,
      carerCertificateAmount,
      includeCarerCertificate,
      unitAmount: baseUnitAmount + carerCertificateAmount,
      productId: STRIPE_PRICE_PRODUCT_SINGLE_DAY,
      displayName: 'Medical Consultation (Single day)',
      description: 'One-day medical certificate request',
    };
  }

  const baseUnitAmount = STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS;
  return {
    mode: 'payment',
    baseUnitAmount,
    carerCertificateAmount,
    includeCarerCertificate,
    unitAmount: baseUnitAmount + carerCertificateAmount,
    productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF,
    displayName: 'Medical Consultation (Multi-day)',
    description: 'Multi-day medical certificate request',
  };
}

async function createStripeCheckoutSession({ certificate, pricing, uiMode = 'hosted' }) {
  const frontendBase = getFrontendBaseUrl();
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  if (uiMode === 'embedded') {
    params.set('ui_mode', 'embedded');
    params.set(
      'return_url',
      `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.set('redirect_on_completion', 'if_required');
  } else {
    params.set(
      'success_url',
      `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.set('cancel_url', `${frontendBase}/doctor?checkout=cancelled`);
  }
  params.set('client_reference_id', certificate.id);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'aud');
  params.set('line_items[0][price_data][unit_amount]', String(pricing.unitAmount));
  params.set('line_items[0][price_data][product]', pricing.productId);
  params.set('metadata[certificate_id]', certificate.id);
  params.set('metadata[verification_code]', getCertificateVerificationCode(certificate));
  params.set('metadata[patient_email]', certificate.certificateDraft.email || '');
  params.set('metadata[service_type]', certificate.serviceType || 'doctor');
  params.set('metadata[patient_name]', sanitizeNameForStripe(certificate.certificateDraft.fullName));
  params.set('metadata[include_carer_certificate]', pricing.includeCarerCertificate ? 'true' : 'false');
  params.set('metadata[carer_certificate_amount]', String(pricing.carerCertificateAmount || 0));
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

function formatDateInCertificateTimezone(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CERTIFICATE_TIME_ZONE }).format(value);
}

function normalizeCertificateStartDate(value) {
  const todayDate = formatDateInCertificateTimezone(new Date());
  const rawDate = String(value || '').trim();
  const parsedDatePattern = rawDate.match(/\d{4}-\d{2}-\d{2}/);
  if (parsedDatePattern?.[0]) {
    return parsedDatePattern[0] < todayDate ? todayDate : parsedDatePattern[0];
  }

  const parsed = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(parsed.getTime())) return todayDate;

  const candidateDate = formatDateInCertificateTimezone(parsed);
  return candidateDate < todayDate ? todayDate : candidateDate;
}

function buildDraftCertificate(requestBody) {
  const patient = requestBody.patient || {};
  const consult = requestBody.consult || {};
  const startDate = normalizeCertificateStartDate(consult.startDate);
  const durationDays = Math.max(1, Number(consult.durationDays || 1));
  const isUnlimited = Boolean(consult.isUnlimited);
  const includeCarerCertificate = !isUnlimited && Boolean(consult.includeCarerCertificate);
  const symptomVisibility = String(consult.symptomVisibility || '').trim().toLowerCase() === 'public'
    ? 'public'
    : 'private';

  return {
    fullName: patient.fullName || '',
    dob: patient.dob || '',
    email: patient.email || '',
    phone: patient.phone || '',
    address: patient.address || '',
    purpose: consult.purpose || '',
    symptom: consult.symptom || '',
    symptomVisibility,
    description: consult.description || '',
    startDate,
    durationDays,
    includeCarerCertificate,
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
    symptomVisibility: cert.certificateDraft.symptomVisibility || 'private',
    startDate: cert.certificateDraft.startDate,
    durationDays: cert.certificateDraft.durationDays,
    verificationCode: getCertificateVerificationCode(cert),
    description: cert.certificateDraft.description,
    risk: cert.risk,
    decision: cert.decision || null,
  };
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function currentEmailProvider() {
  if (String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_USER || '').trim() && String(process.env.SMTP_PASS || '').trim()) {
    return 'smtp';
  }
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

function getFrontendBaseUrl() {
  const configuredOrigin = normalizeOrigin(FRONTEND_BASE_URL);
  if (configuredOrigin && configuredOrigin !== '*') {
    return configuredOrigin;
  }

  if (DEFAULT_CORS_ORIGIN && DEFAULT_CORS_ORIGIN !== '*') {
    return DEFAULT_CORS_ORIGIN;
  }

  return APP_BASE_URL;
}

function buildPatientPasswordResetUrl(token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(PATIENT_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  return `${getFrontendBaseUrl()}${pathSegment}?token=${encodedToken}`;
}

function buildDoctorPasswordResetUrl(token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(DOCTOR_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const baseUrl = String(APP_BASE_URL || '').replace(/\/$/, '');
  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  const joiner = pathSegment.includes('?') ? '&' : '?';
  return `${baseUrl}${pathSegment}${joiner}token=${encodedToken}`;
}

async function resolveDoctorNotificationEmails() {
  const dynamicDoctorEmails = await listDoctorEmails();
  const deduped = Array.from(
    new Set(
      [...DOCTOR_NOTIFICATION_EMAILS_CONFIGURED, ...dynamicDoctorEmails]
        .map((email) => normalizeEmail(email))
        .filter((email) => isLikelyDoctorEmail(email))
    )
  );

  if (deduped.length === 0) {
    return ['doctor@onyahealth.com'];
  }
  return deduped;
}

function normalizeVerificationCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function buildCertificateVerificationCode(certificateId) {
  const normalizedId = normalizeVerificationCode(certificateId);
  const suffix = (normalizedId.slice(-8) || crypto.randomBytes(4).toString('hex').toUpperCase())
    .padStart(8, '0')
    .slice(-8);
  return `ONYA${suffix}`;
}

function getCertificateVerificationCode(certificate) {
  const existing = normalizeVerificationCode(certificate?.rawSubmission?.verificationCode);
  if (existing.startsWith('ONYA')) return existing;
  return buildCertificateVerificationCode(certificate?.id || '');
}

function maskPatientName(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Unavailable';
  return parts
    .map((part) => `${part.slice(0, 1).toUpperCase()}${'*'.repeat(Math.max(1, part.length - 1))}`)
    .join(' ');
}

function isApprovedCertificate(certificate) {
  const status = String(certificate?.status || '').toLowerCase();
  if (status === 'approved') return true;
  if (certificate?.decision?.result === 'approved') return true;
  return false;
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
    symptomVisibility: draft.symptomVisibility || 'private',
    description: draft.description || '',
    startDate: draft.startDate || null,
    durationDays: Number(draft.durationDays || 1),
    verificationCode: getCertificateVerificationCode(certificate),
    risk: certificate.risk || null,
    decision: certificate.decision || null,
  };
}

function buildPatientIdentity({ email, latestCertificate, account }) {
  const draft = latestCertificate?.certificateDraft || {};
  return {
    fullName: String(account?.fullName || draft.fullName || '').trim(),
    email: normalizeEmail(email || account?.email || draft.email || ''),
    dob: String(account?.dob || draft.dob || '').trim(),
    phone: String(account?.phone || draft.phone || '').trim(),
  };
}

function createBootstrapPassword() {
  return `Temp${crypto.randomBytes(12).toString('hex')}9A`;
}

async function resolveDoctorProfile(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return getDoctorAccountByEmail(normalizedEmail);
}

function resolveDoctorDisplayName(account, fallbackEmail = '') {
  return (
    String(account?.fullName || '').trim() ||
    normalizeEmail(fallbackEmail) ||
    process.env.DOCTOR_DISPLAY_NAME ||
    'Onya Health Doctor'
  );
}

async function sendDoctorReviewEmail(certificate) {
  const reviewUrl = `${APP_BASE_URL}/doctor/login`;
  const recipients = await resolveDoctorNotificationEmails();
  const emailContent = renderDoctorReviewEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
    patientName: certificate.certificateDraft.fullName || 'Unknown patient',
    riskLabel: `${certificate.risk.level} (${certificate.risk.score})`,
    reviewUrl,
  });

  await sendEmail({
    to: recipients,
    subject: `Medical certificate review needed: ${certificate.id}`,
    html: emailContent.html,
    text: emailContent.text,
  });
  info('certificate.doctor_review_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    recipients,
  });
}

async function sendPatientDecisionEmail(certificate) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  if (certificate.status === 'approved') {
    const verificationCode = getCertificateVerificationCode(certificate);
    try {
      const pdfBuffer = await buildCertificatePdf(certificate, {
        doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        doctorNotes: certificate?.decision?.notes || '',
        providerType: certificate?.decision?.providerType || '',
        registrationNumber: certificate?.decision?.registrationNumber || '',
        verificationCode,
        verifyUrl: `${getFrontendBaseUrl()}/verify?code=${encodeURIComponent(verificationCode)}`,
      });
      const emailContent = renderPatientCertificateReadyEmail({
        baseUrl: getFrontendBaseUrl(),
        requestId: certificate.id,
        attachmentIncluded: true,
      });

      await sendEmail({
        to: patientEmail,
        subject: 'Your medical certificate is ready',
        html: emailContent.html,
        text: emailContent.text,
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
    } catch (errorObject) {
      error('certificate.patient_email.attachment_failed', {
        certificateId: certificate.id,
        patientEmail,
        message: errorObject?.message || String(errorObject),
      });

      const fallbackContent = renderPatientCertificateReadyEmail({
        baseUrl: getFrontendBaseUrl(),
        requestId: certificate.id,
        attachmentIncluded: false,
      });
      await sendEmail({
        to: patientEmail,
        subject: 'Your medical certificate is ready',
        html: fallbackContent.html,
        text: fallbackContent.text,
      });
      info('certificate.patient_email.sent', {
        certificateId: certificate.id,
        outcome: 'approved',
        provider: currentEmailProvider(),
        patientEmail,
        hasPdfAttachment: false,
        fallbackNoAttachment: true,
      });
      return;
    }
  }

  const emailContent = renderPatientCertificateDeniedEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
  });
  await sendEmail({
    to: patientEmail,
    subject: 'Update on your medical certificate request',
    html: emailContent.html,
    text: emailContent.text,
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
  const emailContent = renderPatientMoreInfoEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
    doctorEmail,
    notes,
  });

  await sendEmail({
    to: patientEmail,
    subject: 'More information requested for your medical certificate',
    html: emailContent.html,
    text: emailContent.text,
  });
  info('certificate.more_info_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    patientEmail,
    doctorEmail,
  });
}

async function markPaidFromStripeSession(session, trigger = 'stripe_event') {
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
    return {
      ok: true,
      updated: false,
      certificateId,
      status: current.status,
      patientEmail: normalizeEmail(current?.certificateDraft?.email || ''),
    };
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
    status: updated?.status || null,
    patientEmail: normalizeEmail(updated?.certificateDraft?.email || current?.certificateDraft?.email || ''),
  };
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
    const errorObject = new Error(message);
    errorObject.status = response.status;
    throw errorObject;
  }

  return payload;
}

async function handleApi(req, res, url) {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
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
        await markPaidFromStripeSession(session, 'stripe_webhook');
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

  if (req.method === 'GET' && url.pathname === '/api/certificates/verify') {
    const verificationCode = normalizeVerificationCode(url.searchParams.get('code') || '');
    if (!verificationCode) {
      sendJson(res, 400, { valid: false, error: 'Verification code is required' });
      return;
    }

    const certificates = await listCertificates();
    const certificate = certificates.find(
      (item) => getCertificateVerificationCode(item) === verificationCode
    );
    if (!certificate) {
      sendJson(res, 404, { valid: false, error: 'Certificate not found' });
      return;
    }
    if (!isApprovedCertificate(certificate)) {
      sendJson(res, 409, {
        valid: false,
        error: 'Certificate is not approved',
        status: certificate.status || null,
      });
      return;
    }

    const issuedAt = certificate?.decision?.at || certificate.createdAt || new Date().toISOString();
    sendJson(res, 200, {
      valid: true,
      certificate: {
        code: verificationCode,
        certificateId: certificate.id,
        issuedAt,
        status: certificate.status,
        startDate: certificate?.certificateDraft?.startDate || null,
        durationDays: Number(certificate?.certificateDraft?.durationDays || 1),
        purpose: certificate?.certificateDraft?.purpose || '',
        patient: maskPatientName(certificate?.certificateDraft?.fullName || ''),
        doctorName:
          String(certificate?.decision?.by || '').trim() ||
          process.env.DOCTOR_DISPLAY_NAME ||
          'Onya Health Doctor',
        providerType: String(certificate?.decision?.providerType || '').trim(),
        registrationNumber: String(certificate?.decision?.registrationNumber || '')
          .trim()
          .toUpperCase(),
      },
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
    const certificateId = crypto.randomUUID();
    const verificationCode = buildCertificateVerificationCode(certificateId);
    const certificate = {
      id: certificateId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: {
        ...body,
        verificationCode,
      },
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
      verificationCode,
      status: certificate.status,
      risk: certificate.risk,
      message: 'Certificate submitted for doctor review',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout/session') {
    const body = await parseJsonBody(req);
    const requestedUiMode = body?.uiMode === 'embedded' ? 'embedded' : 'hosted';
    const patient = body.patient || {};
    const certificateDraft = buildDraftCertificate(body);
    body.consult = {
      ...(body?.consult || {}),
      startDate: certificateDraft.startDate,
      durationDays: certificateDraft.durationDays,
      includeCarerCertificate: certificateDraft.includeCarerCertificate,
    };

    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe is not configured on the server' });
      return;
    }

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const pricing = stripePricingFromRequest(body);
    const certificateId = crypto.randomUUID();
    const verificationCode = buildCertificateVerificationCode(certificateId);
    const certificate = {
      id: certificateId,
      createdAt: new Date().toISOString(),
      status: 'awaiting_payment',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft,
      rawSubmission: {
        ...body,
        verificationCode,
        payment: {
          provider: 'stripe',
          status: 'initiated',
          amount: pricing.unitAmount,
          baseAmount: pricing.baseUnitAmount,
          carerCertificateAmount: pricing.carerCertificateAmount,
          includeCarerCertificate: pricing.includeCarerCertificate,
          currency: 'aud',
          mode: pricing.mode,
        },
      },
      decision: null,
    };

    const sessionPromise = createStripeCheckoutSession({ certificate, pricing, uiMode: requestedUiMode });
    const persistPromise = createCertificate(certificate);
    const [session] = await Promise.all([sessionPromise, persistPromise]);

    appendAudit({
      type: 'CHECKOUT_SESSION_CREATED',
      certificateId: certificate.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      amount: pricing.unitAmount,
      mode: pricing.mode,
      includeCarerCertificate: pricing.includeCarerCertificate,
    }).catch((auditError) => {
      error('checkout.session.audit_failed', {
        certificateId: certificate.id,
        message: auditError?.message || String(auditError),
      });
    });

    sendJson(res, 200, {
      certificateId: certificate.id,
      verificationCode,
      checkoutUrl: session.url,
      sessionId: session.id,
      clientSecret: session.client_secret || null,
      uiMode: requestedUiMode,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout/confirm') {
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

    const result = await markPaidFromStripeSession(session, 'checkout_success_confirm');
    const patientEmail = normalizeEmail(result?.patientEmail || session?.metadata?.patient_email || '');
    sendJson(res, 200, {
      ok: true,
      sessionId,
      paymentStatus: session?.payment_status || null,
      certificateId: result?.certificateId || null,
      status: result?.status || null,
      updated: Boolean(result?.updated),
      patientEmail,
      requiresAccountSetup: Boolean(patientEmail),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/checkout/account/setup') {
    const body = await parseJsonBody(req);
    const sessionId = String(body?.sessionId || body?.session_id || '').trim();
    const email = normalizeEmail(body?.email);
    const confirmEmail = normalizeEmail(body?.confirmEmail || body?.confirm_email || '');
    const password = String(body?.password || '');

    if (!sessionId || !email || !confirmEmail || !password) {
      sendJson(res, 400, { error: 'sessionId, email, confirmEmail, and password are required' });
      return;
    }

    if (email !== confirmEmail) {
      sendJson(res, 400, { error: 'Email confirmation does not match' });
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

    const result = await markPaidFromStripeSession(session, 'checkout_account_setup');
    const expectedEmail = normalizeEmail(result?.patientEmail || session?.metadata?.patient_email || '');
    if (!expectedEmail) {
      sendJson(res, 400, { error: 'Unable to determine the patient email for this checkout' });
      return;
    }
    if (email !== expectedEmail) {
      sendJson(res, 400, { error: `Email must match the consult email (${expectedEmail})` });
      return;
    }

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, expectedEmail);
    const latest = patientCertificates[0] || null;
    const fullName = String(latest?.certificateDraft?.fullName || '').trim();
    const dob = String(latest?.certificateDraft?.dob || '').trim();
    const phone = String(latest?.certificateDraft?.phone || '').trim();

    let account = await getPatientAccountByEmail(expectedEmail);
    if (account) {
      try {
        account = await setPatientAccountPassword({ email: expectedEmail, password });
      } catch (errorObject) {
        if (errorObject?.code === 'PASSWORD_INVALID') {
          sendJson(res, 400, { error: errorObject.message });
          return;
        }
        throw errorObject;
      }
      await updatePatientAccountProfile({
        email: expectedEmail,
        fullName,
        dob,
        phone,
      });
    } else {
      try {
        account = await createPatientAccount({
          email: expectedEmail,
          password,
          fullName,
          dob,
          phone,
        });
      } catch (errorObject) {
        if (errorObject?.code === 'PASSWORD_INVALID') {
          sendJson(res, 400, { error: errorObject.message });
          return;
        }
        if (errorObject?.code === 'ACCOUNT_EXISTS') {
          account = await setPatientAccountPassword({ email: expectedEmail, password });
          await updatePatientAccountProfile({
            email: expectedEmail,
            fullName,
            dob,
            phone,
          });
        } else {
          throw errorObject;
        }
      }
    }

    const patientToken = issuePatientToken(expectedEmail);
    await appendAudit({
      type: 'PATIENT_ACCOUNT_SETUP_FROM_CHECKOUT',
      email: expectedEmail,
      stripeSessionId: sessionId,
    });

    sendJson(res, 200, {
      ok: true,
      token: patientToken,
      patientEmail: expectedEmail,
      patient: buildPatientIdentity({
        email: expectedEmail,
        latestCertificate: latest,
        account: account || null,
      }),
    });
    info('patient.checkout_account_setup.completed', {
      email: expectedEmail,
      stripeSessionId: sessionId,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/login') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const dob = String(body.dob || '').trim();
    const password = String(body.password || '');

    if (!email) {
      sendJson(res, 400, { error: 'Email is required' });
      return;
    }

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, email);
    const latest = patientCertificates[0] || null;

    if (password) {
      const account = await authenticatePatientAccount({ email, password });
      if (!account) {
        sendJson(res, 401, { error: 'Invalid email or password' });
        return;
      }

      if (latest?.certificateDraft) {
        await updatePatientAccountProfile({
          email,
          fullName: latest.certificateDraft.fullName || '',
          dob: latest.certificateDraft.dob || '',
          phone: latest.certificateDraft.phone || '',
        });
      }

      const token = issuePatientToken(email);
      sendJson(res, 200, {
        token,
        patient: buildPatientIdentity({
          email,
          latestCertificate: latest,
          account,
        }),
      });
      info('patient.login.success', { email, method: 'password' });
      return;
    }

    if (patientCertificates.length === 0) {
      sendJson(res, 404, { error: 'No patient account found for this email yet' });
      return;
    }

    if (latest?.certificateDraft?.dob && !dob) {
      sendJson(res, 400, { error: 'Date of birth is required for this account' });
      return;
    }
    if (dob && latest?.certificateDraft?.dob && latest.certificateDraft.dob !== dob) {
      sendJson(res, 401, { error: 'Date of birth did not match our records' });
      return;
    }

    await updatePatientAccountProfile({
      email,
      fullName: latest?.certificateDraft?.fullName || '',
      dob: latest?.certificateDraft?.dob || '',
      phone: latest?.certificateDraft?.phone || '',
    });

    const token = issuePatientToken(email);
    sendJson(res, 200, {
      token,
      patient: buildPatientIdentity({ email, latestCertificate: latest, account: null }),
    });
    info('patient.login.success', { email, method: 'dob' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/register') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.name || '').trim();
    const dob = String(body.dob || '').trim();
    const phone = String(body.phone || '').trim();

    if (!isLikelyPatientEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    let account;
    try {
      account = await createPatientAccount({
        email,
        password,
        fullName,
        dob,
        phone,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'ACCOUNT_EXISTS') {
        sendJson(res, 409, { error: 'An account already exists for this email' });
        return;
      }
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'PATIENT_ACCOUNT_CREATED',
      email,
    });

    try {
      const welcomeEmail = renderPatientWelcomeEmail({
        baseUrl: getFrontendBaseUrl(),
        fullName: account.fullName || fullName,
      });
      await sendEmail({
        to: email,
        subject: 'Welcome to Onya Health',
        html: welcomeEmail.html,
        text: welcomeEmail.text,
      });
    } catch (errorObject) {
      error('patient.register.welcome_email_failed', {
        email,
        message: errorObject?.message || String(errorObject),
      });
    }

    const token = issuePatientToken(email);
    sendJson(res, 201, {
      token,
      patient: buildPatientIdentity({ email, latestCertificate: null, account }),
    });
    info('patient.register.success', { email });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/password/reset/request') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);

    if (!isLikelyPatientEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    let resetPayload = await issuePasswordResetToken(email, PATIENT_PASSWORD_RESET_TTL_MS);
    if (!resetPayload) {
      const certificates = await listCertificates();
      const patientCertificates = getPatientCertificatesForEmail(certificates, email);
      const latest = patientCertificates[0] || null;

      if (latest?.certificateDraft?.email) {
        try {
          await createPatientAccount({
            email,
            password: createBootstrapPassword(),
            fullName: latest.certificateDraft.fullName || '',
            dob: latest.certificateDraft.dob || '',
            phone: latest.certificateDraft.phone || '',
          });
        } catch (errorObject) {
          if (errorObject?.code !== 'ACCOUNT_EXISTS') {
            throw errorObject;
          }
        }

        await updatePatientAccountProfile({
          email,
          fullName: latest.certificateDraft.fullName || '',
          dob: latest.certificateDraft.dob || '',
          phone: latest.certificateDraft.phone || '',
        });

        resetPayload = await issuePasswordResetToken(email, PATIENT_PASSWORD_RESET_TTL_MS);
        if (resetPayload) {
          await appendAudit({
            type: 'PATIENT_ACCOUNT_BOOTSTRAPPED_FOR_RESET',
            email,
          });
        }
      }
    }

    if (resetPayload) {
      const resetUrl = buildPatientPasswordResetUrl(resetPayload.token);
      const resetEmail = renderPatientPasswordResetEmail({
        baseUrl: getFrontendBaseUrl(),
        resetUrl,
        expiresMinutes: String(Math.round(PATIENT_PASSWORD_RESET_TTL_MS / (1000 * 60))),
      });
      await sendEmail({
        to: email,
        subject: 'Reset your Onya Health password',
        html: resetEmail.html,
        text: resetEmail.text,
      });
      await appendAudit({
        type: 'PATIENT_PASSWORD_RESET_REQUESTED',
        email,
      });
      info('patient.password_reset.requested', {
        email,
        provider: currentEmailProvider(),
      });
    } else {
      info('patient.password_reset.request_skipped', {
        email,
        reason: 'no_patient_account_or_certificate',
      });
    }

    sendJson(res, 200, {
      message: 'If an account exists for this email, a reset link has been sent.',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/password/reset/confirm') {
    const body = await parseJsonBody(req);
    const token = String(body.token || '').trim();
    const nextPassword = String(body.password || body.newPassword || '');

    if (!token || !nextPassword) {
      sendJson(res, 400, { error: 'token and password are required' });
      return;
    }

    let account;
    try {
      account = await resetPasswordWithToken({
        token,
        newPassword: nextPassword,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      if (['TOKEN_INVALID', 'TOKEN_EXPIRED', 'ACCOUNT_NOT_FOUND'].includes(String(errorObject?.code || ''))) {
        sendJson(res, 400, { error: 'Invalid or expired reset token' });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'PATIENT_PASSWORD_RESET_COMPLETED',
      email: account.email,
    });

    const patientToken = issuePatientToken(account.email);
    sendJson(res, 200, {
      token: patientToken,
      patient: buildPatientIdentity({
        email: account.email,
        latestCertificate: null,
        account,
      }),
    });
    info('patient.password_reset.completed', { email: account.email });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/me') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const account = await getPatientAccountByEmail(patient.email);
    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);
    if (patientCertificates.length === 0 && !account) {
      sendJson(res, 404, { error: 'Patient account not found' });
      return;
    }

    const latest = patientCertificates[0] || null;
    if (latest?.certificateDraft) {
      await updatePatientAccountProfile({
        email: patient.email,
        fullName: latest.certificateDraft.fullName || '',
        dob: latest.certificateDraft.dob || '',
        phone: latest.certificateDraft.phone || '',
      });
    }

    sendJson(res, 200, {
      patient: buildPatientIdentity({
        email: patient.email,
        latestCertificate: latest,
        account,
      }),
      queueCount: patientCertificates.filter((item) => isOpenForReview(item.status)).length,
      latestRequest: latest ? patientSummaryFromCertificate(latest) : null,
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

    const recipients = await resolveDoctorNotificationEmails();
    const patientMessageEmail = renderDoctorPatientMessageEmail({
      baseUrl: getFrontendBaseUrl(),
      certId,
      patientEmail: normalizeEmail(patient.email),
      message,
    });

    await sendEmail({
      to: recipients,
      subject: `Patient message for request ${certId}`,
      html: patientMessageEmail.html,
      text: patientMessageEmail.text,
    });

    info('patient.message.sent', {
      certificateId: certId,
      patientEmail: normalizeEmail(patient.email),
      provider: currentEmailProvider(),
      recipients,
    });

    sendJson(res, 200, { message: 'Message sent to doctor' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/register') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.name || '').trim();
    const providerType = String(body.providerType || body.provider || '').trim();
    const registrationNumber = String(
      body.registrationNumber || body.providerRegistration || body.registration || ''
    )
      .trim()
      .toUpperCase();

    if (!isLikelyDoctorEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }
    if (!providerType) {
      sendJson(res, 400, { error: 'Provider type is required' });
      return;
    }
    if (!registrationNumber) {
      sendJson(res, 400, { error: 'Registration number is required' });
      return;
    }

    let account;
    try {
      account = await createDoctorAccount({
        email,
        password,
        fullName,
        providerType,
        registrationNumber,
        source: 'portal-signup',
      });
    } catch (errorObject) {
      if (errorObject?.code === 'ACCOUNT_EXISTS') {
        sendJson(res, 409, { error: 'Doctor account already exists' });
        return;
      }
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'DOCTOR_ACCOUNT_CREATED',
      email,
    });

    try {
      const welcomeEmail = renderDoctorWelcomeEmail({
        baseUrl: getFrontendBaseUrl(),
        fullName: account.fullName || fullName,
      });
      await sendEmail({
        to: email,
        subject: 'Welcome to the Onya doctor portal',
        html: welcomeEmail.html,
        text: welcomeEmail.text,
      });
    } catch (errorObject) {
      error('doctor.register.welcome_email_failed', {
        email,
        message: errorObject?.message || String(errorObject),
      });
    }

    const token = issueDoctorToken(email);
    info('doctor.register.success', { email });
    sendJson(res, 201, {
      token,
      doctor: {
        email,
        name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: account.providerType || providerType,
        registrationNumber: account.registrationNumber || registrationNumber,
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/password/reset/request') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);

    if (!isLikelyDoctorEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    const resetPayload = await issueDoctorPasswordResetToken(email, DOCTOR_PASSWORD_RESET_TTL_MS);
    if (resetPayload) {
      const resetUrl = buildDoctorPasswordResetUrl(resetPayload.token);
      const resetEmail = renderDoctorPasswordResetEmail({
        baseUrl: getFrontendBaseUrl(),
        resetUrl,
        expiresMinutes: String(Math.round(DOCTOR_PASSWORD_RESET_TTL_MS / (1000 * 60))),
      });
      await sendEmail({
        to: email,
        subject: 'Reset your doctor portal password',
        html: resetEmail.html,
        text: resetEmail.text,
      });
      await appendAudit({
        type: 'DOCTOR_PASSWORD_RESET_REQUESTED',
        email,
      });
      info('doctor.password_reset.requested', {
        email,
        provider: currentEmailProvider(),
      });
    }

    sendJson(res, 200, {
      message: 'If an account exists for this email, a reset link has been sent.',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/password/reset/confirm') {
    const body = await parseJsonBody(req);
    const token = String(body.token || '').trim();
    const nextPassword = String(body.password || body.newPassword || '');

    if (!token || !nextPassword) {
      sendJson(res, 400, { error: 'token and password are required' });
      return;
    }

    let account;
    try {
      account = await resetDoctorPasswordWithToken({
        token,
        newPassword: nextPassword,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      if (['TOKEN_INVALID', 'TOKEN_EXPIRED', 'ACCOUNT_NOT_FOUND'].includes(String(errorObject?.code || ''))) {
        sendJson(res, 400, { error: 'Invalid or expired reset token' });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'DOCTOR_PASSWORD_RESET_COMPLETED',
      email: account.email,
    });

    const tokenValue = issueDoctorToken(account.email);
    info('doctor.password_reset.completed', { email: account.email });
    sendJson(res, 200, {
      token: tokenValue,
      doctor: {
        email: account.email,
        name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: account.providerType || '',
        registrationNumber: account.registrationNumber || '',
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/login') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    let doctorIdentity = null;
    if (validateDoctorCredentials(email, password)) {
      doctorIdentity = {
        email,
        name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: '',
        registrationNumber: '',
      };
    } else {
      const account = await authenticateDoctorAccount({ email, password });
      if (account?.email) {
        doctorIdentity = {
          email: account.email,
          name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
          providerType: account.providerType || '',
          registrationNumber: account.registrationNumber || '',
        };
      }
    }

    if (!doctorIdentity) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = issueDoctorToken(doctorIdentity.email);
    info('doctor.login.success', { email: doctorIdentity.email });
    sendJson(res, 200, {
      token,
      doctor: {
        email: doctorIdentity.email,
        name: doctorIdentity.name,
        providerType: doctorIdentity.providerType || '',
        registrationNumber: doctorIdentity.registrationNumber || '',
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/doctor/profile') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const profile = await resolveDoctorProfile(doctor.email);
    sendJson(res, 200, {
      doctor: {
        email: normalizeEmail(doctor.email),
        fullName: String(profile?.fullName || '').trim(),
        providerType: String(profile?.providerType || '').trim(),
        registrationNumber: String(profile?.registrationNumber || '').trim().toUpperCase(),
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/profile') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const body = await parseJsonBody(req);
    const fullName = String(body.fullName || body.name || '').trim();
    const providerType = String(body.providerType || body.provider || '').trim();
    const registrationNumber = String(
      body.registrationNumber || body.providerRegistration || body.registration || ''
    )
      .trim()
      .toUpperCase();

    if (!providerType) {
      sendJson(res, 400, { error: 'Provider type is required' });
      return;
    }
    if (!registrationNumber) {
      sendJson(res, 400, { error: 'Registration number is required' });
      return;
    }

    const updated = await upsertDoctorAccount({
      email: normalizeEmail(doctor.email),
      fullName,
      providerType,
      registrationNumber,
      source: 'portal-profile',
    });

    sendJson(res, 200, {
      doctor: {
        email: normalizeEmail(doctor.email),
        fullName: String(updated?.fullName || fullName || '').trim(),
        providerType: String(updated?.providerType || providerType || '').trim(),
        registrationNumber: String(
          updated?.registrationNumber || registrationNumber || ''
        )
          .trim()
          .toUpperCase(),
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
        verificationCode: getCertificateVerificationCode(item),
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
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    if (!doctorProfile?.providerType || !doctorProfile?.registrationNumber) {
      sendJson(res, 400, {
        error: 'Please complete provider type and registration number in your doctor profile first.',
      });
      return;
    }
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

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
        by: reviewerName,
        byEmail: normalizeEmail(doctor.email),
        providerType: String(doctorProfile?.providerType || '').trim(),
        registrationNumber: String(doctorProfile?.registrationNumber || '')
          .trim()
          .toUpperCase(),
        at: new Date().toISOString(),
        notes,
      },
    };

    const pdfBuffer = await buildCertificatePdf(previewCertificate, {
      doctorName: reviewerName,
      doctorNotes: notes,
      providerType: String(previewCertificate?.decision?.providerType || '').trim(),
      registrationNumber: String(previewCertificate?.decision?.registrationNumber || '')
        .trim()
        .toUpperCase(),
      verificationCode: getCertificateVerificationCode(previewCertificate),
      verifyUrl: `${getFrontendBaseUrl()}/verify?code=${encodeURIComponent(getCertificateVerificationCode(previewCertificate))}`,
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
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

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
        by: reviewerName,
        byEmail: normalizeEmail(doctor.email),
        providerType: String(doctorProfile?.providerType || '').trim(),
        registrationNumber: String(doctorProfile?.registrationNumber || '')
          .trim()
          .toUpperCase(),
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
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    if (!doctorProfile?.providerType || !doctorProfile?.registrationNumber) {
      sendJson(res, 400, {
        error: 'Please complete provider type and registration number in your doctor profile first.',
      });
      return;
    }
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

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
          by: reviewerName,
          byEmail: normalizeEmail(doctor.email),
          providerType: String(doctorProfile?.providerType || '').trim(),
          registrationNumber: String(doctorProfile?.registrationNumber || '')
            .trim()
            .toUpperCase(),
          at: new Date().toISOString(),
          notes,
          result: decision,
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
    let patientNotificationFailed = false;
    try {
      await sendPatientDecisionEmail(updated);
    } catch (errorObject) {
      patientNotificationFailed = true;
      error('doctor.decision.patient_email_failed', {
        doctor: doctor.email,
        certificateId: updated.id,
        decision,
        message: errorObject?.message || String(errorObject),
      });
    }
    info('doctor.decision.submitted', {
      doctor: doctor.email,
      certificateId: updated.id,
      decision,
    });

    sendJson(res, 200, {
      message: patientNotificationFailed
        ? `Certificate ${decision}. Patient email delivery failed; please check email provider logs.`
        : `Certificate ${decision}`,
      certificate: doctorPayloadFromRequest(updated),
      patientNotificationFailed,
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
