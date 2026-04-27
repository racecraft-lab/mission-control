#!/usr/bin/env node

const Database = require('better-sqlite3')

const dbPath = process.env.MISSION_CONTROL_DB_PATH
if (!dbPath) {
  console.error('MISSION_CONTROL_DB_PATH is required')
  process.exit(1)
}

const db = new Database(dbPath)

try {
  const rows = db.prepare('SELECT id, feature_flags FROM workspaces').all()
  if (rows.length === 0) {
    throw new Error(`No workspaces found in ${dbPath}; start the e2e app once before seeding`)
  }

  const update = db.prepare('UPDATE workspaces SET feature_flags = ? WHERE id = ?')
  for (const row of rows) {
    let flags = {}
    if (row.feature_flags) {
      try {
        const parsed = JSON.parse(row.feature_flags)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          flags = parsed
        }
      } catch {
        flags = {}
      }
    }

    flags.FEATURE_WORKSPACE_SWITCHER = true
    update.run(JSON.stringify(flags), row.id)
  }

  db.pragma('wal_checkpoint(TRUNCATE)')
  console.log(`[e2e-docker] seeded FEATURE_WORKSPACE_SWITCHER for ${rows.length} workspace(s)`)
} finally {
  db.close()
}
