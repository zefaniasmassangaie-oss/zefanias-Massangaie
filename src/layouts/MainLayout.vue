<template>
  <q-layout view="lHh Lpr lFf">
    <q-header class="bg-white text-dark" bordered>
      <q-toolbar>
        <q-btn
          flat
          round
          dense
          icon="menu"
          aria-label="Abrir menu"
          @click="drawerOpen = !drawerOpen"
        />
        <q-icon
          name="local_library"
          size="28px"
          color="primary"
          class="q-mr-sm"
        />
        <q-toolbar-title class="text-weight-medium">Biblioteca</q-toolbar-title>
        <div class="text-body2 q-mr-md gt-xs">
          {{ currentUser?.nome }} · {{ roleLabel }}
        </div>
        <q-btn
          flat
          round
          dense
          icon="logout"
          aria-label="Sair"
          @click="signOut"
        >
          <q-tooltip>Sair</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      :width="260"
      :breakpoint="768"
      behavior="desktop"
    >
      <q-list padding>
        <q-item-label header>Biblioteca</q-item-label>
        <q-item
          v-for="item in navigationItems"
          :key="item.to"
          clickable
          :to="item.to"
          :exact="item.to === '/'"
          :active="route.path === item.to"
          active-class="library-nav-active"
          @click="drawerOpen = false"
        >
          <q-item-section avatar>
            <q-icon :name="item.icon" />
          </q-item-section>
          <q-item-section>{{ item.label }}</q-item-section>
        </q-item>
        <q-separator spaced />
        <q-item-label header>{{ roleLabel }}</q-item-label>
        <q-item>
          <q-item-section avatar>
            <q-icon name="person" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ currentUser?.nome }}</q-item-label>
            <q-item-label caption lines="1">{{
              currentUser?.email
            }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUser, logout } from '@/services/auth.js'

const router = useRouter()
const route = useRoute()
const drawerOpen = ref(false)
const roleNames = {
  ADMIN: 'Administrador',
  BIBLIOTECARIO: 'Bibliotecário',
  LEITOR: 'Leitor'
}
const roleLabel = computed(() => roleNames[currentUser.value?.nivel] ?? '')
const navigationByRole = {
  ADMIN: [
    { label: 'Dashboard', icon: 'dashboard', to: '/' },
    { label: 'Livros', icon: 'menu_book', to: '/books' },
    { label: 'Leitores', icon: 'groups', to: '/readers' },
    { label: 'Empréstimos', icon: 'bookmark', to: '/loans' },
    { label: 'Devoluções', icon: 'assignment_return', to: '/returns' },
    { label: 'Utilizadores', icon: 'manage_accounts', to: '/users' },
    { label: 'Relatórios', icon: 'assessment', to: '/reports' },
    { label: 'Perfil', icon: 'person', to: '/profile' }
  ],
  BIBLIOTECARIO: [
    { label: 'Dashboard', icon: 'dashboard', to: '/' },
    { label: 'Livros', icon: 'menu_book', to: '/books' },
    { label: 'Leitores', icon: 'groups', to: '/readers' },
    { label: 'Empréstimos', icon: 'bookmark', to: '/loans' },
    { label: 'Devoluções', icon: 'assignment_return', to: '/returns' },
    { label: 'Relatórios', icon: 'assessment', to: '/reports' },
    { label: 'Perfil', icon: 'person', to: '/profile' }
  ],
  LEITOR: [
    { label: 'Dashboard', icon: 'dashboard', to: '/' },
    { label: 'Consultar livros', icon: 'menu_book', to: '/books' },
    { label: 'Meus empréstimos', icon: 'bookmark', to: '/loans' },
    { label: 'Minhas devoluções', icon: 'assignment_return', to: '/returns' },
    { label: 'Perfil', icon: 'person', to: '/profile' }
  ]
}
const navigationItems = computed(
  () => navigationByRole[currentUser.value?.nivel] ?? []
)

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  }
)

async function signOut() {
  await logout()
  await router.replace({ name: 'login' })
}
</script>
