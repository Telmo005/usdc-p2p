// Applies supabase/schema.sql to the database at DATABASE_URL.
// Usage: node --env-file=.env.local scripts/apply-schema.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL não está definido (usa --env-file=.env.local).');
    process.exit(1);
  }

  const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema aplicado com sucesso.');

    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_schema = 'p2p_manager' order by table_name`
    );
    console.log('Tabelas em p2p_manager:', rows.map((r) => r.table_name).join(', '));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Falha ao aplicar o schema:', err.message);
  process.exit(1);
});
