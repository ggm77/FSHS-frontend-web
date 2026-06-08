import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ALLOWED_SERVERS: Record<string, string> = {
  'fshs2.seohamin.com': 'https://fshs2.seohamin.com',
  'ggm77.iptime.org': 'http://ggm77.iptime.org',
};

const targetHost = process.env.API_HOST ?? 'fshs2.seohamin.com';
const targetOrigin = ALLOWED_SERVERS[targetHost];
if (!targetOrigin) {
  throw new Error(`API_HOST "${targetHost}" is not in the allowed server list: ${Object.keys(ALLOWED_SERVERS).join(', ')}`);
}

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['ggm77.iptime.org'],
    proxy: {
      '/api': {
        target: targetOrigin,
        changeOrigin: true,
        headers: {
          Origin: targetOrigin,
        },
        cookieDomainRewrite: '',
      },
    },
  },
})
