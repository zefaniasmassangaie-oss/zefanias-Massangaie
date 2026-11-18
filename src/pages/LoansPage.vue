<template>
  <q-page class="q-pa-lg">
    <main class="page-content">
      <div class="text-overline text-primary">CIRCULAÇÃO</div>
      <div class="row items-center justify-between q-col-gutter-md">
        <div class="col-12 col-md">
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm">
            {{
              isReturnsPage
                ? isReader
                  ? 'Minhas devoluções'
                  : 'Devoluções'
                : isReader
                  ? 'Meus empréstimos'
                  : 'Empréstimos e devoluções'
            }}
          </h1>
          <p class="text-body1 text-grey-7 q-mt-none">
            {{
              isReader
                ? 'Consulta a situação dos teus livros.'
                : 'Regista a saída de livros e confirma as devoluções.'
            }}
          </p>
        </div>
        <div
          v-if="canManageLoans"
          class="row q-gutter-sm mobile-actions col-12 col-md-auto"
        >
          <q-btn
            outline
            color="primary"
            icon="person_add"
            label="Novo leitor"
            no-caps
            @click="showReaderDialog = true"
          />
          <q-btn
            color="primary"
            icon="add"
            label="Registar saída"
            no-caps
            @click="showIssueDialog = true"
          />
        </div>
      </div>

      <q-banner v-if="message" rounded class="feedback-positive q-mb-md">
        {{ message }}
      </q-banner>
      <q-banner
        v-if="errorMessage"
        rounded
        class="bg-red-1 text-negative q-mb-md"
      >
        {{ errorMessage }}
      </q-banner>

      <q-table
        class="responsive-table"
        flat
        bordered
        row-key="id"
        :grid="$q.screen.lt.sm"
        :rows="visibleLoans"
        :columns="columns"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        :no-data-label="
          isReader
            ? 'Ainda não tens empréstimos'
            : 'Ainda não há empréstimos registados'
        "
      >
        <template #item="props">
          <div class="q-pa-xs col-12">
            <q-card flat bordered>
              <q-card-section>
                <div class="text-subtitle1 text-weight-medium">
                  {{ props.row.livro_titulo }}
                </div>
                <div v-if="!isReader" class="text-body2 text-grey-7">
                  {{ props.row.leitor_nome }}
                </div>
                <div class="text-body2 q-mt-sm">
                  Saída {{ props.row.data_emprestimo.slice(0, 10) }} · Devolução
                  {{ props.row.data_prevista_devolucao }}
                </div>
                <q-chip
                  dense
                  class="q-ml-none q-mt-sm"
                  :class="loanStateClass(props.row.estado)"
                >
                  {{ loanStateLabel(props.row.estado) }}
                </q-chip>
              </q-card-section>
              <q-card-actions
                v-if="canManageLoans && props.row.estado === 'EMPRESTADO'"
                align="right"
              >
                <q-btn
                  flat
                  icon="edit_calendar"
                  label="Alterar data"
                  no-caps
                  @click="openEditDueDate(props.row)"
                />
                <q-btn
                  flat
                  icon="cancel"
                  label="Cancelar empréstimo"
                  color="negative"
                  no-caps
                  @click="confirmCancel(props.row)"
                />
                <q-btn
                  flat
                  icon="assignment_return"
                  label="Registar devolução"
                  no-caps
                  :loading="returningLoanId === props.row.id"
                  @click="returnLoan(props.row)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </template>
        <template #body-cell-estado="props">
          <q-td :props="props">
            <q-chip dense :class="loanStateClass(props.value)">
              {{ loanStateLabel(props.value) }}
            </q-chip>
          </q-td>
        </template>
        <template #body-cell-acoes="props">
          <q-td :props="props">
            <q-btn
              v-if="canManageLoans && props.row.estado === 'EMPRESTADO'"
              flat
              round
              dense
              icon="edit_calendar"
              color="primary"
              aria-label="Alterar data prevista"
              @click="openEditDueDate(props.row)"
            >
              <q-tooltip>Alterar data prevista</q-tooltip>
            </q-btn>
            <q-btn
              v-if="canManageLoans && props.row.estado === 'EMPRESTADO'"
              flat
              round
              dense
              icon="cancel"
              color="negative"
              aria-label="Cancelar empréstimo"
              @click="confirmCancel(props.row)"
            >
              <q-tooltip>Cancelar empréstimo</q-tooltip>
            </q-btn>
            <q-btn
              v-if="canManageLoans && props.row.estado === 'EMPRESTADO'"
              flat
              round
              dense
              icon="assignment_return"
              color="primary"
              :aria-label="`Registar devolução de ${props.row.livro_titulo}`"
              :loading="returningLoanId === props.row.id"
              @click="returnLoan(props.row)"
            >
              <q-tooltip>Registar devolução</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </main>

    <q-dialog v-model="showIssueDialog" :maximized="$q.screen.lt.sm">
      <q-card class="issue-dialog">
        <q-card-section>
          <div class="text-h6">Registar saída de livro</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="issueLoan">
            <q-select
              v-model="bookId"
              label="Livro disponível"
              :options="bookOptions"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              outlined
              required
            />
            <q-select
              v-model="readerId"
              label="Leitor"
              :options="readerOptions"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              outlined
              required
            />
            <q-input
              v-model="dueDate"
              type="date"
              label="Data prevista de devolução"
              outlined
              required
            />
            <q-banner v-if="formError" rounded class="bg-red-1 text-negative">
              {{ formError }}
            </q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                label="Confirmar saída"
                type="submit"
                :loading="submitting"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showEditDialog" :maximized="$q.screen.lt.sm">
      <q-card class="issue-dialog">
        <q-card-section>
          <div class="text-h6">Alterar data prevista</div>
          <div class="text-body2 text-grey-7">{{ editingLoanTitle }}</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="saveDueDate">
            <q-input
              v-model="editingDueDate"
              type="date"
              label="Nova data prevista"
              outlined
              required
            />
            <q-banner v-if="editError" rounded class="feedback-negative">
              {{ editError }}
            </q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                label="Guardar data"
                type="submit"
                :loading="updatingLoan"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showCancelDialog">
      <q-card class="issue-dialog">
        <q-card-section>
          <div class="text-h6">Cancelar empréstimo</div>
          <p class="q-mb-none">
            O empréstimo de {{ loanToCancel?.livro_titulo }} para
            {{ loanToCancel?.leitor_nome }} será marcado como cancelado e o
            exemplar ficará disponível.
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Voltar" no-caps v-close-popup />
          <q-btn
            color="negative"
            label="Confirmar cancelamento"
            no-caps
            :loading="cancellingLoan"
            @click="cancelLoan"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showReaderDialog" :maximized="$q.screen.lt.sm">
      <q-card class="issue-dialog">
        <q-card-section>
          <div class="text-h6">Cadastrar leitor</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="createReader">
            <q-input
              v-model.trim="newReaderName"
              label="Nome"
              outlined
              required
              maxlength="100"
            />
            <q-input
              v-model.trim="newReaderEmail"
              label="E-mail"
              type="email"
              outlined
              maxlength="254"
            />
            <q-input
              v-model.trim="newReaderPhone"
              label="Telefone"
              type="tel"
              outlined
              maxlength="40"
            />
            <q-banner
              v-if="readerFormError"
              rounded
              class="bg-red-1 text-negative"
            >
              {{ readerFormError }}
            </q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                label="Guardar leitor"
                type="submit"
                :loading="savingReader"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { currentUser } from '@/services/auth.js'
