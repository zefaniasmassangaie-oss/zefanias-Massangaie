<template>
  <q-page class="q-pa-lg">
    <main class="page-content">
      <div class="text-overline text-primary">CADASTRO</div>
      <div class="row items-center justify-between q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md">
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm">Leitores</h1>
          <p class="text-body1 text-grey-7 q-mt-none q-mb-none">
            Consulta e mantém os registos dos leitores.
          </p>
        </div>
        <q-btn
          class="mobile-full-width col-12 col-md-auto"
          color="primary"
          icon="person_add"
          label="Novo leitor"
          no-caps
          @click="openCreate"
        />
      </div>

      <q-banner v-if="message" rounded class="feedback-positive q-mb-md">{{
        message
      }}</q-banner>
      <q-banner v-if="errorMessage" rounded class="feedback-negative q-mb-md">{{
        errorMessage
      }}</q-banner>

      <q-input
        v-model="filter"
        class="q-mb-md"
        outlined
        dense
        clearable
        debounce="200"
        placeholder="Pesquisar leitores"
        aria-label="Pesquisar leitores"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>

      <q-table
        class="responsive-table"
        flat
        bordered
        row-key="id"
        :grid="$q.screen.lt.sm"
        :rows="readers"
        :columns="columns"
        :filter="filter"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="Ainda não há leitores cadastrados"
      >
        <template #body-cell-acoes="props">
          <q-td :props="props">
            <q-btn
              flat
              round
              dense
              icon="edit"
              aria-label="Editar leitor"
              @click="openEdit(props.row)"
            />
            <q-btn
              flat
              round
              dense
              icon="delete"
              color="negative"
              aria-label="Eliminar leitor"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
        <template #item="props">
          <div class="q-pa-xs col-12">
            <q-card flat bordered>
              <q-card-section>
                <div class="text-subtitle1 text-weight-medium">{{
                  props.row.nome
                }}</div>
                <div class="text-body2 text-grey-7">{{
                  props.row.email || 'Sem e-mail'
                }}</div>
                <div class="text-body2 q-mt-sm">{{
                  props.row.telefone || 'Sem telefone'
                }}</div>
              </q-card-section>
              <q-card-actions align="right">
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
      </q-table>
    </main>

    <q-dialog v-model="formOpen" :maximized="$q.screen.lt.sm">
      <q-card class="reader-dialog">
        <q-card-section>
          <div class="text-h6">{{
            editingReader ? 'Editar leitor' : 'Cadastrar leitor'
          }}</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="saveReader">
            <q-input
              v-model.trim="form.name"
              label="Nome"
              outlined
              required
              maxlength="100"
            />
            <q-input
              v-model.trim="form.email"
              label="E-mail"
              type="email"
              outlined
              maxlength="254"
            />
            <q-input
              v-model.trim="form.phone"
              label="Telefone"
              type="tel"
              outlined
              maxlength="40"
            />
            <q-input
              v-model.trim="form.address"
              label="Endereço"
              outlined
              maxlength="250"
            />
            <q-banner v-if="formError" rounded class="feedback-negative">{{
              formError
            }}</q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                :label="
                  editingReader ? 'Guardar alterações' : 'Cadastrar leitor'
                "
                type="submit"
                :loading="saving"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deleteOpen">
      <q-card class="reader-dialog">
        <q-card-section>
          <div class="text-h6">Eliminar leitor</div>
          <p class="q-mb-none"
            >Queres eliminar {{ pendingDelete?.nome }}? Leitores com empréstimos
            ou conta associada não podem ser eliminados.</p
          >
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" no-caps v-close-popup />
          <q-btn
            color="negative"
            label="Eliminar"
            no-caps
            :loading="deleting"
            @click="deleteReader"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { apiFetch } from '@/services/api.js'

const readers = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const filter = ref('')
const message = ref('')
const errorMessage = ref('')
const formError = ref('')
const formOpen = ref(false)
const deleteOpen = ref(false)
const editingReader = ref(null)
const pendingDelete = ref(null)
const form = reactive({ name: '', email: '', phone: '', address: '' })
const columns = [
  { name: 'nome', label: 'Nome', field: 'nome', align: 'left', sortable: true },
  {
    name: 'email',
    label: 'E-mail',
    field: 'email',
    align: 'left',
    sortable: true
  },
  { name: 'telefone', label: 'Telefone', field: 'telefone', align: 'left' },
  { name: 'endereco', label: 'Endereço', field: 'endereco', align: 'left' },
  { name: 'acoes', label: 'Ações', field: 'id', align: 'right' }
]

async function loadReaders() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch('/api/readers', {
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível carregar os leitores.'
      )
    readers.value = result.readers
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, { name: '', email: '', phone: '', address: '' })
}

function openCreate() {
  editingReader.value = null
  formError.value = ''
  resetForm()
  formOpen.value = true
}

function openEdit(reader) {
  editingReader.value = reader
  formError.value = ''
  Object.assign(form, {
    name: reader.nome,
    email: reader.email || '',
    phone: reader.telefone || '',
    address: reader.endereco || ''
  })
  formOpen.value = true
}

async function saveReader() {
  saving.value = true
  formError.value = ''
  try {
    const response = await apiFetch(
      editingReader.value
        ? `/api/readers/${editingReader.value.id}`
        : '/api/readers',
      {
        method: editingReader.value ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      }
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível guardar o leitor.')
    message.value = editingReader.value
      ? 'Leitor atualizado.'
      : 'Leitor cadastrado.'
    formOpen.value = false
    await loadReaders()
  } catch (error) {
    formError.value = error.message
  } finally {
    saving.value = false
  }
}

function confirmDelete(reader) {
  pendingDelete.value = reader
  deleteOpen.value = true
}

async function deleteReader() {
  if (!pendingDelete.value) return
  deleting.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/readers/${pendingDelete.value.id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível eliminar o leitor.')
    message.value = 'Leitor eliminado.'
    deleteOpen.value = false
    await loadReaders()
  } catch (error) {
    errorMessage.value = error.message
    deleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

onMounted(loadReaders)
</script>

<style scoped>
.reader-dialog {
  width: min(100%, 520px);
}
</style>
