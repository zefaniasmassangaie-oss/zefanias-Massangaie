<template>
  <q-page class="q-pa-lg">
    <main class="page-content">
      <div class="text-overline text-primary">CATÁLOGO</div>
      <div class="row items-center justify-between q-col-gutter-md">
        <div class="col-12 col-md">
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm">Livros</h1>
          <p class="text-body1 text-grey-7 q-mt-none"
            >Consulta os títulos e exemplares disponíveis.</p
          >
        </div>
        <q-btn
          class="mobile-full-width col-12 col-md-auto"
          v-if="canManageBooks"
          color="primary"
          icon="add"
          label="Novo livro"
          no-caps
          @click="openCreate"
        />
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

      <q-input
        v-model="filter"
        class="q-mb-md"
        outlined
        dense
        clearable
        debounce="200"
        placeholder="Pesquisar por título, autor ou categoria"
        aria-label="Pesquisar livros"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-table
        class="responsive-table"
        flat
        bordered
        row-key="id"
        :grid="$q.screen.lt.sm"
        :rows="books"
        :filter="filter"
        :columns="columns"
        :loading="loading"
        no-data-label="Ainda não há livros no catálogo"
        :pagination="{ rowsPerPage: 10 }"
      >
        <template #body-cell-acoes="props">
          <q-td :props="props">
            <q-btn
              v-if="canManageBooks"
              flat
              round
              dense
              icon="edit"
              aria-label="Editar livro"
              @click="openEdit(props.row)"
            />
            <q-btn
              v-if="canManageBooks"
              flat
              round
              dense
              icon="delete"
              color="negative"
              aria-label="Eliminar livro"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
        <template #item="props">
          <div class="q-pa-xs col-12">
            <q-card flat bordered>
              <q-card-section>
                <div class="text-subtitle1 text-weight-medium">{{
                  props.row.titulo
                }}</div>
                <div class="text-body2 text-grey-7">{{ props.row.autor }}</div>
                <div class="row items-center justify-between q-mt-sm">
                  <span class="text-caption"
                    >{{ props.row.categoria || 'Sem categoria' }} ·
                    {{ props.row.ano || 'Ano desconhecido' }}</span
                  >
                  <q-chip
                    dense
                    :class="
                      props.row.disponiveis > 0
                        ? 'stock-available'
                        : 'stock-empty'
                    "
                  >
                    {{ props.row.disponiveis }} de
                    {{ props.row.quantidade_total }}
                  </q-chip>
                </div>
              </q-card-section>
              <q-card-actions v-if="canManageBooks" align="right">
                <q-btn
                  flat
                  icon="edit"
                  label="Editar"
                  no-caps
                  @click="openEdit(props.row)"
                />
                <q-btn
                  flat
                  icon="delete"
                  label="Eliminar"
                  color="negative"
                  no-caps
                  @click="confirmDelete(props.row)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </template>
        <template #body-cell-disponiveis="props">
          <q-td :props="props">
            <q-chip
              dense
              :class="props.value > 0 ? 'stock-available' : 'stock-empty'"
            >
              {{ props.value }} de {{ props.row.quantidade_total }}
            </q-chip>
          </q-td>
        </template>
      </q-table>
    </main>

    <q-dialog v-model="showBookDialog" :maximized="$q.screen.lt.sm">
      <q-card class="book-dialog">
        <q-card-section>
          <div class="text-h6">{{
            editingBook ? 'Editar livro' : 'Cadastrar livro'
          }}</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="saveBook">
            <q-input
              v-model.trim="title"
              label="Título"
              outlined
              required
              maxlength="200"
            />
            <q-input
              v-model.trim="author"
              label="Autor"
              outlined
              required
              maxlength="150"
            />
            <q-input
              v-model.trim="category"
              label="Categoria"
              outlined
              maxlength="100"
            />
            <div class="row q-col-gutter-sm">
              <q-input
                v-model.number="year"
                class="col"
                label="Ano"
                type="number"
                outlined
                min="0"
                max="9999"
              />
              <q-input
                v-model.number="quantity"
                class="col"
                label="Exemplares"
                type="number"
                outlined
                required
                min="1"
              />
            </div>
            <q-banner v-if="formError" rounded class="bg-red-1 text-negative">
              {{ formError }}
            </q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                :label="editingBook ? 'Guardar alterações' : 'Guardar livro'"
                type="submit"
                :loading="saving"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteDialogOpen">
      <q-card class="book-dialog">
        <q-card-section>
          <div class="text-h6">Eliminar livro</div>
          <p class="q-mb-none"
            >Queres eliminar “{{ pendingDelete?.titulo }}”? Livros com histórico
            de empréstimos não podem ser eliminados.</p
          >
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" no-caps v-close-popup />
          <q-btn
            color="negative"
            label="Eliminar"
            no-caps
            :loading="deleting"
            @click="deleteBook"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { currentUser } from '@/services/auth.js'
