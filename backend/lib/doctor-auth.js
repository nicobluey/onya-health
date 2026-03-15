import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function resolveAuthDataDir() {
  const configuredDir = String(
    process.env.ONYA_AUTH_DATA_DIR || process.env.ONYA_DATA_DIR || ''
  ).trim();
  if (configuredDir) return configuredDir;

  // Serverless runtimes (like Vercel) mount /var/task as read-only.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.resolve('/tmp', 'onya-health', 'auth');
  }

  return path.resolve(process.cwd(), 'backend', 'data');
}

const DATA_DIR = resolveAuthDataDir();
const AUTH_DB_PATH = path.join(DATA_DIR, 'doctor-auth.json');

const EMPTY_AUTH_DB = {
  accounts: [],
  resetTokens: [],
};

let writeQueue = Promise.resolve();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProviderType(value) {
  return String(value || '').trim();
}

function normalizeRegistrationNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDbShape(db) {
  if (!db || typeof db !== 'object') return { ...EMPTY_AUTH_DB };
  if (!Array.isArray(db.accounts)) db.accounts = [];
  if (!Array.isArray(db.resetTokens)) db.resetTokens = [];
  return db;
}

async function ensureAuthDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(AUTH_DB_PATH);
  } catch {
    await fs.writeFile(AUTH_DB_PATH, JSON.stringify(EMPTY_AUTH_DB, null, 2), 'utf8');
  }
}

async function readAuthDbRaw() {
  await ensureAuthDbFile();
  const contents = await fs.readFile(AUTH_DB_PATH, 'utf8');
  return ensureDbShape(JSON.parse(contents));
}

