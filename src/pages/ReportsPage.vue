<template>
  <q-page class="q-pa-lg">
    <main class="page-content">
      <div class="text-overline text-primary">OPERAÇÕES</div>
      <div class="row items-end justify-between q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md">
          <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm">
            Relatório diário
          </h1>
          <p class="text-body1 text-grey-7 q-mt-none">
            Consulta e regista o movimento diário da biblioteca.
          </p>
        </div>
        <div
          class="row items-center q-gutter-sm report-controls col-12 col-md-auto"
        >
          <q-input
            class="report-date"
            v-model="reportDate"
            type="date"
            label="Data do relatório"
            outlined
            dense
            :max="today"
          />
          <q-btn
            class="report-action"
            color="primary"
            icon="save"
            :label="report?.registered ? 'Relatório registado' : 'Registar dia'"
            no-caps
            :disable="!report || Boolean(report.registered)"
            :loading="saving"
            @click="registerReport"
          />
        </div>
      </div>

      <q-banner
        v-if="errorMessage"
        rounded
        class="bg-red-1 text-negative q-mb-md"
      >
        {{ errorMessage }}
      </q-banner>
      <q-banner v-if="successMessage" rounded class="feedback-positive q-mb-md">
        {{ successMessage }}
      </q-banner>

      <div v-if="report" class="row q-col-gutter-md q-mb-xl">
        <div
          v-for="summary in summaries"
          :key="summary.label"
          class="col-12 col-sm-4"
        >
          <q-card flat bordered>
            <q-card-section>
              <div class="text-body2 text-grey-7">{{ summary.label }}</div>
              <div class="text-h3 text-weight-medium q-mt-sm">{{
                summary.value
              }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <q-banner
        v-if="report?.registered"
        rounded
        class="feedback-positive q-mb-lg"
      >
        Registado por {{ report.registered.registado_por }} em
        {{ formatDateTime(report.registered.criado_em) }}.
      </q-banner>

      <section v-if="report" class="q-mb-xl">
        <h2 class="text-h6 text-weight-medium">Saídas registadas</h2>
        <q-table
          class="responsive-table"
          flat
          bordered
          row-key="id"
          :grid="$q.screen.lt.sm"
          :rows="report.exits"
          :columns="exitColumns"
          :pagination="{ rowsPerPage: 5 }"
          no-data-label="Sem saídas nesta data"
        />
      </section>

      <section v-if="report" class="q-mb-xl">
        <h2 class="text-h6 text-weight-medium">Devoluções registadas</h2>
        <q-table
          class="responsive-table"
          flat
          bordered
          row-key="id"
          :grid="$q.screen.lt.sm"
          :rows="report.returns"
          :columns="returnColumns"
          :pagination="{ rowsPerPage: 5 }"
          no-data-label="Sem devoluções nesta data"
        />
      </section>

      <section v-if="report">
        <h2 class="text-h6 text-weight-medium">Em atraso no fim do dia</h2>
        <q-table
          class="responsive-table"
          flat
          bordered
          row-key="id"
          :grid="$q.screen.lt.sm"
          :rows="report.overdue"
          :columns="overdueColumns"
          :pagination="{ rowsPerPage: 5 }"
          no-data-label="Sem empréstimos em atraso nesta data"
        />
      </section>
    </main>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { apiFetch } from '@/services/api.js'

const $q = useQuasar()
const today = new Date().toISOString().slice(0, 10)
const reportDate = ref(today)
const report = ref(null)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const summaries = computed(() => [
  { label: 'Saídas', value: report.value?.totals.exits ?? 0 },
  { label: 'Devoluções', value: report.value?.totals.returns ?? 0 },
  { label: 'Em atraso', value: report.value?.totals.overdue ?? 0 }
])
const exitColumns = [
  {
    name: 'livro_titulo',
    label: 'Livro',
    field: 'livro_titulo',
    align: 'left'
  },
  { name: 'leitor_nome', label: 'Leitor', field: 'leitor_nome', align: 'left' },
  {
    name: 'data_prevista_devolucao',
    label: 'Devolução prevista',
    field: 'data_prevista_devolucao',
    align: 'left'
  },
  {
    name: 'registado_por',
    label: 'Registado por',
    field: 'registado_por',
    align: 'left'
  }
]
const returnColumns = [
  {
    name: 'livro_titulo',
    label: 'Livro',
    field: 'livro_titulo',
    align: 'left'
  },
  { name: 'leitor_nome', label: 'Leitor', field: 'leitor_nome', align: 'left' },
  {
    name: 'data_devolucao',
    label: 'Devolvido em',
    field: row => formatDateTime(row.data_devolucao),
    align: 'left'
  }
]
const overdueColumns = [
  {
    name: 'livro_titulo',
    label: 'Livro',
    field: 'livro_titulo',
    align: 'left'
  },
  { name: 'leitor_nome', label: 'Leitor', field: 'leitor_nome', align: 'left' },
  {
    name: 'data_prevista_devolucao',
    label: 'Vencimento',
    field: 'data_prevista_devolucao',
    align: 'left'
  }
]

function formatDateTime(value) {
  return new Date(`${value.replace(' ', 'T')}Z`).toLocaleString()
}

async function loadReport() {
  report.value = null
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await apiFetch(
      `/api/reports/daily?date=${reportDate.value}`,
      {
        credentials: 'same-origin'
      }
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível carregar o relatório.'
      )
    report.value = result.report
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function registerReport() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await apiFetch('/api/reports/daily', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: reportDate.value })
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.message || 'Não foi possível registar o relatório.'
      )
    report.value = result.report
    successMessage.value = 'Relatório diário registado.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

watch(reportDate, loadReport)
onMounted(loadReport)
</script>

<style scoped>
.report-date {
  width: 200px;
}

@media (max-width: 599px) {
  .report-controls,
  .report-date,
  .report-action {
    width: 100%;
  }
}
</style>
