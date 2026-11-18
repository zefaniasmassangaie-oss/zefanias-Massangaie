import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, defaultDatabasePath } from '../server/database.js'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const seedPath = resolve(projectDirectory, 'database', 'seed.sql')
const seed = await readFile(seedPath, 'utf8')
const database = await openDatabase()

try {
  database.exec('BEGIN IMMEDIATE')
  database.exec(seed)
  database.exec('COMMIT')

  const total = database
    .prepare('SELECT COUNT(*) AS total FROM livros')
    .get().total
  console.log(
    `Catálogo atualizado em ${defaultDatabasePath}; total de títulos: ${total}`
  )
} catch (error) {
  database.exec('ROLLBACK')
  throw error
} finally {
  database.close()
}
