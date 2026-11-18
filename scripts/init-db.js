import { openDatabase, defaultDatabasePath } from '../server/database.js'

const database = await openDatabase()

try {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map(({ name }) => name)

  console.log(`SQLite inicializado em ${defaultDatabasePath}`)
  console.log(`Tabelas: ${tables.join(', ')}`)
} finally {
  database.close()
}
