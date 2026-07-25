import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = path.join(root, 'data');

/**
 * O dataset canônico vive em /data na raiz do repositório porque quem escreve nele é o
 * coletor (GitHub Actions), não o front-end. Este plugin serve esses arquivos em /data
 * durante o `vite dev` e os copia para dentro do build na publicação.
 */
function repoData(): Plugin {
  return {
    name: 'ilhabela-repo-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/data/')) return next();
        const file = path.join(dataDir, url.slice('/data/'.length));
        if (!file.startsWith(dataDir) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = path.join(root, 'ilhabela', 'data');
      mkdirSync(out, { recursive: true });
      cpSync(dataDir, out, { recursive: true });
    },
  };
}

export default defineConfig({
  root: path.join(root, 'app'),
  // Caminho relativo: o mesmo build funciona em thutav.github.io/Thuan-dojo/ilhabela/,
  // em subpasta qualquer ou aberto de um servidor local.
  base: './',
  publicDir: path.join(root, 'app', 'public'),
  resolve: {
    alias: { '@core': path.join(root, 'core') },
  },
  build: {
    outDir: path.join(root, 'ilhabela'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  plugins: [react(), repoData()],
});
