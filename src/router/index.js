import { defineRouter } from '#q-app'
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory
} from 'vue-router'

import routes from './routes.js'
import { loadSession } from '@/services/auth.js'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter((/* { store, ssrContext } */) => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE)
  })

  Router.beforeEach(async to => {
    const user = await loadSession()
    const requiresAuth = to.matched.some(record => record.meta.requiresAuth)

    if (requiresAuth && !user) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }

    if (to.meta.roles && user && !to.meta.roles.includes(user.nivel)) {
      return { name: 'dashboard' }
    }

    if (to.name === 'login' && user) {
      return { name: 'dashboard' }
    }

    return true
  })

  return Router
})
