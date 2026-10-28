import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { fs: { deny: ['.env', '.env.*', '**/.git/**', '**/runtime/**', '**/tests/**', '**/evidence/**', '**/docs/**', '**/src/server/**', '**/scripts/**', '**/dist/server/**', '**/*.{key,pem,p12,pfx}', '**/*.sqlite*', '**/*.db*'] } },
  build: { outDir: 'dist/client', emptyOutDir: true },
});