import { apiFetch } from '@/services/api.js'

const books = ref([])
const loading = ref(false)
const errorMessage = ref('')
const message = ref('')
const filter = ref('')
const formError = ref('')
const showBookDialog = ref(false)
const deleteDialogOpen = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editingBook = ref(null)
const pendingDelete = ref(null)
const title = ref('')
const author = ref('')
const category = ref('')
const year = ref(null)
const quantity = ref(1)
const canManageBooks = computed(() =>
  ['ADMIN', 'BIBLIOTECARIO'].includes(currentUser.value?.nivel)
)
const columns = [
  {
    name: 'titulo',
    label: 'Título',
    field: 'titulo',
    align: 'left',
    sortable: true
  },
  {
    name: 'autor',
    label: 'Autor',
    field: 'autor',
    align: 'left',
    sortable: true
  },
  {
    name: 'categoria',
    label: 'Categoria',
    field: 'categoria',
    align: 'left',
    sortable: true
  },
  { name: 'ano', label: 'Ano', field: 'ano', align: 'left', sortable: true },
  {
    name: 'quantidade_total',
    label: 'Exemplares',
    field: 'quantidade_total',
    align: 'right',
    sortable: true
  },
  {
    name: 'disponiveis',
    label: 'Disponíveis',
    field: 'disponiveis',
    align: 'right',
    sortable: true
  },
  { name: 'acoes', label: 'Ações', field: 'id', align: 'right' }
]

async function loadBooks() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch('/api/books', {
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível carregar o catálogo.')
    books.value = result.books
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

function resetBookForm() {
  title.value = ''
  author.value = ''
  category.value = ''
  year.value = null
  quantity.value = 1
}

function openCreate() {
  editingBook.value = null
  formError.value = ''
  resetBookForm()
  showBookDialog.value = true
}

function openEdit(book) {
  editingBook.value = book
  formError.value = ''
  title.value = book.titulo
  author.value = book.autor
  category.value = book.categoria || ''
  year.value = book.ano
  quantity.value = book.quantidade_total
  showBookDialog.value = true
}

async function saveBook() {
  saving.value = true
  formError.value = ''
  try {
    const response = await apiFetch(
      editingBook.value ? `/api/books/${editingBook.value.id}` : '/api/books',
      {
        method: editingBook.value ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.value,
          author: author.value,
          category: category.value,
          year: year.value,
          quantity: quantity.value
        })
      }
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível cadastrar o livro.')
    showBookDialog.value = false
    message.value = editingBook.value
      ? 'Livro atualizado.'
      : 'Livro cadastrado.'
    resetBookForm()
    await loadBooks()
  } catch (error) {
    formError.value = error.message
  } finally {
    saving.value = false
  }
}

function confirmDelete(book) {
  pendingDelete.value = book
  deleteDialogOpen.value = true
}

async function deleteBook() {
  if (!pendingDelete.value) return
  deleting.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/books/${pendingDelete.value.id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível eliminar o livro.')
    deleteDialogOpen.value = false
    message.value = 'Livro eliminado.'
    await loadBooks()
  } catch (error) {
    errorMessage.value = error.message
    deleteDialogOpen.value = false
  } finally {
    deleting.value = false
  }
}

onMounted(loadBooks)
</script>

<style scoped>
.book-dialog {
  width: min(100%, 480px);
}
</style>
