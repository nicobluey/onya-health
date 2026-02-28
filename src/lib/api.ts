export function getApiBase() {
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
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
