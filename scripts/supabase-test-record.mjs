#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing .env file at ${filePath}`);
  }

  const envText = fs.readFileSync(filePath, 'utf8');
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

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  loadEnv(envPath);

  const supabaseUrl = required('VITE_SUPABASE_URL');
  const key = required('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
  const table = process.env.SUPABASE_TEST_TABLE || 'connection_checks';

  const payload = {
    source: 'codex-script',
    status: 'ok',
    created_by: 'nicolas',
    created_at: new Date().toISOString(),
    note: 'supabase connectivity test',
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    console.error('Supabase insert failed.');
    console.error('Status:', response.status);
    console.error('Response:', parsed);
    if (response.status === 404 && parsed?.code === 'PGRST205') {
      console.error('');
      console.error(`Missing table "public.${table}" in Supabase.`);
      console.error(
        'Run the SQL migration at supabase/migrations/20260227_create_connection_checks.sql in the Supabase SQL Editor, then rerun this command.'
      );
    }
    process.exit(1);
  }

  console.log('Supabase insert succeeded.');
  console.log('Table:', table);
  console.log('Inserted row:', JSON.stringify(parsed, null, 2));
}

main().catch((error) => {
  console.error('Supabase test failed.');
  console.error('Message:', error?.message || String(error));
  if (error?.cause) {
    console.error('Cause:', error.cause);
  }
  process.exit(1);
});
