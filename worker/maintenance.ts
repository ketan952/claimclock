import type { Database } from './types.ts';
import aggregateSql from './aggregate.sql';

export async function aggregate(db: Database): Promise<void> {
  // Statements contain no procedural blocks or semicolons in quoted strings.
  const statements = aggregateSql.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  await db.batch(statements.map(sql => db.prepare(sql)));
}
