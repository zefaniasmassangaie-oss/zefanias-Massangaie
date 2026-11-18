import { Capacitor } from '@capacitor/core'

export async function apiFetch(input, options = {}) {
  if (Capacitor.isNativePlatform()) {
    const { nativeApiFetch } = await import('./nativeApi.js')
    return nativeApiFetch(input, options)
  }

  return fetch(input, options)
}
