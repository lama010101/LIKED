import { Pool } from 'pg';
import fs from 'fs';

interface PgFunctionParam {
  parameter_name: string;
  parameter_mode: string;
  data_type: string;
  routine_name: string;
}

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

const pool = new Pool({ connectionString });

async function generateTypes() {
  const { rows: tables } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const { rows: functions } = await pool.query<PgFunctionParam>(`
    SELECT
      r.routine_name,
      p.parameter_mode,
      p.parameter_name,
      p.data_type
    FROM information_schema.parameters p
    JOIN information_schema.routines r ON p.specific_name = r.specific_name
    WHERE p.specific_schema = 'public'
    AND r.routine_schema = 'public'
    AND r.routine_type = 'FUNCTION'
    ORDER BY r.routine_name, p.ordinal_position
  `);

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
    const tableName = table.table_name;
    const { rows: columns } = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    output += `      ${tableName}: {\n        Row: {\n`;
    for (const col of columns) {
      const tsType = pgTypeToTs(col.data_type);
      const nullable = col.is_nullable === 'YES' ? ' | null' : '';
      output += `          ${col.column_name}: ${tsType}${nullable}\n`;
    }
    output += `        }\n        Insert: {\n`;
    for (const col of columns) {
      if (col.column_default === null) {
        const tsType = pgTypeToTs(col.data_type);
        const nullable = col.is_nullable === 'YES' ? ' | null' : '';
        output += `          ${col.column_name}: ${tsType}${nullable}\n`;
      }
    }
    output += `        }\n        Update: {\n`;
    for (const col of columns) {
      const tsType = pgTypeToTs(col.data_type);
      output += `          ${col.column_name}?: ${tsType} | null\n`;
    }
    output += `        }\n        Relationships: []\n      }\n`;
  }

  output += `    }\n    Functions: {\n`;

  const grouped: Record<string, PgFunctionParam[]> = {};
  for (const fn of functions) {
    if (!grouped[fn.routine_name]) grouped[fn.routine_name] = [];
    grouped[fn.routine_name].push(fn);
  }

  for (const [fnName, params] of Object.entries(grouped)) {
    const inParams = params.filter((p: PgFunctionParam) => p.parameter_mode === 'IN');
    output += `      ${fnName}: {\n        Args: {\n`;
    for (const p of inParams) {
      output += `          ${p.parameter_name}: ${pgTypeToTs(p.data_type)}\n`;
    }
    output += `        }\n        Returns: unknown\n      }\n`;
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
    'date': 'string',
    'jsonb': 'Json',
    'json': 'Json',
    'character varying': 'string',
    'ARRAY': 'any[]',
  };
  return map[pgType] || 'any';
}

generateTypes().catch(console.error);
