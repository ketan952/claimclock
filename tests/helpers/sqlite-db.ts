import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import type { Database, Statement } from '../../worker/types.ts';

const migrations = ['0001_initial.sql', '0002_optional_report_city.sql', '0003_encrypted_transfers.sql', '0004_user_vaults.sql']
  .map(name => readFileSync(new NodeURL(`../../migrations/${name}`, import.meta.url), 'utf8'));
/** In-memory D1 stand-in with every migration applied; shared by the Worker route tests. */
export class SqliteDB implements Database {
  sql = new DatabaseSync(':memory:');
  constructor() { for (const migration of migrations) this.sql.exec(migration); }
  prepare(sql: string): Statement {
    const database = this.sql;
    let values: (string | number | null)[] = [];
    const statement: Statement = {
      bind(...args) { values = args; return statement; },
      async first<T>() { return (database.prepare(sql).get(...values) ?? null) as T | null; },
      async all<T>() { return { results: database.prepare(sql).all(...values) as T[], success: true }; },
      async run() { const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  }
  async batch(statements: Statement[]) {
    this.sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sql.exec('COMMIT'); return results; }
    catch (e) { this.sql.exec('ROLLBACK'); throw e; }
  }
}
