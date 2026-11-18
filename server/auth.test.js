import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, test } from 'node:test'
import { createAppServer } from './index.js'

let app
let baseUrl
let temporaryDirectory

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'biblioteca-auth-'))
  app = await createAppServer({
    databasePath: join(temporaryDirectory, 'test.db')
  })
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${app.address().port}`
})

after(async () => {
  if (app?.listening) await new Promise(resolve => app.close(resolve))
  if (temporaryDirectory)
    await rm(temporaryDirectory, { recursive: true, force: true })
})

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options)
}

function cookieFrom(response) {
  return response.headers.get('set-cookie').split(';', 1)[0]
}

test('configuração, login, níveis, métricas e logout', async () => {
  let response = await request('/api/setup-status')
  let crudBookId
  let managedReaderId
  let temporaryUserId
  assert.deepEqual(await response.json(), { setupRequired: true })

  response = await request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Admin',
      email: 'admin@example.test',
      password: 'short'
    })
  })
  assert.equal(response.status, 400)

  response = await request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Admin',
      email: 'admin@example.test',
      password: 'correct horse battery'
    })
  })
  assert.equal(response.status, 201)
  assert.equal((await response.json()).user.nivel, 'ADMIN')
  const adminCookie = cookieFrom(response)
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/)

  response = await request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Other admin',
      email: 'other@example.test',
      password: 'correct horse battery'
    })
  })
  assert.equal(response.status, 409)

  for (const account of [
    {
      name: 'Bibliotecário',
      email: 'staff@example.test',
      password: 'staff password secure',
      role: 'BIBLIOTECARIO'
    },
    {
      name: 'Leitora',
      email: 'reader@example.test',
      password: 'reader password secure',
      role: 'LEITOR'
    }
  ]) {
    response = await request('/api/users', {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(account)
    })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).user.nivel, account.role)
  }

  const database = new DatabaseSync(join(temporaryDirectory, 'test.db'))
  try {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10)
    const twoDaysAgo = new Date(now.getTime() - 172_800_000)
      .toISOString()
      .slice(0, 10)
    database
      .prepare(
        'INSERT INTO livros (titulo, autor, quantidade) VALUES (?, ?, ?)'
      )
      .run('Livro', 'Autora', 5)
    database
      .prepare(
        'INSERT INTO livros (titulo, autor, quantidade) VALUES (?, ?, ?)'
      )
      .run('Exemplar único', 'Outro autor', 1)
    database
      .prepare(
        "INSERT INTO emprestimos (livro_id, leitor_id, usuario_id, data_emprestimo, data_prevista_devolucao, estado) VALUES (1, 1, 1, ?, ?, 'EMPRESTADO')"
      )
      .run(twoDaysAgo, yesterday)
  } finally {
    database.close()
  }

  response = await request('/api/dashboard', {
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  let dashboard = await response.json()
  assert.equal(dashboard.user.nivel, 'ADMIN')
  assert.ok(dashboard.navigation.includes('Utilizadores'))
  assert.equal(
    dashboard.stats.find(({ label }) => label === 'Títulos no catálogo').value,
    2
  )
  response = await request('/api/books', {
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  let books = (await response.json()).books
  assert.equal(
    books.find(({ titulo }) => titulo === 'Exemplar único').disponiveis,
    1
  )

  response = await request('/api/books', {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Livro CRUD',
      author: 'Autor inicial',
      category: 'Teste',
      year: 2020,
      quantity: 2
    })
  })
  assert.equal(response.status, 201)
  crudBookId = (await response.json()).id
  response = await request(`/api/books/${crudBookId}`, {
    method: 'PUT',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Livro atualizado',
      author: 'Autor atualizado',
      category: 'Referência',
      year: 2021,
      quantity: 3
    })
  })
  assert.equal(response.status, 200)
  response = await request('/api/books', { headers: { Cookie: adminCookie } })
  books = (await response.json()).books
  assert.equal(
    books.find(({ id }) => id === crudBookId).titulo,
    'Livro atualizado'
  )
  response = await request(`/api/books/${crudBookId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  response = await request('/api/books/1', {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 409)

  response = await request('/api/readers', {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Leitor CRUD',
      email: 'reader-crud@example.test',
      phone: '12345',
      address: 'Rua Inicial'
    })
  })
  assert.equal(response.status, 201)
  managedReaderId = (await response.json()).id
  response = await request(`/api/readers/${managedReaderId}`, {
    method: 'PUT',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Leitor editado',
      email: 'reader-crud-updated@example.test',
      phone: '54321',
      address: 'Rua Atualizada'
    })
  })
  assert.equal(response.status, 200)
  response = await request('/api/readers', { headers: { Cookie: adminCookie } })
  let readerRows = (await response.json()).readers
  assert.equal(
    readerRows.find(({ id }) => id === managedReaderId).nome,
    'Leitor editado'
  )
  response = await request(`/api/readers/${managedReaderId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)

  response = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'staff@example.test',
      password: 'wrong password'
    })
  })
  assert.equal(response.status, 401)

  response = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'staff@example.test',
      password: 'staff password secure'
    })
  })
  assert.equal(response.status, 200)
  const staffCookie = cookieFrom(response)
  response = await request('/api/dashboard', {
    headers: { Cookie: staffCookie }
  })
  dashboard = await response.json()
  assert.equal(dashboard.user.nivel, 'BIBLIOTECARIO')
  assert.ok(!dashboard.navigation.includes('Utilizadores'))
  response = await request('/api/users', { headers: { Cookie: staffCookie } })
  assert.equal(response.status, 403)
  response = await request('/api/users', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Tentativa',
      email: 'blocked@example.test',
      password: 'secure password value',
      role: 'ADMIN'
    })
  })
  assert.equal(response.status, 403)

  const dueDate = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  response = await request('/api/loans', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: 2, readerId: 1, dueDate })
  })
  assert.equal(response.status, 201)
  const newLoanId = (await response.json()).id

  const editedDueDate = new Date(Date.now() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  response = await request(`/api/loans/${newLoanId}`, {
    method: 'PUT',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dueDate: editedDueDate })
  })
  assert.equal(response.status, 200)
  response = await request('/api/loans', { headers: { Cookie: staffCookie } })
  const updatedLoans = (await response.json()).loans
  assert.equal(
    updatedLoans.find(({ id }) => id === newLoanId).data_prevista_devolucao,
    editedDueDate
  )

  response = await request('/api/books', {
    headers: { Cookie: staffCookie }
  })
  books = (await response.json()).books
  assert.equal(
    books.find(({ titulo }) => titulo === 'Exemplar único').disponiveis,
    0
  )
  response = await request('/api/loans', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: 2, readerId: 1, dueDate })
  })
  assert.equal(response.status, 409)

  response = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'reader@example.test',
      password: 'reader password secure'
    })
  })
  assert.equal(response.status, 200)
  const readerCookie = cookieFrom(response)
  response = await request('/api/books', {
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 200)
  response = await request('/api/readers', {
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 403)
  response = await request('/api/loans', {
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).loans.length, 2)
  response = await request('/api/loans', {
    method: 'POST',
    headers: { Cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: 2, readerId: 1, dueDate })
  })
  assert.equal(response.status, 403)
  response = await request('/api/books', {
    method: 'POST',
    headers: { Cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Bloqueado', author: 'Autor', quantity: 1 })
  })
  assert.equal(response.status, 403)
  response = await request('/api/readers', {
    method: 'POST',
    headers: { Cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Leitor não autorizado' })
  })
  assert.equal(response.status, 403)
  response = await request(`/api/loans/${newLoanId}/return`, {
    method: 'POST',
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 403)

  response = await request('/api/dashboard', {
    headers: { Cookie: readerCookie }
  })
  dashboard = await response.json()
  assert.equal(dashboard.user.nivel, 'LEITOR')
  assert.ok(!dashboard.navigation.includes('Utilizadores'))
  assert.equal(
    dashboard.stats.find(({ label }) => label === 'Meus empréstimos ativos')
      .value,
    2
  )
  assert.equal(
    dashboard.stats.find(({ label }) => label === 'Minhas devoluções em atraso')
      .value,
    1
  )
  assert.equal(
    dashboard.stats.find(({ label }) => label === 'Exemplares no catálogo')
      .value,
    4
  )

  response = await request('/api/books', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Cadastro de teste',
      author: 'Outro autor',
      quantity: 1
    })
  })
  assert.equal(response.status, 201)
  const walkInReaderId = (await response.json()).id
  response = await request(`/api/readers/${walkInReaderId}`, {
    method: 'DELETE',
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 403)
  response = await request('/api/readers', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Leitor sem conta',
      email: 'walkin@example.test'
    })
  })
  assert.equal(response.status, 201)

  response = await request(`/api/loans/${newLoanId}/return`, {
    method: 'POST',
    headers: { Cookie: staffCookie }
  })
  assert.equal(response.status, 200)
  response = await request('/api/books', {
    headers: { Cookie: staffCookie }
  })
  books = (await response.json()).books
  assert.equal(
    books.find(({ titulo }) => titulo === 'Exemplar único').disponiveis,
    1
  )
  response = await request(`/api/loans/${newLoanId}/return`, {
    method: 'POST',
    headers: { Cookie: staffCookie }
  })
  assert.equal(response.status, 409)

  response = await request('/api/loans', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: 2, readerId: 1, dueDate })
  })
  assert.equal(response.status, 201)
  const cancelledLoanId = (await response.json()).id
  response = await request(`/api/loans/${cancelledLoanId}`, {
    method: 'DELETE',
    headers: { Cookie: staffCookie }
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).estado, 'CANCELADO')
  response = await request(`/api/loans/${cancelledLoanId}`, {
    method: 'DELETE',
    headers: { Cookie: staffCookie }
  })
  assert.equal(response.status, 409)
  response = await request('/api/loans', { headers: { Cookie: staffCookie } })
  const loansAfterCancellation = (await response.json()).loans
  assert.equal(
    loansAfterCancellation.find(({ id }) => id === cancelledLoanId).estado,
    'CANCELADO'
  )
  response = await request('/api/books', { headers: { Cookie: staffCookie } })
  books = (await response.json()).books
  assert.equal(
    books.find(({ titulo }) => titulo === 'Exemplar único').disponiveis,
    1
  )

  const reportDate = new Date().toISOString().slice(0, 10)
  response = await request(`/api/reports/daily?date=${reportDate}`, {
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  let dailyReport = (await response.json()).report
  assert.deepEqual(dailyReport.totals, { exits: 1, returns: 1, overdue: 1 })
  assert.equal(dailyReport.registered, null)

  response = await request(`/api/reports/daily?date=${reportDate}`, {
    headers: { Cookie: readerCookie }
  })
  assert.equal(response.status, 403)
  response = await request('/api/reports/daily', {
    method: 'POST',
    headers: { Cookie: readerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: reportDate })
  })
  assert.equal(response.status, 403)

  response = await request('/api/reports/daily', {
    method: 'POST',
    headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: reportDate })
  })
  assert.equal(response.status, 201)
  dailyReport = (await response.json()).report
  assert.equal(dailyReport.registered.registado_por, 'Bibliotecário')

  response = await request('/api/reports/daily', {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: reportDate })
  })
  assert.equal(response.status, 409)

  response = await request('/api/users', { headers: { Cookie: adminCookie } })
  assert.equal(response.status, 200)
  const users = (await response.json()).users
  temporaryUserId = users.find(({ email }) => email === 'staff@example.test').id
  response = await request(`/api/users/${temporaryUserId}`, {
    method: 'PUT',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bibliotecário Editado',
      email: 'staff-updated@example.test',
      role: 'BIBLIOTECARIO',
      state: 'ATIVO',
      password: ''
    })
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).user.nome, 'Bibliotecário Editado')
  response = await request(`/api/users/${temporaryUserId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).estado, 'INATIVO')
  response = await request('/api/users/1', {
    method: 'DELETE',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 409)

  response = await request('/api/logout', {
    method: 'POST',
    headers: { Cookie: adminCookie }
  })
  assert.equal(response.status, 200)
  response = await request('/api/me', { headers: { Cookie: adminCookie } })
  assert.equal(response.status, 401)
})
