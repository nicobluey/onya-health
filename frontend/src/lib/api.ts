export function getApiBase() {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (configuredBase) {
    return configuredBase;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    // Only apply localhost split-port fallback in Vite dev mode.
    if (import.meta.env.DEV && isLocalHost && port === '5173') {
      return `${protocol}//${hostname}:8787`;
    }
  }

  return '';
}

async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 160).replace(/\s+/g, ' ').trim();
    const hint = preview.toLowerCase().startsWith('<!doctype')
      ? 'API route returned HTML. Ensure /api endpoints are deployed on this domain.'
      : `API returned non-JSON: ${preview}`;
    throw new Error(hint);
  }
}

export async function fetchApiJson(path: string, init?: RequestInit) {
  const response = await fetch(`${getApiBase()}${path}`, init);
  const payload = await parseJsonOrThrow(response);
  return { response, payload };
}
