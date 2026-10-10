import { defineConfig } from 'astro/config';
export default defineConfig({ output: 'static', build: { inlineStylesheets: 'never' }, vite: { build: { assetsInlineLimit: 0 } } });
