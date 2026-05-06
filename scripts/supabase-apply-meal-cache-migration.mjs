import fs from 'node:fs';
import { runSupabaseManagementQuery } from './supabase-management-api.mjs';

const MIGRATION_FILE = 'supabase/migrations/20260505_add_meal_plan_generation_cache.sql';
const MIGRATION_VERSION = '20260505';
const MIGRATION_NAME = 'add_meal_plan_generation_cache';
const MIGRATION_CREATED_BY = 'codex';

const BACKFILL_QUERY = `
insert into public.meal_plan_generation_cache (
  cache_key,
  patient_email,
  intake_hash,
  source,
  stage,
  bundle,
  created_at,
  updated_at,
  last_used_at
)
select
  payload->>'cacheKey' as cache_key,
  lower(payload->>'patientEmail') as patient_email,
  payload->>'intakeHash' as intake_hash,
  coalesce(nullif(payload->>'source',''),'openai') as source,
  coalesce(nullif(payload->>'stage',''),'ai_recipes_v3') as stage,
  coalesce(payload->'bundle','{}'::jsonb) as bundle,
  coalesce((payload->>'createdAt')::timestamptz, created_at, timezone('utc', now())) as created_at,
  coalesce((payload->>'updatedAt')::timestamptz, created_at, timezone('utc', now())) as updated_at,
  coalesce((payload->>'lastUsedAt')::timestamptz, created_at, timezone('utc', now())) as last_used_at
from (
  select
    payload,
    created_at,
    row_number() over (
      partition by payload->>'cacheKey'
      order by coalesce((payload->>'updatedAt')::timestamptz, created_at) desc, created_at desc
    ) as row_rank
  from public.request_events
  where event_type = 'MEAL_PLAN_CACHE_V1'
    and coalesce(payload->>'cacheKey','') <> ''
    and coalesce(payload->>'patientEmail','') <> ''
    and coalesce(payload->>'intakeHash','') <> ''
) latest
where row_rank = 1
on conflict (cache_key) do update
set
  patient_email = excluded.patient_email,
  intake_hash = excluded.intake_hash,
  source = excluded.source,
  stage = excluded.stage,
  bundle = excluded.bundle,
  updated_at = excluded.updated_at,
  last_used_at = excluded.last_used_at;
`;

function buildMigrationHistoryInsert(statementsText) {
  const escaped = String(statementsText || '').replace(/\$stmt\$/g, '$ stmt $');
  return `
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '${MIGRATION_VERSION}',
  '${MIGRATION_NAME}',
  ARRAY[$stmt$${escaped}$stmt$]::text[],
  '${MIGRATION_CREATED_BY}'
)
on conflict (version) do nothing;
`;
}

async function main() {
  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Migration file not found: ${MIGRATION_FILE}`);
  }

  const migrationSql = String(fs.readFileSync(MIGRATION_FILE, 'utf8') || '').trim();
  if (!migrationSql) {
    throw new Error(`Migration file is empty: ${MIGRATION_FILE}`);
  }

  const beforeCacheCount = await runSupabaseManagementQuery({
    query: `select count(*)::int as cache_rows from public.meal_plan_generation_cache;`,
  }).catch(() => [{ cache_rows: 0 }]);
  const beforeEventsCount = await runSupabaseManagementQuery({
    query: `select count(*)::int as request_event_cache_rows from public.request_events where event_type='MEAL_PLAN_CACHE_V1';`,
  });

  await runSupabaseManagementQuery({ query: migrationSql });
  await runSupabaseManagementQuery({ query: BACKFILL_QUERY });
  await runSupabaseManagementQuery({ query: buildMigrationHistoryInsert(migrationSql) });

  const afterStatus = await runSupabaseManagementQuery({
    query: `
      select
        to_regclass('public.meal_plan_generation_cache') as cache_table,
        (select count(*)::int from public.meal_plan_generation_cache) as cache_rows,
        (select count(*)::int from public.request_events where event_type='MEAL_PLAN_CACHE_V1') as request_event_cache_rows;
    `,
  });

  const summary = {
    migrationFile: MIGRATION_FILE,
    migrationVersion: MIGRATION_VERSION,
    before: {
      cacheRows: beforeCacheCount?.[0]?.cache_rows ?? null,
      requestEventCacheRows: beforeEventsCount?.[0]?.request_event_cache_rows ?? null,
    },
    after: afterStatus?.[0] || null,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((errorObject) => {
  console.error(errorObject?.message || String(errorObject));
  process.exit(1);
});
