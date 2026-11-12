import * as sqlite from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

fs.mkdirSync(path.dirname(config.DATABASE_PATH), { recursive: true });
const DatabaseCtor=(sqlite as any).Database??(sqlite as any).DatabaseSync;
export const db = new DatabaseCtor(config.DATABASE_PATH);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');

const migrations=[
 {version:1,sql:`
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

export function migrate(){
 db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
 for(const migration of migrations){
  const exists=db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(migration.version);if(exists)continue;
  db.exec('BEGIN IMMEDIATE');try{db.exec(migration.sql);db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(migration.version,new Date().toISOString());db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK')}catch{}throw error;}
 }
}
export const nowIso=()=>new Date().toISOString();
export function audit(actorType:string,actorId:string|null,action:string,objectType:string,objectId:string|null,metadata:object={}){
 db.prepare('INSERT INTO audit_logs(actor_type,actor_id,action,object_type,object_id,timestamp_utc,metadata_json) VALUES(?,?,?,?,?,?,?)').run(actorType,actorId,action,objectType,objectId,nowIso(),JSON.stringify(metadata));
}
