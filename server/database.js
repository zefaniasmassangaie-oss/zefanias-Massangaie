import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const schemaPath = resolve(projectDirectory, 'database', 'schema.sql')
const roleMigrationPath = resolve(
  projectDirectory,
  'database',
  'migrations',
  '001_add_reader_role.sql'
)
const cancelledLoansMigrationPath = resolve(
  projectDirectory,
  'database',
  'migrations',
  '002_add_cancelled_loans.sql'
)

export const defaultDatabasePath = resolve(
  projectDirectory,
  'database',
  'biblioteca.db'
)

export async function openDatabase(
  databasePath = process.env.BIBLIOTECA_DB_PATH || defaultDatabasePath
) {
  await mkdir(dirname(databasePath), { recursive: true })

  const [schema, roleMigration, cancelledLoansMigration] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(roleMigrationPath, 'utf8'),
    readFile(cancelledLoansMigrationPath, 'utf8')
  ])
  const database = new DatabaseSync(databasePath)

  try {
    database.exec('PRAGMA foreign_keys = ON')
    database.exec(schema)

    const userTableSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'utilizadores'"
      )
      .get().sql

    if (!userTableSql.includes("'LEITOR'")) {
      database.exec(roleMigration)
    }

    const loansTableSql = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'emprestimos'"
      )
      .get().sql
    if (!loansTableSql.includes("'CANCELADO'")) {
      database.exec(cancelledLoansMigration)
    }

    const violations = database.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) {
      throw new Error(
        'A migração encontrou referências inválidas na base de dados.'
      )
    }

    return database
  } catch (error) {
    database.close()
    throw error
  }
}
