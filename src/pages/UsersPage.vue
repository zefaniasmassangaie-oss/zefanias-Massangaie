<template>
  <q-page class="q-pa-lg">
    <main class="page-content">
      <div class="text-overline text-primary">ADMINISTRAÇÃO</div>
      <div class="row items-center justify-between q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md">
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm"
            >Utilizadores</h1
          >
          <p class="text-body1 text-grey-7 q-mt-none q-mb-none">
            Gere contas, níveis de acesso e estado.
          </p>
        </div>
        <q-btn
          class="mobile-full-width col-12 col-md-auto"
          color="primary"
          icon="person_add"
          label="Novo utilizador"
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
        placeholder="Pesquisar utilizadores"
        aria-label="Pesquisar utilizadores"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>

      <q-table
        class="responsive-table"
        flat
        bordered
        row-key="id"
        :grid="$q.screen.lt.sm"
        :rows="users"
        :columns="columns"
        :filter="filter"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        no-data-label="Ainda não há utilizadores cadastrados"
      >
        <template #body-cell-nivel="props">
          <q-td :props="props">{{ roleLabel(props.value) }}</q-td>
        </template>
        <template #body-cell-estado="props">
          <q-td :props="props">
            <q-chip
              dense
              :class="
                props.value === 'ATIVO' ? 'stock-available' : 'stock-empty'
              "
            >
              {{ props.value === 'ATIVO' ? 'Ativo' : 'Inativo' }}
            </q-chip>
          </q-td>
        </template>
        <template #body-cell-acoes="props">
          <q-td :props="props">
            <q-btn
              flat
              round
              dense
              icon="edit"
              aria-label="Editar utilizador"
              @click="openEdit(props.row)"
            />
            <q-btn
              v-if="props.row.estado === 'ATIVO'"
              flat
              round
              dense
              icon="person_off"
              color="negative"
              aria-label="Desativar utilizador"
              @click="confirmDeactivate(props.row)"
            />
            <q-btn
              v-else
              flat
              round
              dense
              icon="person"
              color="positive"
              aria-label="Reativar utilizador"
              @click="setUserState(props.row, 'ATIVO')"
            />
          </q-td>
        </template>
        <template #item="props">
          <div class="q-pa-xs col-12">
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-start justify-between q-gutter-sm">
                  <div>
                    <div class="text-subtitle1 text-weight-medium">{{
                      props.row.nome
                    }}</div>
                    <div class="text-body2 text-grey-7">{{
                      props.row.email
                    }}</div>
                  </div>
                  <q-chip
                    dense
                    :class="
                      props.row.estado === 'ATIVO'
                        ? 'stock-available'
                        : 'stock-empty'
                    "
                  >
                    {{ props.row.estado === 'ATIVO' ? 'Ativo' : 'Inativo' }}
                  </q-chip>
                </div>
                <div class="text-body2 q-mt-sm">{{
                  roleLabel(props.row.nivel)
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
                  v-if="props.row.estado === 'ATIVO'"
                  flat
                  icon="person_off"
                  label="Desativar"
                  color="negative"
                  no-caps
                  @click="confirmDeactivate(props.row)"
                />
                <q-btn
                  v-else
                  flat
                  icon="person"
                  label="Reativar"
                  color="positive"
                  no-caps
                  @click="setUserState(props.row, 'ATIVO')"
                />
              </q-card-actions>
            </q-card>
          </div>
        </template>
      </q-table>
    </main>

    <q-dialog v-model="formOpen" :maximized="$q.screen.lt.sm">
      <q-card class="user-dialog">
        <q-card-section>
          <div class="text-h6">{{
            editingUser ? 'Editar utilizador' : 'Criar utilizador'
          }}</div>
        </q-card-section>
        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="saveUser">
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
              required
              maxlength="254"
            />
            <q-select
              v-model="form.role"
              label="Nível de acesso"
              :options="roleOptions"
              emit-value
              map-options
              outlined
              required
            />
            <q-select
              v-model="form.state"
              label="Estado"
              :options="stateOptions"
              emit-value
              map-options
              outlined
              required
            />
            <q-input
              v-model="form.password"
              :label="
                editingUser ? 'Nova senha (opcional)' : 'Senha temporária'
              "
              type="password"
              outlined
              :required="!editingUser"
              minlength="12"
              :hint="
                editingUser
                  ? 'Deixa vazio para manter a senha atual.'
                  : 'Pelo menos 12 caracteres'
              "
            />
            <q-banner v-if="formError" rounded class="feedback-negative">{{
              formError
            }}</q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                :label="editingUser ? 'Guardar alterações' : 'Criar conta'"
                type="submit"
                :loading="saving"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="deactivateOpen">
      <q-card class="user-dialog">
        <q-card-section>
          <div class="text-h6">Desativar utilizador</div>
          <p class="q-mb-none"
            >A conta de {{ pendingUser?.nome }} será desativada, sem apagar o
            histórico. Pode ser reativada depois.</p
          >
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" no-caps v-close-popup />
          <q-btn
            color="negative"
            label="Desativar"
            no-caps
            :loading="saving"
            @click="deactivateUser"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { apiFetch } from '@/services/api.js'

const users = ref([])
const loading = ref(false)
const saving = ref(false)
const filter = ref('')
const message = ref('')
const errorMessage = ref('')
const formError = ref('')
const formOpen = ref(false)
const deactivateOpen = ref(false)
const editingUser = ref(null)
const pendingUser = ref(null)
const form = reactive({
  name: '',
  email: '',
  role: 'BIBLIOTECARIO',
  state: 'ATIVO',
  password: ''
})
const roleOptions = [
  { label: 'Administrador', value: 'ADMIN' },
  { label: 'Bibliotecário', value: 'BIBLIOTECARIO' },
  { label: 'Leitor', value: 'LEITOR' }
]
const stateOptions = [
  { label: 'Ativo', value: 'ATIVO' },
  { label: 'Inativo', value: 'INATIVO' }
]
const columns = [
  { name: 'nome', label: 'Nome', field: 'nome', align: 'left', sortable: true },
  {
    name: 'email',
    label: 'E-mail',
    field: 'email',
    align: 'left',
    sortable: true
  },
  {
    name: 'nivel',
    label: 'Nível',
    field: 'nivel',
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
  { name: 'acoes', label: 'Ações', field: 'id', align: 'right' }
]

function roleLabel(role) {
  return (
    {
      ADMIN: 'Administrador',
      BIBLIOTECARIO: 'Bibliotecário',
      LEITOR: 'Leitor'
    }[role] || role
  )
}

async function loadUsers() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch('/api/users', {
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível carregar os utilizadores.'
      )
    users.value = result.users
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingUser.value = null
  formError.value = ''
  Object.assign(form, {
    name: '',
    email: '',
    role: 'BIBLIOTECARIO',
    state: 'ATIVO',
    password: ''
  })
  formOpen.value = true
}

function openEdit(user) {
  editingUser.value = user
  formError.value = ''
  Object.assign(form, {
    name: user.nome,
    email: user.email,
    role: user.nivel,
    state: user.estado,
    password: ''
  })
  formOpen.value = true
}

async function saveUser() {
  saving.value = true
  formError.value = ''
  try {
    const response = await apiFetch(
      editingUser.value ? `/api/users/${editingUser.value.id}` : '/api/users',
      {
        method: editingUser.value ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form })
      }
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível guardar o utilizador.'
      )
    message.value = editingUser.value
      ? 'Utilizador atualizado.'
      : 'Utilizador criado.'
    formOpen.value = false
    await loadUsers()
  } catch (error) {
    formError.value = error.message
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(user) {
  pendingUser.value = user
  deactivateOpen.value = true
}

async function setUserState(user, state) {
  saving.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/users/${user.id}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: user.nome,
        email: user.email,
        role: user.nivel,
        state,
        password: ''
      })
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível alterar o estado da conta.'
      )
    message.value = state === 'ATIVO' ? 'Conta reativada.' : 'Conta desativada.'
    await loadUsers()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function deactivateUser() {
  if (!pendingUser.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch(`/api/users/${pendingUser.value.id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível desativar a conta.')
    deactivateOpen.value = false
    message.value = 'Conta desativada.'
    await loadUsers()
  } catch (error) {
    errorMessage.value = error.message
    deactivateOpen.value = false
  } finally {
    saving.value = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.user-dialog {
  width: min(100%, 520px);
}
</style>
