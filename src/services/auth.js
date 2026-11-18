import { ref } from 'vue'
import { apiFetch } from './api.js'

export const currentUser = ref(null)

let sessionLoaded = false
let sessionRequest

async function sendAuthRequest(path, payload) {
  const response = await apiFetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.message || 'Não foi possível concluir o pedido.')
  }

  return result.user
}

export async function loadSession() {
  if (sessionLoaded) return currentUser.value
  if (sessionRequest) return sessionRequest

  sessionRequest = apiFetch('/api/me', { credentials: 'same-origin' })
    .then(async response => {
      if (response.ok) {
        const result = await response.json()
        currentUser.value = result.user
      } else {
        currentUser.value = null
      }
      return currentUser.value
    })
    .catch(() => {
      currentUser.value = null
      return null
    })
    .finally(() => {
      sessionLoaded = true
      sessionRequest = null
    })

  return sessionRequest
}

export async function login(email, password) {
  currentUser.value = await sendAuthRequest('/api/login', { email, password })
  sessionLoaded = true
  return currentUser.value
}

export async function setupAdministrator(name, email, password) {
  currentUser.value = await sendAuthRequest('/api/setup', {
    name,
    email,
    password
  })
  sessionLoaded = true
  return currentUser.value
}

export async function createUser(user) {
  return sendAuthRequest('/api/users', user)
}

export async function logout() {
  try {
    await apiFetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    })
  } finally {
    currentUser.value = null
    sessionLoaded = true
  }
}
