const fs = require('fs');
const path = require('path');

const isPostgres = !!process.env.DATABASE_URL;
let dbClient;

// Initialize Database Connection
if (isPostgres) {
  const { Pool } = require('pg');
  dbClient = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for hosting platforms like Render
  });
} else {
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(__dirname, 'todo.db');
  dbClient = new Database(dbPath);
}

// Create Schema On Startup
async function initDB() {
  const query = `
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  if (isPostgres) {
    // Convert Serial/Timestamp schema variant slightly if using pg
    await dbClient.query(query.replace('SERIAL PRIMARY KEY', 'SERIAL PRIMARY KEY'));
  } else {
    // SQLite specific adjustments
    const sqliteQuery = `
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    dbClient.prepare(sqliteQuery).run();
  }
  console.log(`Database initialized using: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
}

// Database CRUD Operations Layer
const db = {
  initDB,

  async addTask(chatId, task) {
    if (isPostgres) {
      const res = await dbClient.query('INSERT INTO todos (chat_id, task) VALUES ($1, $2) RETURNING id', [chatId.toString(), task]);
      return res.rows[0].id;
    } else {
      const stmt = dbClient.prepare('INSERT INTO todos (chat_id, task) VALUES (?, ?)');
      const info = stmt.run(chatId.toString(), task);
      return info.lastInsertRowid;
    }
  },

  async getTasks(chatId) {
    if (isPostgres) {
      const res = await dbClient.query('SELECT * FROM todos WHERE chat_id = $1 ORDER BY created_at ASC', [chatId.toString()]);
      return res.rows;
    } else {
      return dbClient.prepare('SELECT * FROM todos WHERE chat_id = ? ORDER BY created_at ASC').all(chatId.toString());
    }
  },

  async markDone(chatId, taskIndex) {
    const tasks = await this.getTasks(chatId);
    const target = tasks[taskIndex];
    if (!target) return false;

    if (isPostgres) {
      await dbClient.query("UPDATE todos SET status = 'completed' WHERE id = $1 AND chat_id = $2", [target.id, chatId.toString()]);
    } else {
      dbClient.prepare("UPDATE todos SET status = 'completed' WHERE id = ? AND chat_id = ?").run(target.id, chatId.toString());
    }
    return target.task;
  },

  async deleteTask(chatId, taskIndex) {
    const tasks = await this.getTasks(chatId);
    const target = tasks[taskIndex];
    if (!target) return false;

    if (isPostgres) {
      await dbClient.query('DELETE FROM todos WHERE id = $1 AND chat_id = $2', [target.id, chatId.toString()]);
    } else {
      dbClient.prepare('DELETE FROM todos WHERE id = ? AND chat_id = ?').run(target.id, chatId.toString());
    }
    return target.task;
  },

  async clearCompleted(chatId) {
    if (isPostgres) {
      const res = await dbClient.query("DELETE FROM todos WHERE chat_id = $1 AND status = 'completed'", [chatId.toString()]);
      return res.rowCount;
    } else {
      const stmt = dbClient.prepare("DELETE FROM todos WHERE chat_id = ? AND status = 'completed'");
      const info = stmt.run(chatId.toString());
      return info.changes;
    }
  }
};

module.exports = db;
