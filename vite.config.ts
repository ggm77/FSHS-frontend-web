import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발(dev/preview) 서버 전용 API 프록시 대상.
// 프로덕션은 nginx가 같은 origin에서 /api를 백엔드로 넘기므로 이 설정을 쓰지 않는다.
const ALLOWED_SERVERS: Record<string, string> = {
  'fshs.seohamin.com': 'https://fshs.seohamin.com',
  'fshs2.seohamin.com': 'https://fshs2.seohamin.com',
  'ggm77.iptime.org': 'http://ggm77.iptime.org',
};

export default defineConfig(({ command }) => {
  // build 시에는 프록시가 필요 없으므로 검사/설정을 건너뛴다.
  if (command === 'build') {
    return { plugins: [react()] };
  }

  const targetHost = process.env.API_HOST ?? 'fshs.seohamin.com';
  const targetOrigin = ALLOWED_SERVERS[targetHost];
  if (!targetOrigin) {
    throw new Error(`API_HOST "${targetHost}" is not in the allowed server list: ${Object.keys(ALLOWED_SERVERS).join(', ')}`);
  }

  return {
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
  };
})
