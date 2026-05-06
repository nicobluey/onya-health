import fs from 'node:fs';
import { runSupabaseManagementQuery } from './supabase-management-api.mjs';

function printUsage() {
  console.log(`
Usage:
  node scripts/supabase-run-sql.mjs --query "select 1;"
  node scripts/supabase-run-sql.mjs --file supabase/migrations/20260505_add_meal_plan_generation_cache.sql

Options:
  --query <sql>           Run inline SQL text.
  --file <path>           Run SQL loaded from file.
  --project-ref <ref>     Override project ref (otherwise uses SUPABASE_PROJECT_REF or supabase/.temp/project-ref).
  --compact               Print compact JSON.
  --help                  Show this message.
`.trim());
}

function parseArgs(argv) {
  const args = {
    query: '',
    filePath: '',
    projectRef: '',
    compact: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--query') {
      args.query = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (token === '--file') {
      args.filePath = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (token === '--project-ref') {
      args.projectRef = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (token === '--compact') {
      args.compact = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let queryText = String(args.query || '').trim();
  if (args.filePath) {
    queryText = String(fs.readFileSync(args.filePath, 'utf8') || '').trim();
  }
  if (!queryText) {
    throw new Error('Provide SQL with --query or --file.');
  }

  const response = await runSupabaseManagementQuery({
    query: queryText,
    projectRef: args.projectRef || undefined,
  });

  const spacing = args.compact ? 0 : 2;
  console.log(JSON.stringify(response, null, spacing));
}

main().catch((errorObject) => {
  console.error(errorObject?.message || String(errorObject));
  process.exit(1);
});
