import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'catan.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      token_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      host_id TEXT NOT NULL,
      max_players INTEGER DEFAULT 4 CHECK(max_players BETWEEN 2 AND 6),
      turn_timer INTEGER DEFAULT 120,
      status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','playing','finished')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS room_players (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      color TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      winner_id TEXT,
      finished_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );
  `);

  // Databases created before sessions existed lack the token column
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userColumns.some(c => c.name === 'token_hash')) db.exec('ALTER TABLE users ADD COLUMN token_hash TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_token_hash ON users(token_hash)');
}

