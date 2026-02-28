import crypto from 'node:crypto';

const SESSION_SECRET = process.env.DOCTOR_SESSION_SECRET || 'change-this-doctor-session-secret';
const TOKEN_TTL_MS = Number(process.env.DOCTOR_TOKEN_TTL_MS || 1000 * 60 * 60 * 12);
const PATIENT_SESSION_SECRET = process.env.PATIENT_SESSION_SECRET || SESSION_SECRET;
const PATIENT_TOKEN_TTL_MS = Number(process.env.PATIENT_TOKEN_TTL_MS || 1000 * 60 * 60 * 24 * 14);

function encodeBase64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPayload(encodedPayload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function signPayloadWithSecret(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function issueToken(payload, ttlMs, secret) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(tokenPayload));
  const signature = signPayloadWithSecret(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, incomingSignature] = token.split('.');
  const expectedSignature = signPayloadWithSecret(encodedPayload, secret);
  const incomingBuffer = Buffer.from(incomingSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    incomingBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(incomingBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload));
  if (!payload?.exp || Date.now() > payload.exp) {
    return null;
  }

  return payload;
}

export function issueDoctorToken(email) {
  return issueToken(
    {
      role: 'doctor',
      email,
    },
    TOKEN_TTL_MS,
    SESSION_SECRET
  );
}

export function verifyDoctorToken(token) {
  const payload = verifyToken(token, SESSION_SECRET);
  if (!payload) return null;
  if (payload.role && payload.role !== 'doctor') {
    return null;
  }
  return payload;
}

export function issuePatientToken(email) {
  return issueToken(
    {
      role: 'patient',
      email,
    },
    PATIENT_TOKEN_TTL_MS,
    PATIENT_SESSION_SECRET
  );
}

export function verifyPatientToken(token) {
  const payload = verifyToken(token, PATIENT_SESSION_SECRET);
  if (!payload) return null;
  if (payload.role && payload.role !== 'patient') {
    return null;
  }
  return payload;
}

export function validateDoctorCredentials(email, password) {
  const expectedEmail = process.env.DOCTOR_LOGIN_EMAIL || 'doctor@onyahealth.com';
  const expectedPassword = process.env.DOCTOR_LOGIN_PASSWORD || 'ChangeMe123!';

  return email === expectedEmail && password === expectedPassword;
}
