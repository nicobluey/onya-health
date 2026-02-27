import crypto from 'node:crypto';

const SESSION_SECRET = process.env.DOCTOR_SESSION_SECRET || 'change-this-doctor-session-secret';
const TOKEN_TTL_MS = Number(process.env.DOCTOR_TOKEN_TTL_MS || 1000 * 60 * 60 * 12);

function encodeBase64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPayload(encodedPayload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
}

export function issueDoctorToken(email) {
  const payload = {
    email,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyDoctorToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, incomingSignature] = token.split('.');
  const expectedSignature = signPayload(encodedPayload);
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

export function validateDoctorCredentials(email, password) {
  const expectedEmail = process.env.DOCTOR_LOGIN_EMAIL || 'doctor@onyahealth.com';
  const expectedPassword = process.env.DOCTOR_LOGIN_PASSWORD || 'ChangeMe123!';

  return email === expectedEmail && password === expectedPassword;
}
