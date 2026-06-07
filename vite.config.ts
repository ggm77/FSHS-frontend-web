import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://fshs2.seohamin.com',
        changeOrigin: true,
        headers: {
          Origin: 'https://fshs2.seohamin.com',
        },
        cookieDomainRewrite: '',
      },
    },
  },
})
