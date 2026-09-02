import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { createRequire } from 'node:module';

// バージョンの正は package.json の1箇所だけ。ビルド時に定数へ置き換えるので、
// Workers上でJSONを読み込む必要がない。
const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [
      vinext(),
      // Bindings (D1, etc.) come from wrangler.toml; only the dev/build entry
      // point is overridden here, since dist/server/index.js doesn't exist yet
      // when Vite resolves this config.
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        // vinextのハンドラを worker/index.ts で包んで、セキュリティヘッダを付けている。
        config: { main: 'worker/index.ts' },
      }),
    ],
  };
});
