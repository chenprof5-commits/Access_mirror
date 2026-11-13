import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import * as sqlite from 'node:sqlite';
import { getDatabase } from '@netlify/database';
import { config } from './config.ts';

type SqliteDb = InstanceType<any>;
const netlifyDatabase = config.isNetlify;
const transactionContext = new AsyncLocalStorage<any>();
let sqliteDb: SqliteDb | null = null;
let pgPool: any = null;

if (netlifyDatabase) {
  if (!process.env.NETLIFY_DB_URL) throw new Error('Netlify Database n’est pas provisionnée. Ajoutez une migration puis déployez le site.');
  pgPool = getDatabase().pool;
} else {
  const DatabaseCtor = (sqlite as any).Database ?? (sqlite as any).DatabaseSync;
  fs.mkdirSync(path.dirname(config.DATABASE_PATH), { recursive: true });
  sqliteDb = new DatabaseCtor(config.DATABASE_PATH);
  sqliteDb!.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
}

const sqliteMigrations = [
  { version: 1, sql: `
  CREATE TABLE admins(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT);
  CREATE TABLE admin_sessions(id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, admin_id INTEGER NOT NULL REFERENCES admins(id), expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE clients(id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, internal_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
  CREATE TABLE invitations(id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, first_started_at TEXT, trial_expires_at TEXT, bound_session_hash TEXT, revoked_at TEXT);
  CREATE TABLE client_sessions(id INTEGER PRIMARY KEY, invitation_id INTEGER NOT NULL REFERENCES invitations(id), token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
  CREATE TABLE payments(id INTEGER PRIMARY KEY, invitation_id INTEGER NOT NULL REFERENCES invitations(id), status TEXT NOT NULL CHECK(status IN ('pending','confirmed','cancelled')), amount INTEGER, currency TEXT, confirmed_at TEXT, confirmed_by INTEGER REFERENCES admins(id), note TEXT);
  CREATE TABLE activation_codes(id INTEGER PRIMARY KEY, invitation_id INTEGER NOT NULL REFERENCES invitations(id), code_hash TEXT NOT NULL UNIQUE, plan_duration_seconds INTEGER, is_permanent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, redeemed_at TEXT, redeemed_session_id INTEGER, revoked_at TEXT);
  CREATE TABLE licenses(id INTEGER PRIMARY KEY, invitation_id INTEGER NOT NULL REFERENCES invitations(id), activation_code_id INTEGER REFERENCES activation_codes(id), activated_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT);
  CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT, timestamp_utc TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}');
  CREATE TABLE rate_limits(key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_started_at TEXT NOT NULL, blocked_until TEXT);
  CREATE INDEX idx_inv_client ON invitations(client_id); CREATE INDEX idx_sessions_inv ON client_sessions(invitation_id); CREATE INDEX idx_licenses_inv ON licenses(invitation_id); CREATE INDEX idx_audit_time ON audit_logs(timestamp_utc);
 `},
];

function pgSql(statement: string) {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

class DatabaseFacade {
  prepare(statement: string) {
    return {
      get: async (...values: unknown[]) => {
        if (!pgPool) return sqliteDb!.prepare(statement.replace(/\s+FOR UPDATE\s*$/i, '')).get(...values);
        const result = await (transactionContext.getStore() ?? pgPool).query(pgSql(statement), values);
        return result.rows[0];
      },
      all: async (...values: unknown[]) => {
        if (!pgPool) return sqliteDb!.prepare(statement.replace(/\s+FOR UPDATE\s*$/i, '')).all(...values);
        const result = await (transactionContext.getStore() ?? pgPool).query(pgSql(statement), values);
        return result.rows;
      },
      run: async (...values: unknown[]) => {
        if (!pgPool) return sqliteDb!.prepare(statement.replace(/\s+FOR UPDATE\s*$/i, '')).run(...values);
        let query = pgSql(statement);
        if (/^\s*INSERT\s+INTO\s+(admins|admin_sessions|clients|invitations|client_sessions|payments|activation_codes|licenses|audit_logs)\b/i.test(statement) && !/\bRETURNING\b/i.test(statement)) query += ' RETURNING id';
        const result = await (transactionContext.getStore() ?? pgPool).query(query, values);
        return { changes: result.rowCount ?? 0, lastInsertRowid: result.rows[0]?.id };
      },
    };
  }

  exec(statement: string) {
    if (pgPool) return pgPool.query(statement);
    return sqliteDb!.exec(statement);
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (!pgPool) {
      sqliteDb!.exec('BEGIN IMMEDIATE');
      try { const result = await work(); sqliteDb!.exec('COMMIT'); return result; }
      catch (error) { try { sqliteDb!.exec('ROLLBACK'); } catch {} throw error; }
    }
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionContext.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally { client.release(); }
  }

  async lockAdminBootstrap() {
    if (pgPool) await (transactionContext.getStore() ?? pgPool).query('LOCK TABLE admins IN EXCLUSIVE MODE');
  }

  close() {
    if (pgPool) return pgPool.end();
    sqliteDb!.close();
  }
}

export const db = new DatabaseFacade();

export async function migrate() {
  // Netlify applies netlify/database/migrations before publishing a deployment.
  if (netlifyDatabase) return;
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
  for (const migration of sqliteMigrations) {
    const exists = await db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(migration.version);
    if (exists) continue;
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(migration.version, new Date().toISOString());
    });
  }
}

export const nowIso = () => new Date().toISOString();
export async function audit(actorType: string, actorId: string | null, action: string, objectType: string, objectId: string | null, metadata: object = {}) {
  await db.prepare('INSERT INTO audit_logs(actor_type,actor_id,action,object_type,object_id,timestamp_utc,metadata_json) VALUES(?,?,?,?,?,?,?)').run(actorType, actorId, action, objectType, objectId, nowIso(), JSON.stringify(metadata));
}
