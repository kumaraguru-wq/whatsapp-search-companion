import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative assets allow the same build to work under a GitHub Pages
  // repository path such as /whatsapp-search-companion/.
  base: './',
  plugins: [react()],
})

