import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base: the same build runs on GitHub Pages and as a claude.ai artifact
// (where files are served next to the page).
export default defineConfig({
  base: './',
  plugins: [react()],
})
