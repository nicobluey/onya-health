import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
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

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const UNLIMITED_PRODUCT_ID = String(process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || '').trim();

if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!UNLIMITED_PRODUCT_ID) {
  throw new Error('Missing STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING');
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function toIsoFromUnix(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function pickBest(a, b) {
  if (!a) return b;
  if (!b) return a;

  const aActive = Number(ACTIVE_STATUSES.has(normalizeStatus(a.status)));
  const bActive = Number(ACTIVE_STATUSES.has(normalizeStatus(b.status)));
  if (aActive !== bActive) {
    return bActive > aActive ? b : a;
  }

  const aCancel = Number(Boolean(a.cancel_at_period_end));
  const bCancel = Number(Boolean(b.cancel_at_period_end));
  if (aCancel !== bCancel) {
    return bCancel < aCancel ? b : a;
  }

  const aEnd = Number(a.current_period_end || 0);
  const bEnd = Number(b.current_period_end || 0);
  if (aEnd !== bEnd) {
    return bEnd > aEnd ? b : a;
  }

  return Number(b.created || 0) > Number(a.created || 0) ? b : a;
}

async function stripeRequest(pathWithQuery) {
  const response = await fetch(`https://api.stripe.com/v1/${pathWithQuery}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`Stripe request failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function listAllStripeSubscriptions() {
  const all = [];
  let startingAfter = '';
  while (true) {
    const params = new URLSearchParams({
      status: 'all',
      limit: '100',
    });
    params.append('expand[]', 'data.customer');
    if (startingAfter) {
      params.set('starting_after', startingAfter);
    }

    const payload = await stripeRequest(`subscriptions?${params.toString()}`);
    const chunk = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...chunk);

    if (!payload?.has_more || chunk.length === 0) {
      break;
    }
    startingAfter = String(chunk[chunk.length - 1]?.id || '').trim();
    if (!startingAfter) break;
  }
  return all;
}

function subscriptionMatchesUnlimitedProduct(subscription) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  return items.some((item) => String(item?.price?.product || '').trim() === UNLIMITED_PRODUCT_ID);
}

function toBillingRow(email, subscription) {
  const status = normalizeStatus(subscription?.status || 'none');
  const hasActiveUnlimited = ACTIVE_STATUSES.has(status) && subscriptionMatchesUnlimitedProduct(subscription);

  return {
    patient_email: email,
    has_active_unlimited: hasActiveUnlimited,
    plan: hasActiveUnlimited ? 'unlimited' : 'pay_as_you_go',
    subscription_status: status || 'none',
    stripe_customer_id: String(subscription?.customer?.id || subscription?.customer || '').trim() || null,
    stripe_subscription_id: String(subscription?.id || '').trim() || null,
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    current_period_end: toIsoFromUnix(subscription?.current_period_end),
    source: 'stripe.backfill',
    updated_at: new Date().toISOString(),
  };
}

async function upsertBillingRows(rows) {
  if (rows.length === 0) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/patient_billing`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`Supabase upsert failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const subscriptions = await listAllStripeSubscriptions();
  const unlimitedSubscriptions = subscriptions.filter(subscriptionMatchesUnlimitedProduct);
  const byEmail = new Map();

  for (const sub of unlimitedSubscriptions) {
    const email = normalizeEmail(sub?.customer?.email || sub?.metadata?.patient_email || '');
    if (!email) continue;
    const existing = byEmail.get(email);
    byEmail.set(email, pickBest(existing, sub));
  }

  const rows = Array.from(byEmail.entries()).map(([email, sub]) => toBillingRow(email, sub));
  await upsertBillingRows(rows);

  const activeCount = rows.filter((row) => row.has_active_unlimited).length;
  const inactiveCount = rows.length - activeCount;
  console.log(
    JSON.stringify(
      {
        scannedSubscriptions: subscriptions.length,
        unlimitedSubscriptions: unlimitedSubscriptions.length,
        upsertedPatients: rows.length,
        activeUnlimited: activeCount,
        nonActiveUnlimited: inactiveCount,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
