import { Pool } from 'pg';
import fs from 'fs';

interface PgColumn { column_name: string; data_type: string; is_nullable: string; column_default: string | null }
interface PgArg { name: string | null; mode: string; dtype: string; ord: number }
interface PgFn { oid: number; proname: string; proretset: boolean; rt: string; pronargdefaults: number }

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });

async function columnsOf(table: string): Promise<PgColumn[]> {
  const { rows } = await pool.query<PgColumn>(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position`, [table]);
  return rows;
}

async function generateTypes() {
  const { rows: tables } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  // First overload per proname wins (single-overload is the convention;
  // the dynamic rpc() helper covers any exceptions).
  const { rows: fns } = await pool.query<PgFn>(`
    SELECT p.oid, p.proname, p.proretset, p.prorettype::regclass::text AS rt,
           p.pronargdefaults
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p2
         WHERE p2.pronamespace = p.pronamespace AND p2.proname = p.proname
           AND p2.oid < p.oid)
    ORDER BY p.proname
  `);

  const { rows: allArgs } = await pool.query<PgArg>(`
    SELECT p.oid, a.name, a.mode, a.dtype::regtype::text AS dtype, a.ord
    FROM pg_proc p
    CROSS JOIN LATERAL unnest(p.proargnames, p.proargmodes, p.proallargtypes)
      WITH ORDINALITY AS a(name, mode, dtype, ord)
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proargnames IS NOT NULL
    ORDER BY a.ord
  `);
  const argsByFn = new Map<number, PgArg[]>();
  for (const a of allArgs as (PgArg & { oid: number })[]) {
    if (!argsByFn.has(a.oid)) argsByFn.set(a.oid, []);
    argsByFn.get(a.oid)!.push(a);
  }

  const tableCols = new Map<string, PgColumn[]>();
  for (const t of tables) tableCols.set(t.table_name, await columnsOf(t.table_name));

  let output = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
`;

  for (const table of tables) {
    const columns = tableCols.get(table.table_name)!;
    output += `      ${table.table_name}: {\n        Row: {\n`;
    for (const col of columns) {
      output += `          ${col.column_name}: ${pgTypeToTs(col.data_type)}${col.is_nullable === 'YES' ? ' | null' : ''}\n`;
    }
    output += `        }\n        Insert: {\n`;
    for (const col of columns) {
      const opt = col.column_default === null ? '' : '?';
      output += `          ${col.column_name}${opt}: ${pgTypeToTs(col.data_type)}${col.is_nullable === 'YES' ? ' | null' : ''}\n`;
    }
    output += `        }\n        Update: {\n`;
    for (const col of columns) {
      output += `          ${col.column_name}?: ${pgTypeToTs(col.data_type)} | null\n`;
    }
    output += `        }\n        Relationships: []\n      }\n`;
  }

  output += `    }\n    Functions: {\n`;

  for (const fn of fns) {
    const args = argsByFn.get(fn.oid) ?? [];
    const inArgs = args.filter((a) => a.mode === 'i' || a.mode === 'b');
    const outArgs = args.filter((a) => a.mode === 'o' || a.mode === 't');
    const requiredIn = inArgs.length - fn.pronargdefaults;

    output += `      ${fn.proname}: {\n        Args: {\n`;
    inArgs.forEach((a, i) => {
      if (!a.name) return;
      output += `          ${a.name}${i >= requiredIn ? '?' : ''}: ${pgTypeToTs(a.dtype)} | null\n`;
    });

    let returns: string;
    if (outArgs.length > 0) {
      // RETURNS TABLE(...) — OUT params are the row columns
      const cols = outArgs.filter((a) => a.name).map((a) => `${a.name}: ${pgTypeToTs(a.dtype)}`);
      returns = `{\n            ${cols.join('\n            ')}\n          }[]`;
    } else if (tableCols.has(fn.rt)) {
      const cols = tableCols.get(fn.rt)!
        .map((c) => `${c.column_name}: ${pgTypeToTs(c.data_type)}${c.is_nullable === 'YES' ? ' | null' : ''}`);
      returns = `{\n            ${cols.join('\n            ')}\n          }${fn.proretset ? '[]' : ''}`;
    } else {
      returns = fn.rt === 'record' ? 'unknown' : `${pgTypeToTs(fn.rt)}${fn.proretset ? '[]' : ''}`;
    }
    output += `        }\n        Returns: ${returns}\n      }\n`;
  }

  output += `    }\n    Views: {}\n    Enums: {}\n    CompositeTypes: {}\n  }\n}\n`;

  fs.writeFileSync('lib/types/database.ts', output);
  console.log('Generated lib/types/database.ts');
  await pool.end();
}

function pgTypeToTs(pgType: string): string {
  const map: Record<string, string> = {
    'uuid': 'string',
    'text': 'string',
    'boolean': 'boolean',
    'integer': 'number',
    'bigint': 'number',
    'numeric': 'number',
    'timestamp with time zone': 'string',
    'timestamp without time zone': 'string',
    'timestamp': 'string',
    'date': 'string',
    'jsonb': 'Json',
    'json': 'Json',
    'character varying': 'string',
    'ARRAY': 'any[]',
    'uuid[]': 'string[]',
    'text[]': 'string[]',
    'integer[]': 'number[]',
    'boolean[]': 'boolean[]',
    'jsonb[]': 'Json[]',
    'void': 'void',
    'record': 'unknown',
  };
  return map[pgType] || 'any';
}

generateTypes().catch(console.error);
