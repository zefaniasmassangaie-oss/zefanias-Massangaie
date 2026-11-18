import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { openDatabase } from './database.js'

const scrypt = promisify(scryptCallback)
const sessionDurationSeconds = 8 * 60 * 60
const sessionCookieName = 'biblioteca_session'

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > 16_384) {
      throw Object.assign(new Error('O pedido é demasiado grande.'), {
        statusCode: 413
      })
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Pedido inválido.'), { statusCode: 400 })
  }
}

function safeUser(row) {
  return { id: row.id, nome: row.nome, email: row.email, nivel: row.nivel }
}

function sessionCookie(sessionId) {
  return `${sessionCookieName}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationSeconds}`
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? []
  const cookie = cookies
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return cookie?.slice(name.length + 1) ?? null
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const digest = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${digest.toString('hex')}`
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, salt, storedDigest] = passwordHash.split('$')
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !storedDigest ||
    !/^[0-9a-f]{128}$/i.test(storedDigest)
  ) {
    return false
  }

  const digest = await scrypt(password, salt, 64)
  return timingSafeEqual(digest, Buffer.from(storedDigest, 'hex'))
}

function validEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
}

function getSessionUser(request, database, sessions) {
  const sessionId = getCookie(request, sessionCookieName)
  const session = sessionId ? sessions.get(sessionId) : null
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) sessions.delete(sessionId)
    return null
  }

  const user = database
    .prepare("SELECT * FROM utilizadores WHERE id = ? AND estado = 'ATIVO'")
    .get(session.userId)
  if (!user) sessions.delete(sessionId)
  return user ?? null
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function getDailyReportData(database, reportDate) {
  const exits = database
    .prepare(
      `SELECT e.id, e.data_emprestimo, e.data_prevista_devolucao,
        b.titulo AS livro_titulo, l.nome AS leitor_nome, u.nome AS registado_por
      FROM emprestimos e
      JOIN livros b ON b.id = e.livro_id
      JOIN leitores l ON l.id = e.leitor_id
      JOIN utilizadores u ON u.id = e.usuario_id
      WHERE date(e.data_emprestimo) = ?
        AND e.estado <> 'CANCELADO'
      ORDER BY e.data_emprestimo, e.id`
    )
    .all(reportDate)
  const returns = database
    .prepare(
      `SELECT e.id, e.data_devolucao, b.titulo AS livro_titulo,
        l.nome AS leitor_nome
      FROM emprestimos e
      JOIN livros b ON b.id = e.livro_id
      JOIN leitores l ON l.id = e.leitor_id
      WHERE date(e.data_devolucao) = ?
      ORDER BY e.data_devolucao, e.id`
    )
    .all(reportDate)
  const overdue = database
    .prepare(
      `SELECT e.id, e.data_prevista_devolucao, b.titulo AS livro_titulo,
        l.nome AS leitor_nome
      FROM emprestimos e
      JOIN livros b ON b.id = e.livro_id
      JOIN leitores l ON l.id = e.leitor_id
      WHERE date(e.data_emprestimo) <= ?
        AND date(e.data_prevista_devolucao) < ?
        AND e.estado <> 'CANCELADO'
        AND (e.data_devolucao IS NULL OR date(e.data_devolucao) > ?)
      ORDER BY e.data_prevista_devolucao, e.id`
    )
    .all(reportDate, reportDate, reportDate)
  const registered = database
    .prepare(
      `SELECT r.id, r.data_referencia, r.total_saidas,
        r.total_devolucoes, r.total_atrasados, r.criado_em,
        u.nome AS registado_por
      FROM relatorios_diarios r
      JOIN utilizadores u ON u.id = r.utilizador_id
      WHERE r.data_referencia = ?`
    )
    .get(reportDate)

  return {
    date: reportDate,
    totals: {
      exits: exits.length,
      returns: returns.length,
      overdue: overdue.length
    },
    exits,
    returns,
    overdue,
    registered: registered ?? null
  }
}

export async function createAppServer({ databasePath } = {}) {
  const database = await openDatabase(databasePath)
  const sessions = new Map()

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost')

    try {
      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/setup-status'
      ) {
        const { total } = database
          .prepare('SELECT COUNT(*) AS total FROM utilizadores')
          .get()
        sendJson(response, 200, { setupRequired: total === 0 })
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/setup') {
        const input = await readJsonBody(request)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : ''
        const password =
          typeof input.password === 'string' ? input.password : ''

        if (
          name.length < 2 ||
          name.length > 100 ||
          !validEmail(email) ||
          password.length < 12
        ) {
          sendJson(response, 400, {
            message:
              'Indica um nome, um e-mail válido e uma senha com pelo menos 12 caracteres.'
          })
          return
        }

        const passwordHash = await hashPassword(password)
        database.exec('BEGIN IMMEDIATE')
        let user

        try {
          const { total } = database
            .prepare('SELECT COUNT(*) AS total FROM utilizadores')
            .get()
          if (total !== 0) {
            database.exec('ROLLBACK')
            sendJson(response, 409, {
              message: 'A configuração inicial já foi concluída.'
            })
            return
          }

          const result = database
            .prepare(
              "INSERT INTO utilizadores (nome, email, senha_hash, nivel) VALUES (?, ?, ?, 'ADMIN')"
            )
            .run(name, email, passwordHash)
          user = safeUser(
            database
              .prepare('SELECT * FROM utilizadores WHERE id = ?')
              .get(result.lastInsertRowid)
          )
          database.exec('COMMIT')
        } catch (error) {
          database.exec('ROLLBACK')
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            sendJson(response, 409, {
              message: 'Já existe um utilizador com esse e-mail.'
            })
            return
          }
          throw error
        }

        const sessionId = randomBytes(32).toString('hex')
        sessions.set(sessionId, {
          userId: user.id,
          expiresAt: Date.now() + sessionDurationSeconds * 1000
        })
        sendJson(
          response,
          201,
          { user },
          { 'Set-Cookie': sessionCookie(sessionId) }
        )
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/login') {
        const input = await readJsonBody(request)
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : ''
        const password =
          typeof input.password === 'string' ? input.password : ''
        const row = database
          .prepare(
            "SELECT * FROM utilizadores WHERE email = ? AND estado = 'ATIVO'"
          )
          .get(email)

        if (!row || !(await verifyPassword(password, row.senha_hash))) {
          sendJson(response, 401, { message: 'E-mail ou senha inválidos.' })
          return
        }

        const sessionId = randomBytes(32).toString('hex')
        sessions.set(sessionId, {
          userId: row.id,
          expiresAt: Date.now() + sessionDurationSeconds * 1000
        })
        sendJson(
          response,
          200,
          { user: safeUser(row) },
          { 'Set-Cookie': sessionCookie(sessionId) }
        )
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/me') {
        const sessionId = getCookie(request, sessionCookieName)
        const session = sessionId ? sessions.get(sessionId) : null
        if (!session || session.expiresAt <= Date.now()) {
          if (sessionId) sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const row = database
          .prepare(
            "SELECT * FROM utilizadores WHERE id = ? AND estado = 'ATIVO'"
          )
          .get(session.userId)
        if (!row) {
          sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        sendJson(response, 200, { user: safeUser(row) })
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/dashboard'
      ) {
        const sessionId = getCookie(request, sessionCookieName)
        const session = sessionId ? sessions.get(sessionId) : null
        if (!session || session.expiresAt <= Date.now()) {
          if (sessionId) sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const user = database
          .prepare(
            "SELECT * FROM utilizadores WHERE id = ? AND estado = 'ATIVO'"
          )
          .get(session.userId)
        if (!user) {
          sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const catalog = database
          .prepare(
            'SELECT COUNT(*) AS titles, COALESCE(SUM(quantidade), 0) AS copies FROM livros'
          )
          .get()
        const readers = database
          .prepare('SELECT COUNT(*) AS total FROM leitores')
          .get().total
        const activeLoans = database
          .prepare(
            "SELECT COUNT(*) AS total FROM emprestimos WHERE estado = 'EMPRESTADO'"
          )
          .get().total
        const overdueLoans = database
          .prepare(
            "SELECT COUNT(*) AS total FROM emprestimos WHERE estado = 'EMPRESTADO' AND date(data_prevista_devolucao) < date('now')"
          )
          .get().total
        const totalUsers = database
          .prepare('SELECT COUNT(*) AS total FROM utilizadores')
          .get().total
        const myLoans = database
          .prepare(
            "SELECT COUNT(*) AS total FROM emprestimos e JOIN leitores l ON l.id = e.leitor_id WHERE l.email = ? COLLATE NOCASE AND e.estado = 'EMPRESTADO'"
          )
          .get(user.email).total
        const myOverdueLoans = database
          .prepare(
            "SELECT COUNT(*) AS total FROM emprestimos e JOIN leitores l ON l.id = e.leitor_id WHERE l.email = ? COLLATE NOCASE AND e.estado = 'EMPRESTADO' AND date(e.data_prevista_devolucao) < date('now')"
          )
          .get(user.email).total

        const navigationByRole = {
          ADMIN: [
            'Livros',
            'Leitores',
            'Empréstimos',
            'Devoluções',
            'Utilizadores',
            'Relatórios',
            'Perfil'
          ],
          BIBLIOTECARIO: [
            'Livros',
            'Leitores',
            'Empréstimos',
            'Devoluções',
            'Relatórios',
            'Perfil'
          ],
          LEITOR: [
            'Consultar livros',
            'Meus empréstimos',
            'Minhas devoluções',
            'Perfil'
          ]
        }
        const statsByRole = {
          ADMIN: [
            { label: 'Títulos no catálogo', value: catalog.titles },
            { label: 'Leitores', value: readers },
            { label: 'Empréstimos ativos', value: activeLoans },
            { label: 'Utilizadores', value: totalUsers }
          ],
          BIBLIOTECARIO: [
            { label: 'Títulos no catálogo', value: catalog.titles },
            { label: 'Leitores', value: readers },
            { label: 'Empréstimos ativos', value: activeLoans },
            { label: 'Devoluções em atraso', value: overdueLoans }
          ],
          LEITOR: [
            {
              label: 'Exemplares no catálogo',
              value: catalog.copies - activeLoans
            },
            { label: 'Meus empréstimos ativos', value: myLoans },
            { label: 'Minhas devoluções em atraso', value: myOverdueLoans }
          ]
        }

        sendJson(response, 200, {
          user: safeUser(user),
          navigation: navigationByRole[user.nivel],
          stats: statsByRole[user.nivel]
        })
        return
      }

      if (requestUrl.pathname === '/api/reports/daily') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'Relatórios disponíveis apenas ao pessoal da biblioteca.'
          })
          return
        }

        if (request.method === 'GET') {
          const reportDate =
            requestUrl.searchParams.get('date') ??
            new Date().toISOString().slice(0, 10)
          if (
            !isValidDate(reportDate) ||
            reportDate > new Date().toISOString().slice(0, 10)
          ) {
            sendJson(response, 400, {
              message: 'Indica uma data válida, não futura.'
            })
            return
          }
          sendJson(response, 200, {
            report: getDailyReportData(database, reportDate)
          })
          return
        }

        if (request.method === 'POST') {
          const input = await readJsonBody(request)
          const reportDate = input.date
          if (
            !isValidDate(reportDate) ||
            reportDate > new Date().toISOString().slice(0, 10)
          ) {
            sendJson(response, 400, {
              message: 'Indica uma data válida, não futura.'
            })
            return
          }

          database.exec('BEGIN IMMEDIATE')
          try {
            const existing = database
              .prepare(
                'SELECT id FROM relatorios_diarios WHERE data_referencia = ?'
              )
              .get(reportDate)
            if (existing) {
              database.exec('ROLLBACK')
              sendJson(response, 409, {
                message: 'Já existe um relatório registado para esta data.'
              })
              return
            }

            const report = getDailyReportData(database, reportDate)
            const result = database
              .prepare(
                `INSERT INTO relatorios_diarios
                  (data_referencia, total_saidas, total_devolucoes, total_atrasados, utilizador_id)
                VALUES (?, ?, ?, ?, ?)`
              )
              .run(
                reportDate,
                report.totals.exits,
                report.totals.returns,
                report.totals.overdue,
                user.id
              )
            database.exec('COMMIT')
            sendJson(response, 201, {
              id: Number(result.lastInsertRowid),
              report: getDailyReportData(database, reportDate)
            })
          } catch (error) {
            database.exec('ROLLBACK')
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              sendJson(response, 409, {
                message: 'Já existe um relatório registado para esta data.'
              })
              return
            }
            throw error
          }
          return
        }
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/books') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const books = database
          .prepare(
            `SELECT b.id, b.titulo, b.autor, b.categoria, b.ano,
              b.quantidade AS quantidade_total,
              b.quantidade - COALESCE(active.total, 0) AS disponiveis
            FROM livros b
            LEFT JOIN (
              SELECT livro_id, COUNT(*) AS total
              FROM emprestimos
              WHERE estado = 'EMPRESTADO'
              GROUP BY livro_id
            ) active ON active.livro_id = b.id
            ORDER BY b.titulo COLLATE NOCASE`
          )
          .all()
        sendJson(response, 200, { books })
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/books') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode cadastrar livros.'
          })
          return
        }

        const input = await readJsonBody(request)
        const title = typeof input.title === 'string' ? input.title.trim() : ''
        const author =
          typeof input.author === 'string' ? input.author.trim() : ''
        const category =
          typeof input.category === 'string' ? input.category.trim() : null
        const year =
          input.year === '' || input.year == null ? null : Number(input.year)
        const quantity = Number(input.quantity)
        if (
          title.length < 1 ||
          title.length > 200 ||
          author.length < 1 ||
          author.length > 150 ||
          (category && category.length > 100) ||
          (year !== null &&
            (!Number.isInteger(year) || year < 0 || year > 9999)) ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1
        ) {
          sendJson(response, 400, {
            message:
              'Confirma os dados do livro e indica pelo menos um exemplar.'
          })
          return
        }

        const result = database
          .prepare(
            'INSERT INTO livros (titulo, autor, categoria, ano, quantidade) VALUES (?, ?, ?, ?, ?)'
          )
          .run(title, author, category || null, year, quantity)
        sendJson(response, 201, { id: Number(result.lastInsertRowid) })
        return
      }

      const bookRoute = requestUrl.pathname.match(/^\/api\/books\/(\d+)$/)
      if (bookRoute && ['PUT', 'DELETE'].includes(request.method)) {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode gerir livros.'
          })
          return
        }

        const bookId = Number(bookRoute[1])
        if (request.method === 'DELETE') {
          const history = database
            .prepare(
              'SELECT COUNT(*) AS total FROM emprestimos WHERE livro_id = ?'
            )
            .get(bookId).total
          if (history > 0) {
            sendJson(response, 409, {
              message:
                'Não é possível eliminar um livro com histórico de empréstimos.'
            })
            return
          }
          const result = database
            .prepare('DELETE FROM livros WHERE id = ?')
            .run(bookId)
          if (result.changes === 0) {
            sendJson(response, 404, { message: 'Livro não encontrado.' })
            return
          }
          sendJson(response, 200, { ok: true })
          return
        }

        const input = await readJsonBody(request)
        const title = typeof input.title === 'string' ? input.title.trim() : ''
        const author =
          typeof input.author === 'string' ? input.author.trim() : ''
        const category =
          typeof input.category === 'string' ? input.category.trim() : null
        const year =
          input.year === '' || input.year == null ? null : Number(input.year)
        const quantity = Number(input.quantity)
        if (
          title.length < 1 ||
          title.length > 200 ||
          author.length < 1 ||
          author.length > 150 ||
          (category && category.length > 100) ||
          (year !== null &&
            (!Number.isInteger(year) || year < 0 || year > 9999)) ||
          !Number.isSafeInteger(quantity) ||
          quantity < 0
        ) {
          sendJson(response, 400, {
            message: 'Confirma os dados do livro e a quantidade de exemplares.'
          })
          return
        }

        const activeLoans = database
          .prepare(
            "SELECT COUNT(*) AS total FROM emprestimos WHERE livro_id = ? AND estado = 'EMPRESTADO'"
          )
          .get(bookId).total
        if (activeLoans > quantity) {
          sendJson(response, 409, {
            message:
              'A quantidade não pode ser menor que os empréstimos ativos.'
          })
          return
        }
        const result = database
          .prepare(
            'UPDATE livros SET titulo = ?, autor = ?, categoria = ?, ano = ?, quantidade = ? WHERE id = ?'
          )
          .run(title, author, category || null, year, quantity, bookId)
        if (result.changes === 0) {
          sendJson(response, 404, { message: 'Livro não encontrado.' })
          return
        }
        sendJson(response, 200, { ok: true })
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/readers') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (user.nivel === 'LEITOR') {
          sendJson(response, 403, {
            message:
              'Esta lista está disponível apenas ao pessoal da biblioteca.'
          })
          return
        }

        const readers = database
          .prepare(
            'SELECT id, nome, telefone, email, endereco FROM leitores ORDER BY nome COLLATE NOCASE'
          )
          .all()
        sendJson(response, 200, { readers })
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/readers') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode cadastrar leitores.'
          })
          return
        }

        const input = await readJsonBody(request)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : null
        const phone =
          typeof input.phone === 'string' ? input.phone.trim() : null
        const address =
          typeof input.address === 'string' ? input.address.trim() : null
        if (
          name.length < 2 ||
          name.length > 100 ||
          (email && !validEmail(email)) ||
          (phone && phone.length > 40) ||
          (address && address.length > 250)
        ) {
          sendJson(response, 400, {
            message: 'Confirma o nome, e-mail e telefone do leitor.'
          })
          return
        }

        try {
          const result = database
            .prepare(
              'INSERT INTO leitores (nome, email, telefone, endereco) VALUES (?, ?, ?, ?)'
            )
            .run(name, email || null, phone || null, address || null)
          sendJson(response, 201, { id: Number(result.lastInsertRowid) })
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            sendJson(response, 409, {
              message: 'Já existe um leitor com esse e-mail.'
            })
            return
          }
          throw error
        }
        return
      }

      const readerRoute = requestUrl.pathname.match(/^\/api\/readers\/(\d+)$/)
      if (readerRoute && ['PUT', 'DELETE'].includes(request.method)) {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode gerir leitores.'
          })
          return
        }

        const readerId = Number(readerRoute[1])
        const reader = database
          .prepare('SELECT * FROM leitores WHERE id = ?')
          .get(readerId)
        if (!reader) {
          sendJson(response, 404, { message: 'Leitor não encontrado.' })
          return
        }
        if (request.method === 'DELETE') {
          const linkedLoans = database
            .prepare(
              'SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id = ?'
            )
            .get(readerId).total
          if (linkedLoans > 0) {
            sendJson(response, 409, {
              message:
                'Não é possível apagar um leitor com histórico de empréstimos.'
            })
            return
          }
          const linkedUser = reader.email
            ? database
                .prepare(
                  "SELECT id FROM utilizadores WHERE email = ? COLLATE NOCASE AND nivel = 'LEITOR'"
                )
                .get(reader.email)
            : null
          if (linkedUser) {
            sendJson(response, 409, {
              message:
                'Este leitor está ligado a uma conta. Desative a conta em Utilizadores.'
            })
            return
          }
          database.prepare('DELETE FROM leitores WHERE id = ?').run(readerId)
          sendJson(response, 200, { ok: true })
          return
        }

        const input = await readJsonBody(request)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : null
        const phone =
          typeof input.phone === 'string' ? input.phone.trim() : null
        const address =
          typeof input.address === 'string' ? input.address.trim() : null
        if (
          name.length < 2 ||
          name.length > 100 ||
          (email && !validEmail(email)) ||
          (phone && phone.length > 40) ||
          (address && address.length > 250)
        ) {
          sendJson(response, 400, { message: 'Confirma os dados do leitor.' })
          return
        }

        try {
          database
            .prepare(
              'UPDATE leitores SET nome = ?, email = ?, telefone = ?, endereco = ? WHERE id = ?'
            )
            .run(name, email || null, phone || null, address || null, readerId)
          if (reader.email && email && reader.email.toLowerCase() !== email) {
            database
              .prepare(
                "UPDATE utilizadores SET email = ?, nome = ? WHERE email = ? COLLATE NOCASE AND nivel = 'LEITOR'"
              )
              .run(email, name, reader.email)
          }
          sendJson(response, 200, { ok: true })
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            sendJson(response, 409, {
              message: 'Já existe um leitor ou utilizador com esse e-mail.'
            })
            return
          }
          throw error
        }
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/loans') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const readerFilter =
          user.nivel === 'LEITOR' ? 'WHERE l.email = ? COLLATE NOCASE' : ''
        const statement = database.prepare(
          `SELECT e.id, e.data_emprestimo, e.data_prevista_devolucao,
            e.data_devolucao, e.cancelado_em, e.estado, b.titulo AS livro_titulo,
            b.autor AS livro_autor, l.nome AS leitor_nome, l.email AS leitor_email,
            u.nome AS registado_por
          FROM emprestimos e
          JOIN livros b ON b.id = e.livro_id
          JOIN leitores l ON l.id = e.leitor_id
          JOIN utilizadores u ON u.id = e.usuario_id
          ${readerFilter}
          ORDER BY CASE WHEN e.estado = 'EMPRESTADO' THEN 0 ELSE 1 END,
            e.data_prevista_devolucao, e.id DESC`
        )
        const loans =
          user.nivel === 'LEITOR' ? statement.all(user.email) : statement.all()
        sendJson(response, 200, { loans })
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/loans') {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode registar empréstimos.'
          })
          return
        }

        const input = await readJsonBody(request)
        const bookId = Number(input.bookId)
        const readerId = Number(input.readerId)
        if (
          !Number.isSafeInteger(bookId) ||
          bookId < 1 ||
          !Number.isSafeInteger(readerId) ||
          readerId < 1 ||
          !isValidDate(input.dueDate) ||
          input.dueDate < new Date().toISOString().slice(0, 10)
        ) {
          sendJson(response, 400, {
            message: 'Livro, leitor ou data de devolução inválidos.'
          })
          return
        }

        database.exec('BEGIN IMMEDIATE')
        try {
          const book = database
            .prepare(
              `SELECT b.quantidade - COUNT(e.id) AS disponiveis
              FROM livros b
              LEFT JOIN emprestimos e
                ON e.livro_id = b.id AND e.estado = 'EMPRESTADO'
              WHERE b.id = ?
              GROUP BY b.id`
            )
            .get(bookId)
          const reader = database
            .prepare('SELECT id FROM leitores WHERE id = ?')
            .get(readerId)

          if (!book || !reader) {
            database.exec('ROLLBACK')
            sendJson(response, 404, {
              message: 'Livro ou leitor não encontrado.'
            })
            return
          }
          if (book.disponiveis < 1) {
            database.exec('ROLLBACK')
            sendJson(response, 409, {
              message: 'Não há exemplares disponíveis deste livro.'
            })
            return
          }

          const result = database
            .prepare(
              'INSERT INTO emprestimos (livro_id, leitor_id, usuario_id, data_prevista_devolucao) VALUES (?, ?, ?, ?)'
            )
            .run(bookId, readerId, user.id, input.dueDate)
          database.exec('COMMIT')
          sendJson(response, 201, { id: Number(result.lastInsertRowid) })
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
        return
      }

      const loanRoute = requestUrl.pathname.match(/^\/api\/loans\/(\d+)$/)
      if (request.method === 'PUT' && loanRoute) {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode editar empréstimos.'
          })
          return
        }

        const input = await readJsonBody(request)
        const dueDate = input.dueDate
        if (!isValidDate(dueDate)) {
          sendJson(response, 400, {
            message: 'Indica uma data prevista válida.'
          })
          return
        }
        const result = database
          .prepare(
            `UPDATE emprestimos
            SET data_prevista_devolucao = ?
            WHERE id = ? AND estado = 'EMPRESTADO'
              AND date(data_emprestimo) <= ?`
          )
          .run(dueDate, Number(loanRoute[1]), dueDate)
        if (result.changes === 0) {
          sendJson(response, 409, {
            message:
              'Empréstimo não encontrado, encerrado ou com data anterior à saída.'
          })
          return
        }
        sendJson(response, 200, { ok: true })
        return
      }

      if (request.method === 'DELETE' && loanRoute) {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode cancelar empréstimos.'
          })
          return
        }

        const result = database
          .prepare(
            "UPDATE emprestimos SET estado = 'CANCELADO', cancelado_em = CURRENT_TIMESTAMP WHERE id = ? AND estado = 'EMPRESTADO'"
          )
          .run(Number(loanRoute[1]))
        if (result.changes === 0) {
          sendJson(response, 409, {
            message: 'Apenas empréstimos ativos podem ser cancelados.'
          })
          return
        }
        sendJson(response, 200, { ok: true, estado: 'CANCELADO' })
        return
      }

      const returnRoute = requestUrl.pathname.match(
        /^\/api\/loans\/(\d+)\/return$/
      )
      if (request.method === 'POST' && returnRoute) {
        const user = getSessionUser(request, database, sessions)
        if (!user) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (!['ADMIN', 'BIBLIOTECARIO'].includes(user.nivel)) {
          sendJson(response, 403, {
            message: 'O leitor não pode registar devoluções.'
          })
          return
        }

        database.exec('BEGIN IMMEDIATE')
        try {
          const result = database
            .prepare(
              "UPDATE emprestimos SET estado = 'DEVOLVIDO', data_devolucao = CURRENT_TIMESTAMP WHERE id = ? AND estado = 'EMPRESTADO'"
            )
            .run(Number(returnRoute[1]))
          if (result.changes === 0) {
            database.exec('ROLLBACK')
            sendJson(response, 409, {
              message: 'Empréstimo não encontrado ou já devolvido.'
            })
            return
          }
          database.exec('COMMIT')
          sendJson(response, 200, { ok: true })
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
        return
      }

      if (
        requestUrl.pathname === '/api/users' &&
        ['GET', 'POST'].includes(request.method)
      ) {
        const sessionId = getCookie(request, sessionCookieName)
        const session = sessionId ? sessions.get(sessionId) : null
        if (!session || session.expiresAt <= Date.now()) {
          if (sessionId) sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }

        const administrator = database
          .prepare(
            "SELECT * FROM utilizadores WHERE id = ? AND estado = 'ATIVO'"
          )
          .get(session.userId)
        if (!administrator) {
          sessions.delete(sessionId)
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (administrator.nivel !== 'ADMIN') {
          sendJson(response, 403, {
            message: 'Apenas o administrador pode gerir utilizadores.'
          })
          return
        }

        if (request.method === 'GET') {
          const users = database
            .prepare(
              'SELECT id, nome, email, nivel, estado, criado_em FROM utilizadores ORDER BY nome COLLATE NOCASE'
            )
            .all()
          sendJson(response, 200, { users })
          return
        }

        const input = await readJsonBody(request)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : ''
        const password =
          typeof input.password === 'string' ? input.password : ''
        const roles = ['ADMIN', 'BIBLIOTECARIO', 'LEITOR']

        if (
          name.length < 2 ||
          name.length > 100 ||
          !validEmail(email) ||
          password.length < 12 ||
          !roles.includes(input.role)
        ) {
          sendJson(response, 400, {
            message:
              'Confirma o nome, e-mail, senha (12 caracteres ou mais) e nível de acesso.'
          })
          return
        }

        const passwordHash = await hashPassword(password)
        database.exec('BEGIN IMMEDIATE')
        try {
          const result = database
            .prepare(
              'INSERT INTO utilizadores (nome, email, senha_hash, nivel) VALUES (?, ?, ?, ?)'
            )
            .run(name, email, passwordHash, input.role)
          if (input.role === 'LEITOR') {
            database
              .prepare(
                'INSERT OR IGNORE INTO leitores (nome, email) VALUES (?, ?)'
              )
              .run(name, email)
          }
          const user = safeUser(
            database
              .prepare('SELECT * FROM utilizadores WHERE id = ?')
              .get(result.lastInsertRowid)
          )
          database.exec('COMMIT')
          sendJson(response, 201, { user })
        } catch (error) {
          database.exec('ROLLBACK')
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            sendJson(response, 409, {
              message: 'Já existe um utilizador com esse e-mail.'
            })
            return
          }
          throw error
        }
        return
      }

      const userRoute = requestUrl.pathname.match(/^\/api\/users\/(\d+)$/)
      if (userRoute && ['PUT', 'DELETE'].includes(request.method)) {
        const administrator = getSessionUser(request, database, sessions)
        if (!administrator) {
          sendJson(response, 401, { message: 'Sessão não encontrada.' })
          return
        }
        if (administrator.nivel !== 'ADMIN') {
          sendJson(response, 403, {
            message: 'Apenas o administrador pode gerir utilizadores.'
          })
          return
        }

        const userId = Number(userRoute[1])
        const target = database
          .prepare('SELECT * FROM utilizadores WHERE id = ?')
          .get(userId)
        if (!target) {
          sendJson(response, 404, { message: 'Utilizador não encontrado.' })
          return
        }

        const activeAdministrators = database
          .prepare(
            "SELECT COUNT(*) AS total FROM utilizadores WHERE nivel = 'ADMIN' AND estado = 'ATIVO'"
          )
          .get().total
        if (request.method === 'DELETE') {
          if (target.id === administrator.id) {
            sendJson(response, 409, {
              message: 'Não podes desativar a tua própria conta.'
            })
            return
          }
          if (
            target.nivel === 'ADMIN' &&
            target.estado === 'ATIVO' &&
            activeAdministrators <= 1
          ) {
            sendJson(response, 409, {
              message: 'Não podes desativar o último administrador ativo.'
            })
            return
          }
          database
            .prepare("UPDATE utilizadores SET estado = 'INATIVO' WHERE id = ?")
            .run(userId)
          for (const [sessionId, session] of sessions) {
            if (session.userId === userId) sessions.delete(sessionId)
          }
          sendJson(response, 200, { ok: true, estado: 'INATIVO' })
          return
        }

        const input = await readJsonBody(request)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : ''
        const role = input.role
        const state = input.state
        const password =
          typeof input.password === 'string' ? input.password : ''
        if (
          name.length < 2 ||
          name.length > 100 ||
          !validEmail(email) ||
          !['ADMIN', 'BIBLIOTECARIO', 'LEITOR'].includes(role) ||
          !['ATIVO', 'INATIVO'].includes(state) ||
          (password !== '' && password.length < 12)
        ) {
          sendJson(response, 400, {
            message:
              'Confirma nome, e-mail, nível, estado e a senha (mínimo de 12 caracteres, se alterada).'
          })
          return
        }
        if (
          userId === administrator.id &&
          (role !== 'ADMIN' || state !== 'ATIVO')
        ) {
          sendJson(response, 409, {
            message: 'Não podes remover o teu próprio acesso de administrador.'
          })
          return
        }
        if (
          target.nivel === 'ADMIN' &&
          target.estado === 'ATIVO' &&
          (role !== 'ADMIN' || state !== 'ATIVO') &&
          activeAdministrators <= 1
        ) {
          sendJson(response, 409, {
            message: 'Deve existir pelo menos um administrador ativo.'
          })
          return
        }

        const duplicate = database
          .prepare(
            'SELECT id FROM utilizadores WHERE email = ? COLLATE NOCASE AND id <> ?'
          )
          .get(email, userId)
        if (duplicate) {
          sendJson(response, 409, {
            message: 'Já existe um utilizador com esse e-mail.'
          })
          return
        }

        const passwordHash = password
          ? await hashPassword(password)
          : target.senha_hash
        database.exec('BEGIN IMMEDIATE')
        try {
          database
            .prepare(
              'UPDATE utilizadores SET nome = ?, email = ?, senha_hash = ?, nivel = ?, estado = ? WHERE id = ?'
            )
            .run(name, email, passwordHash, role, state, userId)
          if (target.nivel === 'LEITOR') {
            database
              .prepare(
                'UPDATE leitores SET nome = ?, email = ? WHERE email = ? COLLATE NOCASE'
              )
              .run(name, email, target.email)
          }
          if (role === 'LEITOR') {
            database
              .prepare(
                'INSERT OR IGNORE INTO leitores (nome, email) VALUES (?, ?)'
              )
              .run(name, email)
          }
          database.exec('COMMIT')
          if (state === 'INATIVO') {
            for (const [sessionId, session] of sessions) {
              if (session.userId === userId) sessions.delete(sessionId)
            }
          }
          const updatedUser = database
            .prepare(
              'SELECT id, nome, email, nivel, estado, criado_em FROM utilizadores WHERE id = ?'
            )
            .get(userId)
          sendJson(response, 200, { user: updatedUser })
        } catch (error) {
          database.exec('ROLLBACK')
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            sendJson(response, 409, {
              message: 'Esse e-mail já está associado a outro registo.'
            })
            return
          }
          throw error
        }
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/logout') {
        const sessionId = getCookie(request, sessionCookieName)
        if (sessionId) sessions.delete(sessionId)
        sendJson(
          response,
          200,
          { ok: true },
          {
            'Set-Cookie': `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
          }
        )
        return
      }

      sendJson(response, 404, { message: 'Endpoint não encontrado.' })
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, error.statusCode ?? 500, {
          message: error.statusCode
            ? error.message
            : 'Erro interno do servidor.'
        })
      } else {
        response.destroy()
      }
    }
  })

  server.once('close', () => database.close())
  return server
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const port = Number(process.env.PORT || 3001)
  const server = await createAppServer()
  server.listen(port, '127.0.0.1', () => {
    console.log(`API local pronta em http://127.0.0.1:${port}`)
  })
}
