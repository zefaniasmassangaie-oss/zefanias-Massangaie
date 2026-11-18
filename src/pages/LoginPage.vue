<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="login-page flex flex-center q-pa-md">
        <q-card flat bordered class="login-panel">
          <q-card-section class="q-pb-none">
            <div class="row items-center q-gutter-sm text-primary">
              <q-icon name="local_library" size="30px" />
              <div class="text-h5 text-weight-medium text-dark">Biblioteca</div>
            </div>
            <div class="text-body2 text-grey-7 q-mt-sm">
              {{ setupRequired ? 'Configuração inicial' : 'Acesso ao sistema' }}
            </div>
          </q-card-section>

          <q-card-section>
            <q-form class="q-gutter-md" @submit.prevent="submitForm">
              <q-input
                v-if="setupRequired"
                v-model.trim="name"
                label="Nome completo"
                autocomplete="name"
                maxlength="100"
                outlined
                required
              />
              <q-input
                v-model.trim="email"
                label="E-mail"
                type="email"
                autocomplete="username"
                maxlength="254"
                outlined
                required
              />
              <q-input
                v-model="password"
                :label="setupRequired ? 'Criar senha' : 'Senha'"
                :type="showPassword ? 'text' : 'password'"
                :autocomplete="
                  setupRequired ? 'new-password' : 'current-password'
                "
                :hint="
                  setupRequired ? 'Use pelo menos 12 caracteres.' : undefined
                "
                minlength="12"
                outlined
                required
              >
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <q-banner
                v-if="errorMessage"
                rounded
                class="bg-red-1 text-negative"
              >
                {{ errorMessage }}
              </q-banner>
              <q-banner
                v-if="serviceUnavailable"
                rounded
                class="feedback-warning"
              >
                Serviço local indisponível. Confirma se a API está em execução.
              </q-banner>

              <q-btn
                class="full-width"
                color="primary"
                :label="setupRequired ? 'Criar administrador' : 'Entrar'"
                type="submit"
                :loading="submitting"
                no-caps
              />
            </q-form>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login, setupAdministrator } from '@/services/auth.js'
import { apiFetch } from '@/services/api.js'

const route = useRoute()
const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const setupRequired = ref(false)
const showPassword = ref(false)
const submitting = ref(false)
const serviceUnavailable = ref(false)
const errorMessage = ref('')

async function submitForm() {
  submitting.value = true
  errorMessage.value = ''
  serviceUnavailable.value = false

  try {
    if (setupRequired.value) {
      await setupAdministrator(name.value, email.value, password.value)
    } else {
      await login(email.value, password.value)
    }

    const destination =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(destination)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  try {
    const response = await apiFetch('/api/setup-status', {
      credentials: 'same-origin'
    })
    if (!response.ok) throw new Error('Serviço local indisponível.')
    const result = await response.json()
    setupRequired.value = result.setupRequired
  } catch {
    serviceUnavailable.value = true
  }
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--library-canvas);
}

.login-panel {
  width: min(100%, 420px);
  border-radius: 8px;
  background: #fff;
}
</style>
