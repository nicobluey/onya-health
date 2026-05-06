import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function parseTokenFromKeychainOutput(output) {
  const keyringMatch = String(output || '').match(/go-keyring-base64:([A-Za-z0-9+/=]+)/);
  if (keyringMatch) {
    const decoded = Buffer.from(keyringMatch[1], 'base64').toString('utf8').trim();
    if (decoded.startsWith('sbp_')) return decoded;
  }

  const directMatch = String(output || '').match(/password:\s+"(sbp_[^"]+)"/);
  if (directMatch) return directMatch[1].trim();

  return '';
}

export function resolveSupabaseAccessToken() {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv.startsWith('sbp_')) return fromEnv;

  const keychainResult = spawnSync('security', ['find-generic-password', '-a', 'supabase', '-g'], {
    encoding: 'utf8',
  });
  const combinedOutput = `${keychainResult.stdout || ''}${keychainResult.stderr || ''}`;
  const parsed = parseTokenFromKeychainOutput(combinedOutput);
  if (parsed) return parsed;

  throw new Error(
    'Unable to resolve Supabase access token. Run `npx supabase login` or set SUPABASE_ACCESS_TOKEN.'
  );
}

export function resolveSupabaseProjectRef() {
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || process.env.PROJECT_REF || '').trim();
  if (fromEnv) return fromEnv;

  const projectRefFile = 'supabase/.temp/project-ref';
  if (fs.existsSync(projectRefFile)) {
    const fromFile = String(fs.readFileSync(projectRefFile, 'utf8') || '').trim();
    if (fromFile) return fromFile;
  }

  throw new Error(
    'Unable to resolve Supabase project ref. Run `npx supabase link --project-ref <ref>` or set SUPABASE_PROJECT_REF.'
  );
}

export async function runSupabaseManagementQuery({ query, projectRef, accessToken }) {
  const queryText = String(query || '').trim();
  if (!queryText) throw new Error('SQL query is required.');

  const resolvedProjectRef = String(projectRef || '').trim() || resolveSupabaseProjectRef();
  const resolvedAccessToken = String(accessToken || '').trim() || resolveSupabaseAccessToken();

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${resolvedProjectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryText }),
    },
  );

  const bodyText = await response.text();
  let parsed = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = bodyText;
  }

  if (!response.ok) {
    const details = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    throw new Error(`Supabase management query failed (${response.status}): ${details}`);
  }

  return parsed;
}
