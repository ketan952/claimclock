import { generateSW } from 'workbox-build';
await generateSW({
  globDirectory:'dist', globPatterns:['**/*.{html,js,css,json,svg,webmanifest}'],
  globIgnores:['vendor/**','_astro/pdf.*','_astro/extract.*','_astro/preprocess.worker-*','_astro/src.*'], swDest:'dist/sw.js', clientsClaim:true, skipWaiting:true,
  navigateFallback:'/offline/index.html',
  runtimeCaching:[{ urlPattern: /\/(?:vendor\/|_astro\/(?:pdf\.|extract\.|preprocess\.worker-|src\.))/, handler:'CacheFirst', options:{cacheName:'claimclock-local-tools-v1',expiration:{maxEntries:20}} }],
  maximumFileSizeToCacheInBytes:2*1024*1024
});
