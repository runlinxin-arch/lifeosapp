import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
    build: { rollupOptions: { input: { index: path.resolve(__dirname, 'src/main/index.ts') } } }
  },
  preload: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
    build: { rollupOptions: { input: { index: path.resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
    plugins: [react()],
    build: { rollupOptions: { input: path.resolve(__dirname, 'src/renderer/index.html') } }
  }
})
