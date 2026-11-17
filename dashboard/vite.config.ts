import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// In dev, the UI runs on :5173 and proxies /api to the bot (pnpm run dev in
// the repo root serves the API on :3000; override with ROLLCALL_API).
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: process.env.ROLLCALL_API || 'http://localhost:3000', ws: true },
    },
  },
})
