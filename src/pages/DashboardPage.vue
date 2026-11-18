<template>
  <q-page class="q-pa-lg">
    <main class="dashboard-page page-content">
      <header
        class="dashboard-heading row items-end justify-between q-col-gutter-md"
      >
        <div class="col-12 col-md">
          <div class="text-overline text-primary">{{ roleLabel }}</div>
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-xs">
            Olá, {{ dashboard?.user.nome || currentUser?.nome }}
          </h1>
          <p class="text-body1 text-grey-7 q-mt-none q-mb-none">
            Resumo da biblioteca · {{ todayLabel }}
          </p>
        </div>
        <div
          class="dashboard-heading-actions col-12 col-md-auto row items-center q-gutter-sm"
        >
          <q-btn
            flat
            round
            dense
            icon="refresh"
            aria-label="Atualizar painel"
            :loading="loading"
            @click="loadDashboard"
          >
            <q-tooltip>Atualizar painel</q-tooltip>
          </q-btn>
          <q-btn
            v-if="currentUser?.nivel === 'ADMIN'"
            color="primary"
            icon="person_add"
            label="Novo utilizador"
            no-caps
            @click="showUserDialog = true"
          />
        </div>
      </header>

      <q-banner v-if="errorMessage" rounded class="feedback-negative q-mt-lg">
        <div class="row items-center justify-between q-gutter-sm">
          <span>{{ errorMessage }}</span>
          <q-btn
            flat
            dense
            label="Tentar novamente"
            no-caps
            @click="loadDashboard"
          />
        </div>
      </q-banner>

      <q-banner v-if="successMessage" rounded class="feedback-positive q-mt-lg">
        {{ successMessage }}
      </q-banner>

      <section
        class="dashboard-metrics row q-col-gutter-md q-mt-lg"
        aria-label="Indicadores da biblioteca"
      >
        <div
          v-for="stat in dashboard?.stats || []"
          :key="stat.label"
          class="col-6 col-sm-6 col-lg-3"
        >
          <q-card
            flat
            bordered
            class="metric-card full-height"
            :class="metricVisual(stat.label).tone"
          >
            <q-card-section class="metric-card-content">
              <div class="row items-start justify-between no-wrap">
                <div class="text-body2 text-grey-7">{{ stat.label }}</div>
                <q-icon
                  :name="metricVisual(stat.label).icon"
                  size="22px"
                  class="metric-icon"
                />
              </div>
              <div class="metric-value q-mt-md">{{ stat.value }}</div>
            </q-card-section>
          </q-card>
        </div>
        <template v-if="loading && !dashboard">
          <div
            v-for="item in 4"
            :key="`skeleton-${item}`"
            class="col-6 col-sm-6 col-lg-3"
          >
            <q-card flat bordered class="metric-card">
              <q-card-section>
                <q-skeleton type="text" width="65%" />
                <q-skeleton
                  type="text"
                  width="35px"
                  height="38px"
                  class="q-mt-md"
                />
              </q-card-section>
            </q-card>
          </div>
        </template>
      </section>

      <section class="dashboard-actions q-mt-xl">
        <div class="row items-center justify-between q-mb-sm">
          <h2 class="text-h6 text-weight-medium q-my-none">Acesso rápido</h2>
        </div>
        <div class="row q-col-gutter-sm">
          <div
            v-for="action in quickActions"
            :key="action.to"
            class="col-12 col-sm-6 col-lg-4"
          >
            <q-btn
              class="quick-action full-width"
              outline
              color="dark"
              :icon="action.icon"
              :label="action.label"
              :to="action.to"
              no-caps
              align="left"
            />
          </div>
        </div>
      </section>
    </main>

    <q-dialog v-model="showUserDialog">
      <q-card class="user-dialog">
        <q-card-section>
          <div class="text-h6">Criar utilizador</div>
        </q-card-section>

        <q-card-section>
          <q-form class="q-gutter-md" @submit.prevent="createAccount">
            <q-input
              v-model.trim="newName"
              label="Nome"
              outlined
              required
              maxlength="100"
            />
            <q-input
              v-model.trim="newEmail"
              label="E-mail"
              type="email"
              outlined
              required
              maxlength="254"
            />
            <q-input
              v-model="newPassword"
              label="Senha temporária"
              type="password"
              outlined
              required
              minlength="12"
              hint="Pelo menos 12 caracteres"
            />
            <q-select
              v-model="newRole"
              label="Nível de acesso"
              :options="roleOptions"
              emit-value
              map-options
              outlined
              required
            />
            <q-banner v-if="createError" rounded class="bg-red-1 text-negative">
              {{ createError }}
            </q-banner>
            <div class="row justify-end q-gutter-sm">
              <q-btn flat label="Cancelar" no-caps v-close-popup />
              <q-btn
                color="primary"
                label="Criar conta"
                type="submit"
                :loading="creatingUser"
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
import { createUser, currentUser } from '@/services/auth.js'
import { apiFetch } from '@/services/api.js'

