/**
 * Open the SQLite database with better-sqlite3, falling back to Node's
 * built-in node:sqlite when the native module can't load (e.g. a local
 * install compiled for a different Node version). The Docker image always
 * uses better-sqlite3; the fallback only exists so local development works.
 * Only the subset of the better-sqlite3 API that database.js uses is mapped.
 */

function openWithNodeSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  return {
    pragma: (s) => db.prepare(`PRAGMA ${s}`).all(),
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql);
      return { run: (...a) => st.run(...a), get: (...a) => st.get(...a), all: (...a) => st.all(...a) };
    },
    close: () => db.close(),
  };
}

function openDatabase(file) {
  try {
    const Database = require('better-sqlite3');
    return new Database(file);
  } catch (err) {
    const nativeLoadFailure = err.code === 'ERR_DLOPEN_FAILED' || /NODE_MODULE_VERSION|Could not locate the bindings/.test(err.message);
    if (!nativeLoadFailure) throw err;
    console.warn(`[database] better-sqlite3 unavailable (${err.code || 'load error'}), using node:sqlite fallback`);
    return openWithNodeSqlite(file);
  }
}

module.exports = { openDatabase };
