import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 注意：不要在这里补 build.rollupOptions.input。
// electron-vite 默认按约定解析入口（src/main/index.ts、src/preload/index.ts、src/renderer/index.html），
// 显式书写反而会踩到 electron-vite@5 的类型定义问题：它的 d.ts 从 'vite' 引入 BuildEnvironmentOptions，
// 而本项目用的是 vite@5（没有这个类型），skipLibCheck 掩盖解析失败后 MainBuildOptions 变成空接口，
// rollupOptions 会被判为未知属性。入口约定的正确性由 `npm run build` 的产物保证。
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } }
  },
  renderer: {
    resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
    plugins: [react()]
  }
})
