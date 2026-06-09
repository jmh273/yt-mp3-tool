<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastHost from '@/components/ToastHost.vue'
import VideoPlayerModal from '@/components/VideoPlayerModal.vue'
</script>

<template>
  <RouterView />
  <VideoPlayerModal />
  <ToastHost />
</template>