import { apiFetch } from '@/services/api.js'

const route = useRoute()
const books = ref([])
const readers = ref([])
const loans = ref([])
const loading = ref(false)
const submitting = ref(false)
const returningLoanId = ref(null)
const showIssueDialog = ref(false)
const showReaderDialog = ref(false)
const showEditDialog = ref(false)
const showCancelDialog = ref(false)
const updatingLoan = ref(false)
const cancellingLoan = ref(false)
const loanToCancel = ref(null)
const editingLoanId = ref(null)
const editingLoanTitle = ref('')
const editingDueDate = ref('')
const editError = ref('')
const savingReader = ref(false)
const newReaderName = ref('')
const newReaderEmail = ref('')
const newReaderPhone = ref('')
const readerFormError = ref('')
const bookId = ref(null)
const readerId = ref(null)
const dueDate = ref(
  new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
)
const message = ref('')
const errorMessage = ref('')
const formError = ref('')
const isReader = computed(() => currentUser.value?.nivel === 'LEITOR')
const isReturnsPage = computed(() => route.name === 'returns')
const canManageLoans = computed(() =>
  ['ADMIN', 'BIBLIOTECARIO'].includes(currentUser.value?.nivel)
)
const bookOptions = computed(() =>
  books.value
    .filter(book => book.disponiveis > 0)
    .map(book => ({
      value: book.id,
      label: `${book.titulo} (${book.disponiveis} disponíveis)`
    }))
)
const readerOptions = computed(() =>
  readers.value.map(reader => ({
    value: reader.id,
    label: reader.email ? `${reader.nome} · ${reader.email}` : reader.nome
  }))
)
const columns = computed(() => [
  {
    name: 'livro_titulo',
    label: 'Livro',
    field: 'livro_titulo',
    align: 'left',
    sortable: true
  },
  ...(!isReader.value
    ? [
        {
          name: 'leitor_nome',
          label: 'Leitor',
          field: 'leitor_nome',
          align: 'left',
          sortable: true
        }
      ]
    : []),
  {
    name: 'data_emprestimo',
    label: 'Saída',
    field: row => row.data_emprestimo.slice(0, 10),
    align: 'left',
    sortable: true
  },
  {
    name: 'data_prevista_devolucao',
    label: 'Devolução prevista',
    field: 'data_prevista_devolucao',
    align: 'left',
    sortable: true
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'estado',
    align: 'left',
    sortable: true
  },
  ...(!isReader.value
    ? [{ name: 'acoes', label: 'Ações', field: 'id', align: 'center' }]
    : [])
])
const visibleLoans = computed(() =>
  isReturnsPage.value
    ? loans.value.filter(loan => loan.estado === 'EMPRESTADO')
    : loans.value
)

