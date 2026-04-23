const ROUTE_DOCUMENTS = [
  '/doctor',
  '/work',
  '/student',
  '/caretaker',
  '/patient-login',
  '/patient',
  '/blog',
];

const ROUTE_IMAGES = [
  '/HERO.webp',
  '/Medical Certificate Landing.webp',
  '/doctor-consult.webp',
  '/nutrionist.webp',
  '/psychologist.webp',
  '/student2.webp',
  '/parents.webp',
  '/woman_office_worker.webp',
  '/landing-work-certificate.webp',
  '/landing-university-certificate.webp',
  '/landing-carers-certificate.webp',
];

const STRIPE_ORIGINS = [
  'https://api.stripe.com',
  'https://checkout.stripe.com',
  'https://js.stripe.com',
];

let shellWarmed = false;
let apiWarmed = false;
let checkoutWarmed = false;

function addHeadLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined' || !href) return;

  const selector = `link[rel="${rel}"][href="${href}"]`;
  if (document.head.querySelector(selector)) return;

  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      link.setAttribute(key, value);
    }
  });
  document.head.appendChild(link);
}

function scheduleIdle(task: () => void) {
  if (typeof window === 'undefined') return;
  const maybeIdle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof maybeIdle === 'function') {
    maybeIdle(task);
    return;
  }
  window.setTimeout(task, 900);
}

function originFromUrl(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function warmConnections() {
  STRIPE_ORIGINS.forEach((origin) => {
    addHeadLink('preconnect', origin, { crossorigin: 'anonymous' });
    addHeadLink('dns-prefetch', origin);
  });

  const supabaseOrigin = originFromUrl(String(import.meta.env.VITE_SUPABASE_URL || '').trim());
  if (supabaseOrigin) {
    addHeadLink('preconnect', supabaseOrigin, { crossorigin: 'anonymous' });
    addHeadLink('dns-prefetch', supabaseOrigin);
  }
}

function prefetchRouteAssets() {
  ROUTE_DOCUMENTS.forEach((path) => {
    addHeadLink('prefetch', path, { as: 'document' });
  });

  ROUTE_IMAGES.forEach((path) => {
    addHeadLink('prefetch', path, { as: 'image' });
  });
}

export function warmAppShell() {
  if (shellWarmed) return;
  shellWarmed = true;
  warmConnections();
  scheduleIdle(prefetchRouteAssets);
}

export function warmApiRuntime() {
  if (apiWarmed || typeof window === 'undefined') return;
  apiWarmed = true;
  fetch('/api/health?warmup=1', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  }).catch(() => {
    // Warmup requests are best-effort only.
  });
}

export function warmCheckoutPath() {
  if (checkoutWarmed || typeof window === 'undefined') return;
  checkoutWarmed = true;

  warmConnections();
  warmApiRuntime();

  fetch('/api/checkout/session', {
    method: 'OPTIONS',
    cache: 'no-store',
    credentials: 'same-origin',
  }).catch(() => {
    // Warmup requests are best-effort only.
  });
}