async function writeAuthDbRaw(db) {
  await ensureAuthDbFile();
  const nextDb = ensureDbShape(db);
  const tempPath = `${AUTH_DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(nextDb, null, 2), 'utf8');
  await fs.rename(tempPath, AUTH_DB_PATH);
}

async function mutateAuthDb(mutator) {
  const mutation = writeQueue.then(async () => {
    const db = await readAuthDbRaw();
    const result = await mutator(db);
    await writeAuthDbRaw(db);
    return result;
  });
  writeQueue = mutation.catch(() => undefined);
  return mutation;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const normalized = String(storedHash || '');
  const [algorithm, salt, hashHex] = normalized.split('$');
  if (algorithm !== 'scrypt' || !salt || !hashHex) return false;

  const calculated = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const incomingBuffer = Buffer.from(hashHex, 'hex');
  const expectedBuffer = Buffer.from(calculated, 'hex');
  if (incomingBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(incomingBuffer, expectedBuffer);
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function pruneResetTokens(resetTokens) {
  const now = Date.now();
  return resetTokens.filter((entry) => {
    const expiresAt = new Date(entry?.expiresAt || '').getTime();
    return Number.isFinite(expiresAt) && expiresAt > now && !entry?.usedAt;
  });
}

function toPublicAccount(account) {
  if (!account) return null;
  return {
    email: normalizeEmail(account.email),
    fullName: String(account.fullName || ''),
    providerType: normalizeProviderType(account.providerType),
    registrationNumber: normalizeRegistrationNumber(account.registrationNumber),
    source: String(account.source || ''),
    createdAt: String(account.createdAt || ''),
    updatedAt: String(account.updatedAt || ''),
    lastLoginAt: String(account.lastLoginAt || ''),
    lastPasswordResetAt: String(account.lastPasswordResetAt || ''),
    hasPassword: Boolean(account.passwordHash),
  };
}

export function isLikelyEmail(email) {
  const value = normalizeEmail(email);
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateDoctorPassword(password) {
  const value = String(password || '');
  if (value.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) {
    return 'Password must include at least one letter and one number';
  }
  return null;
}

export async function listDoctorEmails() {
  const db = await readAuthDbRaw();
  const emails = db.accounts.map((entry) => normalizeEmail(entry.email)).filter(Boolean);
  return Array.from(new Set(emails));
}

export async function getDoctorAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const db = await readAuthDbRaw();
  const account = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizedEmail) || null;
  return toPublicAccount(account);
}

export async function createDoctorAccount({
  email,
  password,
  fullName = '',
  providerType = '',
  registrationNumber = '',
  source = 'local',
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const err = new Error('Email is required');
    err.code = 'EMAIL_REQUIRED';
    throw err;
  }

  const passwordError = validateDoctorPassword(password);
  if (passwordError) {
    const err = new Error(passwordError);
    err.code = 'PASSWORD_INVALID';
    throw err;
  }

  const result = await mutateAuthDb((db) => {
    const existing = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizedEmail);
    if (existing) {
      return { ok: false, reason: 'ACCOUNT_EXISTS' };
    }

    const timestamp = nowIso();
    const account = {
      email: normalizedEmail,
      fullName: String(fullName || '').trim(),
      providerType: normalizeProviderType(providerType),
      registrationNumber: normalizeRegistrationNumber(registrationNumber),
      source: String(source || 'local'),
      passwordHash: hashPassword(password),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: '',
      lastPasswordResetAt: '',
    };
    db.accounts.push(account);
    db.resetTokens = pruneResetTokens(db.resetTokens);
    return { ok: true, account: toPublicAccount(account) };
  });

  if (!result?.ok) {
    const err = new Error('Doctor account already exists');
    err.code = result?.reason || 'ACCOUNT_EXISTS';
    throw err;
  }

  return result.account;
}

export async function upsertDoctorAccount({
  email,
  fullName = '',
  providerType = '',
  registrationNumber = '',
  source = 'local',
  password,
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  if (typeof password === 'string' && password.length > 0) {
    const passwordError = validateDoctorPassword(password);
    if (passwordError) {
      const err = new Error(passwordError);
      err.code = 'PASSWORD_INVALID';
      throw err;
    }
  }

  return mutateAuthDb((db) => {
    let account = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizedEmail) || null;
    const timestamp = nowIso();

    if (!account) {
      account = {
        email: normalizedEmail,
        fullName: String(fullName || '').trim(),
        providerType: normalizeProviderType(providerType),
        registrationNumber: normalizeRegistrationNumber(registrationNumber),
        source: String(source || 'local'),
        passwordHash: typeof password === 'string' && password ? hashPassword(password) : '',
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: '',
        lastPasswordResetAt: '',
      };
      db.accounts.push(account);
      return toPublicAccount(account);
    }

    let changed = false;
    const trimmedName = String(fullName || '').trim();
    if (trimmedName && account.fullName !== trimmedName) {
      account.fullName = trimmedName;
      changed = true;
    }
    const normalizedProviderType = normalizeProviderType(providerType);
    if (normalizedProviderType && account.providerType !== normalizedProviderType) {
      account.providerType = normalizedProviderType;
      changed = true;
    }
    const normalizedRegistrationNumber = normalizeRegistrationNumber(registrationNumber);
    if (normalizedRegistrationNumber && account.registrationNumber !== normalizedRegistrationNumber) {
      account.registrationNumber = normalizedRegistrationNumber;
      changed = true;
    }
    const nextSource = String(source || '').trim();
    if (nextSource && account.source !== nextSource) {
      account.source = nextSource;
      changed = true;
    }
    if (typeof password === 'string' && password) {
      account.passwordHash = hashPassword(password);
      account.lastPasswordResetAt = timestamp;
      changed = true;
    }
    if (changed) {
      account.updatedAt = timestamp;
    }

    return toPublicAccount(account);
  });
}

export async function authenticateDoctorAccount({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;

  return mutateAuthDb((db) => {
    const account = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizedEmail);
    if (!account || !account.passwordHash) return null;
    if (!verifyPassword(password, account.passwordHash)) return null;

    account.lastLoginAt = nowIso();
    account.updatedAt = account.lastLoginAt;
    return toPublicAccount(account);
  });
}

export async function issueDoctorPasswordResetToken(email, ttlMs) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return mutateAuthDb((db) => {
    db.resetTokens = pruneResetTokens(db.resetTokens);
    const account = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizedEmail);
    if (!account) return null;

    const token = crypto.randomBytes(32).toString('base64url');
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + ttlMs).toISOString();
    db.resetTokens.push({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      tokenHash: hashResetToken(token),
      createdAt: new Date(issuedAt).toISOString(),
      expiresAt,
      usedAt: null,
    });

    return {
      email: normalizedEmail,
      fullName: String(account.fullName || ''),
      token,
      expiresAt,
    };
  });
}

export async function resetDoctorPasswordWithToken({ token, newPassword }) {
  const passwordError = validateDoctorPassword(newPassword);
  if (passwordError) {
    const err = new Error(passwordError);
    err.code = 'PASSWORD_INVALID';
    throw err;
  }

  const tokenHash = hashResetToken(token);
  const result = await mutateAuthDb((db) => {
    db.resetTokens = pruneResetTokens(db.resetTokens);
    const resetEntry = db.resetTokens.find((entry) => entry.tokenHash === tokenHash && !entry.usedAt) || null;
    if (!resetEntry) {
      return { ok: false, reason: 'TOKEN_INVALID' };
    }

    const expiresAt = new Date(resetEntry.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, reason: 'TOKEN_EXPIRED' };
    }

    const account = db.accounts.find((entry) => normalizeEmail(entry?.email) === normalizeEmail(resetEntry.email));
    if (!account) {
      return { ok: false, reason: 'ACCOUNT_NOT_FOUND' };
    }

    const timestamp = nowIso();
    account.passwordHash = hashPassword(newPassword);
    account.updatedAt = timestamp;
    account.lastPasswordResetAt = timestamp;
    resetEntry.usedAt = timestamp;
    return { ok: true, account: toPublicAccount(account) };
  });

  if (!result?.ok) {
    const err = new Error('Invalid or expired reset token');
    err.code = result?.reason || 'TOKEN_INVALID';
    throw err;
  }

  return result.account;
}
