<template>
  <q-page class="q-pa-lg">
    <main>
      <div class="text-overline text-primary">BIBLIOTECA</div>
      <h1 class="text-h4 text-weight-medium q-mt-sm q-mb-sm">
        {{ route.meta.title }}
      </h1>
      <p class="text-body1 text-grey-7">
        Esta área será implementada numa próxima etapa.
      </p>
      <q-btn
        color="primary"
        icon="dashboard"
        label="Dashboard"
        to="/"
        no-caps
      />
    </main>
  </q-page>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>