const dashboard = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showUserDialog = ref(false)
const creatingUser = ref(false)
const createError = ref('')
const newName = ref('')
const newEmail = ref('')
const newPassword = ref('')
const newRole = ref('BIBLIOTECARIO')
const roleOptions = [
  { label: 'Administrador', value: 'ADMIN' },
  { label: 'Bibliotecário', value: 'BIBLIOTECARIO' },
  { label: 'Leitor', value: 'LEITOR' }
]
const roleNames = {
  ADMIN: 'Painel administrativo',
  BIBLIOTECARIO: 'Painel do bibliotecário',
  LEITOR: 'Área do leitor'
}
const roleLabel = computed(
  () => roleNames[currentUser.value?.nivel] ?? 'Biblioteca'
)
const todayLabel = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'full'
}).format(new Date())
const quickActionsByRole = {
  ADMIN: [
    { label: 'Consultar livros', icon: 'menu_book', to: '/books' },
    { label: 'Empréstimos e devoluções', icon: 'sync_alt', to: '/loans' },
    { label: 'Relatório diário', icon: 'assessment', to: '/reports' }
  ],
  BIBLIOTECARIO: [
    { label: 'Consultar e cadastrar livros', icon: 'menu_book', to: '/books' },
    { label: 'Registar saída ou devolução', icon: 'sync_alt', to: '/loans' },
    { label: 'Relatório diário', icon: 'assessment', to: '/reports' }
  ],
  LEITOR: [
    { label: 'Consultar catálogo', icon: 'menu_book', to: '/books' },
    { label: 'Os meus empréstimos', icon: 'bookmark', to: '/loans' },
    { label: 'As minhas devoluções', icon: 'assignment_return', to: '/returns' }
  ]
}
const quickActions = computed(
  () => quickActionsByRole[currentUser.value?.nivel] ?? []
)
const metricVisuals = {
  'Títulos no catálogo': { icon: 'menu_book', tone: 'metric-catalog' },
  Leitores: { icon: 'groups', tone: 'metric-readers' },
  'Empréstimos ativos': { icon: 'bookmark', tone: 'metric-loans' },
  Utilizadores: { icon: 'manage_accounts', tone: 'metric-users' },
  'Devoluções em atraso': { icon: 'event_busy', tone: 'metric-overdue' },
  'Exemplares no catálogo': { icon: 'library_books', tone: 'metric-catalog' },
  'Meus empréstimos ativos': { icon: 'bookmark', tone: 'metric-loans' },
  'Minhas devoluções em atraso': { icon: 'event_busy', tone: 'metric-overdue' }
}

function metricVisual(label) {
  return metricVisuals[label] ?? { icon: 'insights', tone: 'metric-default' }
}

async function loadDashboard() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await apiFetch('/api/dashboard', {
      credentials: 'same-origin'
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.message || 'Não foi possível carregar o painel.')
    dashboard.value = result
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

async function createAccount() {
  creatingUser.value = true
  createError.value = ''
  successMessage.value = ''

  try {
    await createUser({
      name: newName.value,
      email: newEmail.value,
      password: newPassword.value,
      role: newRole.value
    })
    successMessage.value = 'Utilizador criado.'
    showUserDialog.value = false
    newName.value = ''
    newEmail.value = ''
    newPassword.value = ''
    newRole.value = 'BIBLIOTECARIO'
    await loadDashboard()
  } catch (error) {
    createError.value = error.message
  } finally {
    creatingUser.value = false
  }
}

onMounted(loadDashboard)
</script>

<style scoped>
.dashboard-heading {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--library-border);
}

.metric-card {
  min-height: 132px;
  border-top: 3px solid transparent;
}

.metric-card-content {
  padding: 18px;
}

.metric-icon {
  flex: 0 0 auto;
}

.metric-value {
  color: var(--library-ink);
  font-size: 36px;
  font-weight: 600;
  line-height: 1;
}

.metric-catalog {
  border-top-color: var(--q-primary);
}

.metric-catalog .metric-icon {
  color: var(--q-primary);
}

.metric-readers {
  border-top-color: var(--q-secondary);
}

.metric-readers .metric-icon {
  color: var(--q-secondary);
}

.metric-loans {
  border-top-color: var(--q-accent);
}

.metric-loans .metric-icon {
  color: var(--q-accent);
}

.metric-users {
  border-top-color: #347985;
}

.metric-users .metric-icon {
  color: #347985;
}

.metric-overdue {
  border-top-color: var(--q-negative);
}

.metric-overdue .metric-icon {
  color: var(--q-negative);
}

.metric-default {
  border-top-color: var(--q-primary);
}

.quick-action {
  min-height: 54px;
  justify-content: flex-start;
  border-color: var(--library-border);
  background: var(--library-surface);
}

.user-dialog {
  width: min(100%, 480px);
}

@media (max-width: 599px) {
  .dashboard-heading-actions {
    justify-content: flex-start;
  }

  .metric-card {
    min-height: 118px;
  }

  .metric-card-content {
    padding: 14px;
  }

  .metric-value {
    font-size: 30px;
  }
}
</style>
