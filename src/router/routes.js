const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue')
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/pages/DashboardPage.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'books',
        name: 'books',
        component: () => import('@/pages/BooksPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO', 'LEITOR']
        }
      },
      {
        path: 'loans',
        name: 'loans',
        component: () => import('@/pages/LoansPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO', 'LEITOR']
        }
      },
      {
        path: 'returns',
        name: 'returns',
        component: () => import('@/pages/LoansPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO', 'LEITOR']
        }
      },
      {
        path: 'readers',
        name: 'readers',
        component: () => import('@/pages/ReadersPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO'],
          title: 'Leitores'
        }
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/pages/UsersPage.vue'),
        meta: { requiresAuth: true, roles: ['ADMIN'], title: 'Utilizadores' }
      },
      {
        path: 'reports',
        name: 'reports',
        component: () => import('@/pages/ReportsPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO'],
          title: 'Relatórios'
        }
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/pages/SectionPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'BIBLIOTECARIO', 'LEITOR'],
          title: 'Perfil'
        }
      }
    ]
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue')
  }
]

export default routes