function loanStateLabel(state) {
  return (
    {
      EMPRESTADO: 'Emprestado',
      DEVOLVIDO: 'Devolvido',
      CANCELADO: 'Cancelado'
    }[state] || state
  )
}

function loanStateClass(state) {
  return (
    {
      EMPRESTADO: 'loan-active',
      DEVOLVIDO: 'loan-returned',
      CANCELADO: 'stock-empty'
    }[state] || 'stock-empty'
  )
}

async function loadLoansPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const requests = [apiFetch('/api/books'), apiFetch('/api/loans')]
    if (canManageLoans.value) requests.push(apiFetch('/api/readers'))
    const responses = await Promise.all(requests)
    const results = await Promise.all(
      responses.map(response => response.json())
    )
    const failed = responses.findIndex(response => !response.ok)
    if (failed !== -1)
      throw new Error(
        results[failed].message || 'Não foi possível carregar os empréstimos.'
      )
    books.value = results[0].books
    loans.value = results[1].loans
    if (canManageLoans.value) readers.value = results[2].readers
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

async function issueLoan() {
  submitting.value = true
  formError.value = ''
  try {
    const response = await apiFetch('/api/loans', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: bookId.value,
        readerId: readerId.value,
        dueDate: dueDate.value
      })
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível registar a saída.')
    showIssueDialog.value = false
    bookId.value = null
    readerId.value = null
    message.value = 'Saída registada.'
    await loadLoansPage()
  } catch (error) {
    formError.value = error.message
  } finally {
    submitting.value = false
  }
}

async function returnLoan(loan) {
  returningLoanId.value = loan.id
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/loans/${loan.id}/return`, {
      method: 'POST',
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível registar a devolução.'
      )
    message.value = 'Devolução registada.'
    await loadLoansPage()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    returningLoanId.value = null
  }
}

function openEditDueDate(loan) {
  editingLoanId.value = loan.id
  editingLoanTitle.value = loan.livro_titulo
  editingDueDate.value = loan.data_prevista_devolucao
  editError.value = ''
  showEditDialog.value = true
}

async function saveDueDate() {
  if (!editingLoanId.value) return
  updatingLoan.value = true
  editError.value = ''
  try {
    const response = await apiFetch(`/api/loans/${editingLoanId.value}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueDate: editingDueDate.value })
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível alterar a data.')
    showEditDialog.value = false
    message.value = 'Data prevista atualizada.'
    await loadLoansPage()
  } catch (error) {
    editError.value = error.message
  } finally {
    updatingLoan.value = false
  }
}

function confirmCancel(loan) {
  loanToCancel.value = loan
  showCancelDialog.value = true
}

async function cancelLoan() {
  if (!loanToCancel.value) return
  cancellingLoan.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/loans/${loanToCancel.value.id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível cancelar o empréstimo.'
      )
    showCancelDialog.value = false
    message.value = 'Empréstimo cancelado; exemplar disponível.'
    await loadLoansPage()
  } catch (error) {
    errorMessage.value = error.message
    showCancelDialog.value = false
  } finally {
    cancellingLoan.value = false
  }
}

async function createReader() {
  savingReader.value = true
  readerFormError.value = ''
  try {
    const response = await apiFetch('/api/readers', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newReaderName.value,
        email: newReaderEmail.value,
        phone: newReaderPhone.value
      })
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível cadastrar o leitor.')
    showReaderDialog.value = false
    newReaderName.value = ''
    newReaderEmail.value = ''
    newReaderPhone.value = ''
    message.value = 'Leitor cadastrado.'
    await loadLoansPage()
  } catch (error) {
    readerFormError.value = error.message
  } finally {
    savingReader.value = false
  }
}

onMounted(loadLoansPage)
</script>

<style scoped>
.issue-dialog {
  width: min(100%, 480px);
}
</style>
