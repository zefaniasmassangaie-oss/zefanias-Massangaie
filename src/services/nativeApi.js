import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { scrypt } from 'scrypt-js'

const databaseName = 'gestao_biblioteca'
const encoder = new TextEncoder()
const sqlite = new SQLiteConnection(CapacitorSQLite)
let databasePromise

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS utilizadores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (trim(nome) <> ''),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (trim(email) <> ''),
  senha_hash TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('ADMIN', 'BIBLIOTECARIO', 'LEITOR')),
  estado TEXT NOT NULL DEFAULT 'ATIVO' CHECK (estado IN ('ATIVO', 'INATIVO')),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS livros (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL CHECK (trim(titulo) <> ''),
  autor TEXT NOT NULL CHECK (trim(autor) <> ''),
  categoria TEXT,
  ano INTEGER CHECK (ano IS NULL OR ano BETWEEN 0 AND 9999),
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leitores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (trim(nome) <> ''),
  telefone TEXT,
  email TEXT COLLATE NOCASE UNIQUE,
  endereco TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS emprestimos (
  id INTEGER PRIMARY KEY,
  livro_id INTEGER NOT NULL REFERENCES livros (id) ON DELETE RESTRICT,
  leitor_id INTEGER NOT NULL REFERENCES leitores (id) ON DELETE RESTRICT,
  usuario_id INTEGER NOT NULL REFERENCES utilizadores (id) ON DELETE RESTRICT,
  data_emprestimo TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_prevista_devolucao TEXT NOT NULL,
  data_devolucao TEXT,
  cancelado_em TEXT,
  estado TEXT NOT NULL DEFAULT 'EMPRESTADO'
    CHECK (estado IN ('EMPRESTADO', 'DEVOLVIDO', 'CANCELADO')),
  CHECK (data_devolucao IS NULL OR data_devolucao >= data_emprestimo),
  CHECK (
    (estado = 'EMPRESTADO' AND data_devolucao IS NULL AND cancelado_em IS NULL)
    OR (estado = 'DEVOLVIDO' AND data_devolucao IS NOT NULL AND cancelado_em IS NULL)
    OR (estado = 'CANCELADO' AND data_devolucao IS NULL AND cancelado_em IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_emprestimos_livro_estado ON emprestimos (livro_id, estado);
CREATE INDEX IF NOT EXISTS idx_emprestimos_leitor ON emprestimos (leitor_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_usuario ON emprestimos (usuario_id);
CREATE TABLE IF NOT EXISTS relatorios_diarios (
  id INTEGER PRIMARY KEY,
  data_referencia TEXT NOT NULL UNIQUE CHECK (date(data_referencia) = data_referencia),
  total_saidas INTEGER NOT NULL CHECK (total_saidas >= 0),
  total_devolucoes INTEGER NOT NULL CHECK (total_devolucoes >= 0),
  total_atrasados INTEGER NOT NULL CHECK (total_atrasados >= 0),
  utilizador_id INTEGER NOT NULL REFERENCES utilizadores (id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  utilizador_id INTEGER NOT NULL REFERENCES utilizadores (id) ON DELETE CASCADE
);
`

function result(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function fail(message, status) {
  return result({ message }, status)
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const consistent = await sqlite.checkConnectionsConsistency()
      if (!consistent.result) await sqlite.closeAllConnections()
      const connection = await sqlite.isConnection(databaseName, false)
      const db = connection.result
        ? await sqlite.retrieveConnection(databaseName, false)
        : await sqlite.createConnection(
            databaseName,
            false,
            'no-encryption',
            1,
            false
          )
      const isOpen = await db.isDBOpen()
      if (!isOpen.result) await db.open()
      await db.execute(schema)
      await db.execute('PRAGMA foreign_keys = ON;')
      return db
    })().catch(error => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

function rows(queryResult) {
  return queryResult.values || []
}

async function query(db, statement, values = []) {
  return rows(await db.query(statement, values))
}

async function run(db, statement, values = []) {
  return (await db.run(statement, values)).changes || { changes: 0, lastId: 0 }
}

async function withTransaction(db, operation) {
  await db.beginTransaction()
  try {
    const value = await operation()
    await db.commitTransaction()
    return value
  } catch (error) {
    await db.rollbackTransaction()
    throw error
  }
}

function safeUser(user) {
  return (
    user && {
      id: user.id,
      nome: user.nome,
      email: user.email,
      nivel: user.nivel
    }
  )
}

async function getSessionUser(db) {
  const session = (
    await query(
      db,
      `SELECT u.* FROM sessoes s
      JOIN utilizadores u ON u.id = s.utilizador_id
      WHERE s.id = 1 AND u.estado = 'ATIVO'`
    )
  )[0]
  return session || null
}

function hasRole(user, roles) {
  return roles.includes(user.nivel)
}

function validEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const digest = await scrypt(encoder.encode(password), salt, 16384, 8, 1, 64)
  return `scrypt$${bytesToHex(salt)}$${bytesToHex(digest)}`
}

async function verifyPassword(password, encoded) {
  const [algorithm, saltHex, digestHex] = encoded.split('$')
  if (
    algorithm !== 'scrypt' ||
    !/^[0-9a-f]{32}$/i.test(saltHex) ||
    !/^[0-9a-f]{128}$/i.test(digestHex)
  )
    return false
  const digest = await scrypt(
    encoder.encode(password),
    hexToBytes(saltHex),
    16384,
    8,
    1,
    64
  )
  const expected = hexToBytes(digestHex)
  let difference = 0
  for (let index = 0; index < digest.length; index += 1)
    difference |= digest[index] ^ expected[index]
  return difference === 0
}

async function reportData(db, date) {
  const exits = await query(
    db,
    `SELECT e.id, e.data_emprestimo, e.data_prevista_devolucao,
      b.titulo AS livro_titulo, l.nome AS leitor_nome, u.nome AS registado_por
    FROM emprestimos e
    JOIN livros b ON b.id = e.livro_id
    JOIN leitores l ON l.id = e.leitor_id
    JOIN utilizadores u ON u.id = e.usuario_id
    WHERE date(e.data_emprestimo) = ? AND e.estado <> 'CANCELADO'
    ORDER BY e.data_emprestimo, e.id`,
    [date]
  )
  const returns = await query(
    db,
    `SELECT e.id, e.data_devolucao, b.titulo AS livro_titulo,
      l.nome AS leitor_nome
    FROM emprestimos e
    JOIN livros b ON b.id = e.livro_id
    JOIN leitores l ON l.id = e.leitor_id
    WHERE date(e.data_devolucao) = ?
    ORDER BY e.data_devolucao, e.id`,
    [date]
  )
  const overdue = await query(
    db,
    `SELECT e.id, e.data_prevista_devolucao, b.titulo AS livro_titulo,
      l.nome AS leitor_nome
    FROM emprestimos e
    JOIN livros b ON b.id = e.livro_id
    JOIN leitores l ON l.id = e.leitor_id
    WHERE date(e.data_emprestimo) <= ? AND date(e.data_prevista_devolucao) < ?
      AND e.estado <> 'CANCELADO'
      AND (e.data_devolucao IS NULL OR date(e.data_devolucao) > ?)
    ORDER BY e.data_prevista_devolucao, e.id`,
    [date, date, date]
  )
  const registered =
    (
      await query(
        db,
        `SELECT r.id, r.data_referencia, r.total_saidas, r.total_devolucoes,
      r.total_atrasados, r.criado_em, u.nome AS registado_por
    FROM relatorios_diarios r
    JOIN utilizadores u ON u.id = r.utilizador_id
    WHERE r.data_referencia = ?`,
        [date]
      )
    )[0] || null

  return {
    date,
    totals: {
      exits: exits.length,
      returns: returns.length,
      overdue: overdue.length
    },
    exits,
    returns,
    overdue,
    registered
  }
}

async function nativeRequest(path, options) {
  const db = await getDatabase()
  const url = new URL(path, 'http://local.api')
  const method = options.method || 'GET'
  let body = {}
  if (options.body) {
    try {
      body = JSON.parse(options.body)
    } catch {
      return fail('Pedido inválido.', 400)
    }
  }

  if (method === 'GET' && url.pathname === '/api/setup-status') {
    const [{ total }] = await query(
      db,
      'SELECT COUNT(*) AS total FROM utilizadores'
    )
    return result({ setupRequired: total === 0 })
  }

  if (method === 'POST' && url.pathname === '/api/setup') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (
      name.length < 2 ||
      name.length > 100 ||
      !validEmail(email) ||
      password.length < 12
    ) {
      return fail(
        'Indica um nome, um e-mail válido e uma senha com pelo menos 12 caracteres.',
        400
      )
    }
    const passwordHash = await hashPassword(password)
    try {
      const user = await withTransaction(db, async () => {
        const [{ total }] = await query(
          db,
          'SELECT COUNT(*) AS total FROM utilizadores'
        )
        if (total !== 0)
          throw Object.assign(
            new Error('A configuração inicial já foi concluída.'),
            { status: 409 }
          )
        const inserted = await run(
          db,
          "INSERT INTO utilizadores (nome, email, senha_hash, nivel) VALUES (?, ?, ?, 'ADMIN')",
          [name, email, passwordHash]
        )
        await run(
          db,
          'INSERT OR REPLACE INTO sessoes (id, utilizador_id) VALUES (1, ?)',
          [inserted.lastId]
        )
        return (
          await query(db, 'SELECT * FROM utilizadores WHERE id = ?', [
            inserted.lastId
          ])
        )[0]
      })
      return result({ user: safeUser(user) }, 201)
    } catch (error) {
      if (error.status) return fail(error.message, error.status)
      if (error.message.includes('UNIQUE'))
        return fail('Já existe um utilizador com esse e-mail.', 409)
      throw error
    }
  }

  if (method === 'POST' && url.pathname === '/api/login') {
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const user = (
      await query(
        db,
        "SELECT * FROM utilizadores WHERE email = ? COLLATE NOCASE AND estado = 'ATIVO'",
        [email]
      )
    )[0]
    if (!user || !(await verifyPassword(password, user.senha_hash)))
      return fail('E-mail ou senha inválidos.', 401)
    await run(
      db,
      'INSERT OR REPLACE INTO sessoes (id, utilizador_id) VALUES (1, ?)',
      [user.id]
    )
    return result({ user: safeUser(user) })
  }

  if (method === 'GET' && url.pathname === '/api/me') {
    return result(
      { user: safeUser(await getSessionUser(db)) },
      (await getSessionUser(db)) ? 200 : 401
    )
  }

  if (method === 'POST' && url.pathname === '/api/logout') {
    await run(db, 'DELETE FROM sessoes WHERE id = 1')
    return result({ ok: true })
  }

  const user = await getSessionUser(db)
  if (!user) return fail('Sessão não encontrada.', 401)
  const manager = hasRole(user, ['ADMIN', 'BIBLIOTECARIO'])
  const admin = user.nivel === 'ADMIN'

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    const [{ titles, copies }] = await query(
      db,
      'SELECT COUNT(*) AS titles, COALESCE(SUM(quantidade), 0) AS copies FROM livros'
    )
    const [{ readers }] = await query(
      db,
      'SELECT COUNT(*) AS readers FROM leitores'
    )
    const [{ users }] = await query(
      db,
      'SELECT COUNT(*) AS users FROM utilizadores'
    )
    const [{ activeLoans }] = await query(
      db,
      "SELECT COUNT(*) AS activeLoans FROM emprestimos WHERE estado = 'EMPRESTADO'"
    )
    const [{ overdueLoans }] = await query(
      db,
      "SELECT COUNT(*) AS overdueLoans FROM emprestimos WHERE estado = 'EMPRESTADO' AND date(data_prevista_devolucao) < date('now')"
    )
    const [{ myLoans }] = await query(
      db,
      `SELECT COUNT(*) AS myLoans FROM emprestimos e JOIN leitores l ON l.id=e.leitor_id WHERE l.email=? COLLATE NOCASE AND e.estado='EMPRESTADO'`,
      [user.email]
    )
    const [{ myOverdueLoans }] = await query(
      db,
      `SELECT COUNT(*) AS myOverdueLoans FROM emprestimos e JOIN leitores l ON l.id=e.leitor_id WHERE l.email=? COLLATE NOCASE AND e.estado='EMPRESTADO' AND date(e.data_prevista_devolucao)<date('now')`,
      [user.email]
    )
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
        { label: 'Títulos no catálogo', value: titles },
        { label: 'Leitores', value: readers },
        { label: 'Empréstimos ativos', value: activeLoans },
        { label: 'Utilizadores', value: users }
      ],
      BIBLIOTECARIO: [
        { label: 'Títulos no catálogo', value: titles },
        { label: 'Leitores', value: readers },
        { label: 'Empréstimos ativos', value: activeLoans },
        { label: 'Devoluções em atraso', value: overdueLoans }
      ],
      LEITOR: [
        { label: 'Exemplares no catálogo', value: copies - activeLoans },
        { label: 'Meus empréstimos ativos', value: myLoans },
        { label: 'Minhas devoluções em atraso', value: myOverdueLoans }
      ]
    }
    return result({
      user: safeUser(user),
      navigation: navigationByRole[user.nivel],
      stats: statsByRole[user.nivel]
    })
  }

  if (url.pathname === '/api/books' && method === 'GET') {
    const books = await query(
      db,
      `SELECT b.id,b.titulo,b.autor,b.categoria,b.ano,b.quantidade AS quantidade_total,b.quantidade-COALESCE(active.total,0) AS disponiveis FROM livros b LEFT JOIN (SELECT livro_id,COUNT(*) AS total FROM emprestimos WHERE estado='EMPRESTADO' GROUP BY livro_id) active ON active.livro_id=b.id ORDER BY b.titulo COLLATE NOCASE`
    )
    return result({ books })
  }

  if (url.pathname === '/api/books' && method === 'POST') {
    if (!manager) return fail('O leitor não pode cadastrar livros.', 403)
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const author = typeof body.author === 'string' ? body.author.trim() : ''
    const category =
      typeof body.category === 'string' ? body.category.trim() : null
    const year =
      body.year === '' || body.year == null ? null : Number(body.year)
    const quantity = Number(body.quantity)
    if (
      !title ||
      title.length > 200 ||
      !author ||
      author.length > 150 ||
      (category && category.length > 100) ||
      (year !== null && (!Number.isInteger(year) || year < 0 || year > 9999)) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    )
      return fail(
        'Confirma os dados do livro e indica pelo menos um exemplar.',
        400
      )
    const inserted = await run(
      db,
      'INSERT INTO livros (titulo,autor,categoria,ano,quantidade) VALUES (?,?,?,?,?)',
      [title, author, category || null, year, quantity]
    )
    return result({ id: inserted.lastId }, 201)
  }

  const bookMatch = url.pathname.match(/^\/api\/books\/(\d+)$/)
  if (bookMatch && ['PUT', 'DELETE'].includes(method)) {
    if (!manager) return fail('O leitor não pode gerir livros.', 403)
    const id = Number(bookMatch[1])
    if (method === 'DELETE') {
      const [{ total }] = await query(
        db,
        'SELECT COUNT(*) AS total FROM emprestimos WHERE livro_id = ?',
        [id]
      )
      if (total)
        return fail(
          'Não é possível eliminar um livro com histórico de empréstimos.',
          409
        )
      const deleted = await run(db, 'DELETE FROM livros WHERE id = ?', [id])
      return deleted.changes
        ? result({ ok: true })
        : fail('Livro não encontrado.', 404)
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const author = typeof body.author === 'string' ? body.author.trim() : ''
    const category =
      typeof body.category === 'string' ? body.category.trim() : null
    const year =
      body.year === '' || body.year == null ? null : Number(body.year)
    const quantity = Number(body.quantity)
    if (
      !title ||
      title.length > 200 ||
      !author ||
      author.length > 150 ||
      (category && category.length > 100) ||
      (year !== null && (!Number.isInteger(year) || year < 0 || year > 9999)) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    )
      return fail('Confirma os dados do livro e a quantidade.', 400)
    const [{ total: active }] = await query(
      db,
      "SELECT COUNT(*) AS total FROM emprestimos WHERE livro_id=? AND estado='EMPRESTADO'",
      [id]
    )
    if (active > quantity)
      return fail(
        'A quantidade não pode ser menor que os empréstimos ativos.',
        409
      )
    const updated = await run(
      db,
      'UPDATE livros SET titulo=?,autor=?,categoria=?,ano=?,quantidade=? WHERE id=?',
      [title, author, category || null, year, quantity, id]
    )
    return updated.changes
      ? result({ ok: true })
      : fail('Livro não encontrado.', 404)
  }

  if (url.pathname === '/api/readers' && method === 'GET') {
    if (user.nivel === 'LEITOR')
      return fail(
        'Esta lista está disponível apenas ao pessoal da biblioteca.',
        403
      )
    return result({
      readers: await query(
        db,
        'SELECT id,nome,telefone,email,endereco FROM leitores ORDER BY nome COLLATE NOCASE'
      )
    })
  }

  if (url.pathname === '/api/readers' && method === 'POST') {
    if (!manager) return fail('O leitor não pode cadastrar leitores.', 403)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : null
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null
    const address =
      typeof body.address === 'string' ? body.address.trim() : null
    if (
      name.length < 2 ||
      name.length > 100 ||
      (email && !validEmail(email)) ||
      (phone && phone.length > 40) ||
      (address && address.length > 250)
    )
      return fail('Confirma o nome, e-mail e telefone do leitor.', 400)
    try {
      const inserted = await run(
        db,
        'INSERT INTO leitores (nome,email,telefone,endereco) VALUES (?,?,?,?)',
        [name, email || null, phone || null, address || null]
      )
      return result({ id: inserted.lastId }, 201)
    } catch (error) {
      if (error.message.includes('UNIQUE'))
        return fail('Já existe um leitor com esse e-mail.', 409)
      throw error
    }
  }

  const readerMatch = url.pathname.match(/^\/api\/readers\/(\d+)$/)
  if (readerMatch && ['PUT', 'DELETE'].includes(method)) {
    if (!manager) return fail('O leitor não pode gerir leitores.', 403)
    const id = Number(readerMatch[1])
    const reader = (
      await query(db, 'SELECT * FROM leitores WHERE id=?', [id])
    )[0]
    if (!reader) return fail('Leitor não encontrado.', 404)
    if (method === 'DELETE') {
      const [{ total }] = await query(
        db,
        'SELECT COUNT(*) AS total FROM emprestimos WHERE leitor_id=?',
        [id]
      )
      if (total)
        return fail(
          'Não é possível apagar um leitor com histórico de empréstimos.',
          409
        )
      const linked = reader.email
        ? (
            await query(
              db,
              "SELECT id FROM utilizadores WHERE email=? COLLATE NOCASE AND nivel='LEITOR'",
              [reader.email]
            )
          )[0]
        : null
      if (linked)
        return fail(
          'Este leitor está ligado a uma conta. Desative a conta em Utilizadores.',
          409
        )
      await run(db, 'DELETE FROM leitores WHERE id=?', [id])
      return result({ ok: true })
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : null
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null
    const address =
      typeof body.address === 'string' ? body.address.trim() : null
    if (
      name.length < 2 ||
      name.length > 100 ||
      (email && !validEmail(email)) ||
      (phone && phone.length > 40) ||
      (address && address.length > 250)
    )
      return fail('Confirma os dados do leitor.', 400)
    try {
      await withTransaction(db, async () => {
        await run(
          db,
          'UPDATE leitores SET nome=?,email=?,telefone=?,endereco=? WHERE id=?',
          [name, email || null, phone || null, address || null, id]
        )
        if (reader.email && email && reader.email.toLowerCase() !== email)
          await run(
            db,
            "UPDATE utilizadores SET email=?,nome=? WHERE email=? COLLATE NOCASE AND nivel='LEITOR'",
            [email, name, reader.email]
          )
      })
      return result({ ok: true })
    } catch (error) {
      if (error.message.includes('UNIQUE'))
        return fail('Já existe um leitor ou utilizador com esse e-mail.', 409)
      throw error
    }
  }

  if (url.pathname === '/api/loans' && method === 'GET') {
    const readerFilter =
      user.nivel === 'LEITOR' ? 'WHERE l.email=? COLLATE NOCASE' : ''
    const statement = `SELECT e.id,e.data_emprestimo,e.data_prevista_devolucao,e.data_devolucao,e.cancelado_em,e.estado,b.titulo AS livro_titulo,b.autor AS livro_autor,l.nome AS leitor_nome,l.email AS leitor_email,u.nome AS registado_por FROM emprestimos e JOIN livros b ON b.id=e.livro_id JOIN leitores l ON l.id=e.leitor_id JOIN utilizadores u ON u.id=e.usuario_id ${readerFilter} ORDER BY CASE WHEN e.estado='EMPRESTADO' THEN 0 WHEN e.estado='DEVOLVIDO' THEN 1 ELSE 2 END,e.data_prevista_devolucao,e.id DESC`
    return result({
      loans:
        user.nivel === 'LEITOR'
          ? await query(db, statement, [user.email])
          : await query(db, statement)
    })
  }

  if (url.pathname === '/api/loans' && method === 'POST') {
    if (!manager) return fail('O leitor não pode registar empréstimos.', 403)
    const bookId = Number(body.bookId)
    const readerId = Number(body.readerId)
    if (
      !Number.isSafeInteger(bookId) ||
      bookId < 1 ||
      !Number.isSafeInteger(readerId) ||
      readerId < 1 ||
      !validDate(body.dueDate) ||
      body.dueDate < new Date().toISOString().slice(0, 10)
    )
      return fail('Livro, leitor ou data de devolução inválidos.', 400)
    try {
      const inserted = await withTransaction(db, async () => {
        const book = (
          await query(
            db,
            `SELECT b.quantidade-COUNT(e.id) AS disponiveis FROM livros b LEFT JOIN emprestimos e ON e.livro_id=b.id AND e.estado='EMPRESTADO' WHERE b.id=? GROUP BY b.id`,
            [bookId]
          )
        )[0]
        const reader = (
          await query(db, 'SELECT id FROM leitores WHERE id=?', [readerId])
        )[0]
        if (!book || !reader)
          throw Object.assign(new Error('Livro ou leitor não encontrado.'), {
            status: 404
          })
        if (book.disponiveis < 1)
          throw Object.assign(
            new Error('Não há exemplares disponíveis deste livro.'),
            { status: 409 }
          )
        return run(
          db,
          'INSERT INTO emprestimos (livro_id,leitor_id,usuario_id,data_prevista_devolucao) VALUES (?,?,?,?)',
          [bookId, readerId, user.id, body.dueDate]
        )
      })
      return result({ id: inserted.lastId }, 201)
    } catch (error) {
      if (error.status) return fail(error.message, error.status)
      throw error
    }
  }

  const loanMatch = url.pathname.match(/^\/api\/loans\/(\d+)$/)
  if (loanMatch && ['PUT', 'DELETE'].includes(method)) {
    if (!manager) return fail('O leitor não pode gerir empréstimos.', 403)
    const id = Number(loanMatch[1])
    if (method === 'DELETE') {
      const cancelled = await run(
        db,
        "UPDATE emprestimos SET estado='CANCELADO',cancelado_em=CURRENT_TIMESTAMP WHERE id=? AND estado='EMPRESTADO'",
        [id]
      )
      return cancelled.changes
        ? result({ ok: true, estado: 'CANCELADO' })
        : fail('Apenas empréstimos ativos podem ser cancelados.', 409)
    }
    if (!validDate(body.dueDate))
      return fail('Indica uma data prevista válida.', 400)
    const updated = await run(
      db,
      "UPDATE emprestimos SET data_prevista_devolucao=? WHERE id=? AND estado='EMPRESTADO' AND date(data_emprestimo)<=?",
      [body.dueDate, id, body.dueDate]
    )
    return updated.changes
      ? result({ ok: true })
      : fail(
          'Empréstimo não encontrado, encerrado ou com data anterior à saída.',
          409
        )
  }

  const returnMatch = url.pathname.match(/^\/api\/loans\/(\d+)\/return$/)
  if (method === 'POST' && returnMatch) {
    if (!manager) return fail('O leitor não pode registar devoluções.', 403)
    const returned = await run(
      db,
      "UPDATE emprestimos SET estado='DEVOLVIDO',data_devolucao=CURRENT_TIMESTAMP WHERE id=? AND estado='EMPRESTADO'",
      [Number(returnMatch[1])]
    )
    return returned.changes
      ? result({ ok: true })
      : fail('Empréstimo não encontrado ou já devolvido.', 409)
  }

  if (
    url.pathname === '/api/reports/daily' &&
    ['GET', 'POST'].includes(method)
  ) {
    if (!hasRole(user, ['ADMIN', 'BIBLIOTECARIO']))
      return fail(
        'Relatórios disponíveis apenas ao pessoal da biblioteca.',
        403
      )
    const date =
      method === 'GET'
        ? url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
        : body.date
    if (!validDate(date) || date > new Date().toISOString().slice(0, 10))
      return fail('Indica uma data válida, não futura.', 400)
    if (method === 'GET') return result({ report: await reportData(db, date) })
    try {
      const report = await withTransaction(db, async () => {
        const existing = (
          await query(
            db,
            'SELECT id FROM relatorios_diarios WHERE data_referencia=?',
            [date]
          )
        )[0]
        if (existing)
          throw Object.assign(
            new Error('Já existe um relatório registado para esta data.'),
            { status: 409 }
          )
        const daily = await reportData(db, date)
        await run(
          db,
          'INSERT INTO relatorios_diarios (data_referencia,total_saidas,total_devolucoes,total_atrasados,utilizador_id) VALUES (?,?,?,?,?)',
          [
            date,
            daily.totals.exits,
            daily.totals.returns,
            daily.totals.overdue,
            user.id
          ]
        )
        return reportData(db, date)
      })
      return result({ report }, 201)
    } catch (error) {
      if (error.status) return fail(error.message, error.status)
      throw error
    }
  }

  if (url.pathname === '/api/users' && ['GET', 'POST'].includes(method)) {
    if (!admin)
      return fail('Apenas o administrador pode gerir utilizadores.', 403)
    if (method === 'GET')
      return result({
        users: await query(
          db,
          'SELECT id,nome,email,nivel,estado,criado_em FROM utilizadores ORDER BY nome COLLATE NOCASE'
        )
      })
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    if (
      name.length < 2 ||
      name.length > 100 ||
      !validEmail(email) ||
      password.length < 12 ||
      !['ADMIN', 'BIBLIOTECARIO', 'LEITOR'].includes(role)
    )
      return fail('Confirma nome, e-mail, senha e nível de acesso.', 400)
    try {
      const created = await withTransaction(db, async () => {
        const inserted = await run(
          db,
          'INSERT INTO utilizadores (nome,email,senha_hash,nivel) VALUES (?,?,?,?)',
          [name, email, await hashPassword(password), role]
        )
        if (role === 'LEITOR')
          await run(
            db,
            'INSERT OR IGNORE INTO leitores (nome,email) VALUES (?,?)',
            [name, email]
          )
        return (
          await query(
            db,
            'SELECT id,nome,email,nivel,estado,criado_em FROM utilizadores WHERE id=?',
            [inserted.lastId]
          )
        )[0]
      })
      return result({ user: created }, 201)
    } catch (error) {
      if (error.message.includes('UNIQUE'))
        return fail('Já existe um utilizador com esse e-mail.', 409)
      throw error
    }
  }

  const userMatch = url.pathname.match(/^\/api\/users\/(\d+)$/)
  if (userMatch && ['PUT', 'DELETE'].includes(method)) {
    if (!admin)
      return fail('Apenas o administrador pode gerir utilizadores.', 403)
    const id = Number(userMatch[1])
    const target = (
      await query(db, 'SELECT * FROM utilizadores WHERE id=?', [id])
    )[0]
    if (!target) return fail('Utilizador não encontrado.', 404)
    const [{ total: activeAdmins }] = await query(
      db,
      "SELECT COUNT(*) AS total FROM utilizadores WHERE nivel='ADMIN' AND estado='ATIVO'"
    )
    if (method === 'DELETE') {
      if (id === user.id)
        return fail('Não podes desativar a tua própria conta.', 409)
      if (
        target.nivel === 'ADMIN' &&
        target.estado === 'ATIVO' &&
        activeAdmins <= 1
      )
        return fail('Não podes desativar o último administrador ativo.', 409)
      await run(db, "UPDATE utilizadores SET estado='INATIVO' WHERE id=?", [id])
      await run(db, 'DELETE FROM sessoes WHERE utilizador_id=?', [id])
      return result({ ok: true, estado: 'INATIVO' })
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    const state = body.state
    if (
      name.length < 2 ||
      name.length > 100 ||
      !validEmail(email) ||
      !['ADMIN', 'BIBLIOTECARIO', 'LEITOR'].includes(role) ||
      !['ATIVO', 'INATIVO'].includes(state) ||
      (password && password.length < 12)
    )
      return fail('Confirma nome, e-mail, nível, estado e senha.', 400)
    if (id === user.id && (role !== 'ADMIN' || state !== 'ATIVO'))
      return fail(
        'Não podes remover o teu próprio acesso de administrador.',
        409
      )
    if (
      target.nivel === 'ADMIN' &&
      target.estado === 'ATIVO' &&
      (role !== 'ADMIN' || state !== 'ATIVO') &&
      activeAdmins <= 1
    )
      return fail('Deve existir pelo menos um administrador ativo.', 409)
    try {
      await withTransaction(db, async () => {
        await run(
          db,
          'UPDATE utilizadores SET nome=?,email=?,senha_hash=?,nivel=?,estado=? WHERE id=?',
          [
            name,
            email,
            password ? await hashPassword(password) : target.senha_hash,
            role,
            state,
            id
          ]
        )
        if (target.nivel === 'LEITOR')
          await run(
            db,
            'UPDATE leitores SET nome=?,email=? WHERE email=? COLLATE NOCASE',
            [name, email, target.email]
          )
        if (role === 'LEITOR')
          await run(
            db,
            'INSERT OR IGNORE INTO leitores (nome,email) VALUES (?,?)',
            [name, email]
          )
      })
      if (state === 'INATIVO')
        await run(db, 'DELETE FROM sessoes WHERE utilizador_id=?', [id])
      const updated = (
        await query(
          db,
          'SELECT id,nome,email,nivel,estado,criado_em FROM utilizadores WHERE id=?',
          [id]
        )
      )[0]
      return result({ user: updated })
    } catch (error) {
      if (error.message.includes('UNIQUE'))
        return fail('Esse e-mail já está associado a outro registo.', 409)
      throw error
    }
  }

  return fail('Endpoint não encontrado.', 404)
}

export async function nativeApiFetch(input, options = {}) {
  const url = typeof input === 'string' ? input : input.url
  try {
    return await nativeRequest(url, options)
  } catch (error) {
    return fail(error.message || 'Erro ao aceder ao SQLite local.', 500)
  }
}
