// Dev utility: dumps every table + column in one schema. Defaults to
// p2p_manager (this app's own schema); pass another name to peek at a
// different one, e.g. `node --env-file=.env.local scripts/inspect-schema.mjs public`
// - read-only, never touches data outside information_schema.
import pg from 'pg';

const schema = process.argv[2] || 'p2p_manager';

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: tables } = await client.query(
      `select table_name from information_schema.tables where table_schema = $1 order by table_name`,
      [schema]
    );
    console.log(`Tabelas existentes em ${schema}:`, tables.map((r) => r.table_name).join(', ') || '(nenhuma)');

    for (const { table_name } of tables) {
      const { rows: cols } = await client.query(
        `select column_name, data_type from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position`,
        [schema, table_name]
      );
      console.log(`\n${table_name}:`, cols.map((c) => `${c.column_name}(${c.data_type})`).join(', '));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Falha:', err.message);
  process.exit(1);
});
