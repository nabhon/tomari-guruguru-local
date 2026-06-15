import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join, normalize } from 'path';
import fs from 'node:fs';

// dev サーバー専用: プロジェクト直下の characters/ を走査して一覧と画像を配信する。
// これにより exe をビルドしなくても `npm run dev` でキャラ切替を試せる。
// build / Pages には一切影響しない（静的ホストはフォルダ走査不可）。
function devCharactersPlugin() {
  const root = import.meta.dirname;
  const dir = join(root, 'characters');
  return {
    name: 'dev-characters',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url === '/__characters' || url.startsWith('/__characters?')) {
          let names = [];
          try {
            names = fs.readdirSync(dir, { withFileTypes: true })
              .filter((e) => e.isDirectory() && fs.existsSync(join(dir, e.name, 'A')))
              .map((e) => e.name);
          } catch { /* characters/ 無し → 空 */ }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(names));
          return;
        }
        if (url.startsWith('/characters/')) {
          const rel = decodeURIComponent(url.split('?')[0].slice('/characters/'.length));
          const file = normalize(join(dir, rel));
          if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.statusCode = 404; res.end(); return;
          }
          res.setHeader('Content-Type', 'image/webp');
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  // mode 'electron' → 相対パス（file:// で動かすデスクトップ版）
  // 通常の build → GitHub Pages のベースパス / dev → ルート
  base: mode === 'electron' ? './' : command === 'build' ? '/tomari-guruguru/' : '/',
  plugins: [react(), devCharactersPlugin()],
  server: {
    host: '127.0.0.1',
    open: '/talk.html',
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        talk: resolve(import.meta.dirname, 'talk.html'),
      },
    },
  },
}));
