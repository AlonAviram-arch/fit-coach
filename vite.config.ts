import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/fit-coach/ on GitHub Pages
// (dev and preview use the same base path).
export default defineConfig({
  base: '/fit-coach/',
  plugins: [react()],
})
