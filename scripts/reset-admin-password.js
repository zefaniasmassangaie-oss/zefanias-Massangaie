import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { defaultDatabasePath, openDatabase } from '../server/database.js'

const scrypt = promisify(scryptCallback)
const email = process.argv[2]?.trim().toLowerCase()

function readSecret(prompt) {
  const input = process.stdin
  const output = process.stdout

  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Execute este comando num terminal interativo.')
  }

  return new Promise((resolve, reject) => {
    let value = ''

    function finish(error) {
      input.off('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      if (error) reject(error)
      else resolve(value)
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Operação cancelada.'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          return
        }
        if (character === '\u007f' || character === '\b') {
          const characters = Array.from(value)
          if (characters.length > 0) {
            characters.pop()
            value = characters.join('')
            output.write('\b \b')
          }
          continue
        }
        if (character >= ' ' && character !== '\u001b') {
          value += character
          output.write('*')
        }
      }
    }

    output.write(prompt)
    input.setEncoding('utf8')
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

if (!email) {
  console.error(
    'Indica o e-mail do administrador: npm run db:reset-admin -- email'
  )
  process.exitCode = 1
} else {
  let database

  try {
    database = await openDatabase()
    const user = database
      .prepare(
        "SELECT id FROM utilizadores WHERE email = ? AND nivel = 'ADMIN' AND estado = 'ATIVO'"
      )
      .get(email)

    if (!user) {
      throw new Error(
        'Não foi encontrado um administrador ativo com esse e-mail.'
      )
    }

    const password = await readSecret('Nova senha (mínimo 12 caracteres): ')
    if (password.length < 12) {
      throw new Error('A senha deve ter pelo menos 12 caracteres.')
    }

    const confirmation = await readSecret('Repita a nova senha: ')
    if (password !== confirmation) {
      throw new Error('As senhas não coincidem.')
    }

    const salt = randomBytes(16).toString('hex')
    const digest = await scrypt(password, salt, 64)
    const passwordHash = `scrypt$${salt}$${digest.toString('hex')}`

    database.exec('BEGIN IMMEDIATE')
    try {
      const result = database
        .prepare(
          "UPDATE utilizadores SET senha_hash = ? WHERE id = ? AND nivel = 'ADMIN' AND estado = 'ATIVO'"
        )
        .run(passwordHash, user.id)
      if (result.changes !== 1) {
        throw new Error(
          'A conta foi alterada durante a operação; senha não redefinida.'
        )
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }

    const databasePath = process.env.BIBLIOTECA_DB_PATH || defaultDatabasePath
    console.log(`Senha redefinida para ${email} em ${databasePath}.`)
    console.log('Reinicia a API e entra com a nova senha.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    database?.close()
  }
}
