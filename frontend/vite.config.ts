/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const backendUrl = process.env.PHYSICS_LAB_BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The backend is optional: simulations run entirely in the browser.
    // Only persistence calls go through this proxy.
    proxy: { '/api': { target: backendUrl, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: backendUrl, changeOrigin: true } },
  },
  test: {
    globals: true,
    // Physics and utility tests run in plain Node (fast, no DOM).
    // Component tests opt in with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
