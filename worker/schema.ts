import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(), eraseHash: text('erase_hash').notNull(),
  insurer: text('insurer').notNull(), tpa: text('tpa'), city: text('city'),
  requestType: text('request_type', { enum: ['preauth', 'enhancement', 'discharge'] }).notNull(),
  submittedAt: text('submitted_at').notNull(), decidedAt: text('decided_at').notNull(),
  outcome: text('outcome', { enum: ['approved', 'partial', 'rejected', 'paid-and-left'] }).notNull(),
  consentVersion: text('consent_version').notNull(), createdAt: text('created_at').notNull(),
}, (t) => [index('reports_cohort').on(t.insurer, t.requestType, t.submittedAt), index('reports_created').on(t.createdAt)]);
export const aggregates = sqliteTable('aggregates', {
  insurer: text('insurer').notNull(), requestType: text('request_type').notNull(), period: text('period').notNull(),
  n: integer('n').notNull(), totalMinutes: integer('total_minutes').notNull(), beyondWindow: integer('beyond_window'), updatedAt: text('updated_at').notNull(),
}, (t) => [primaryKey({ columns: [t.insurer, t.requestType, t.period] })]);
export const aggregateSuppressions = sqliteTable('aggregate_suppressions', {
  insurer: text('insurer').notNull(), requestType: text('request_type').notNull(), period: text('period').notNull(),
}, (t) => [primaryKey({ columns: [t.insurer, t.requestType, t.period] })]);
export const events = sqliteTable('events', {
  day: text('day').notNull(), name: text('name').notNull(), n: integer('n').notNull(),
}, (t) => [primaryKey({ columns: [t.day, t.name] })]);
export const quotas = sqliteTable('quotas', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
}, (t) => [index('quotas_expiry').on(t.expiresAt)]);
export const transfers = sqliteTable('transfers', {
  codeHash: text('code_hash').primaryKey(), ciphertext: text('ciphertext').notNull(),
  expiresAt: integer('expires_at').notNull(), attempts: integer('attempts').notNull().default(0),
}, (t) => [index('transfers_expiry').on(t.expiresAt)]);
// CHECK constraints and transactional erasure trigger are maintained in migrations/*.sql.
