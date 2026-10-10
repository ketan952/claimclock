import {clientsClaim} from 'workbox-core';
import {precacheAndRoute,matchPrecache,cleanupOutdatedCaches} from 'workbox-precaching';
import {registerRoute,NavigationRoute} from 'workbox-routing';
import {NetworkFirst,NetworkOnly,CacheFirst} from 'workbox-strategies';
import {ExpirationPlugin} from 'workbox-expiration';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
const navigationCache=`claimclock-pages-${__BUILD_ID__}`;
// Remember only caches that predate this activation. A superseded worker's
// late request must never delete a newer worker's cache.
let obsoleteNavigationCaches=[];
async function cleanupNavigationCaches(){await Promise.all(obsoleteNavigationCaches.map(key=>caches.delete(key)));}
async function precachedPage(request){
 const path=new URL(request.url).pathname;
 return (await matchPrecache(path)) || (await matchPrecache(path.endsWith('/')?`${path}index.html`:`${path}/index.html`)) || (await matchPrecache(`${path}.html`));
}
// API and source URLs fall through to the browser network: they are neither
// navigation routes nor precache entries. Query navigations must bypass the
// precache route below, whose asset matching ignores all parameters.
registerRoute(({url,request})=>url.origin===self.location.origin&&request.mode==='navigate'&&url.search!==''&&!/^\/(?:api|s)(?:\/|$)/.test(url.pathname),new NetworkOnly());
registerRoute(new NavigationRoute(new NetworkFirst({
 cacheName:navigationCache,networkTimeoutSeconds:3,
 plugins:[{
  async handlerDidComplete(){await cleanupNavigationCaches();},
  async cachedResponseWillBeUsed({request,cachedResponse}){
   if(cachedResponse)return cachedResponse;
   return precachedPage(request);
  },
  async handlerDidError({request}){
   // This hook runs only after an actual network error (not a 404 or a slow response).
   return (await precachedPage(request)) || (await matchPrecache('/offline/index.html')); 
  }
 }]
}),{denylist:[/^\/(?:api|s)(?:\/|$)/,/\?/]}));
// Precached hashed JS/CSS uses Workbox's cache-first precache strategy.
precacheAndRoute(self.__WB_MANIFEST,{ignoreURLParametersMatching:[/.*/]});
registerRoute(({url})=>url.origin===self.location.origin&&/^\/(?:vendor|_astro)\//.test(url.pathname),new CacheFirst({cacheName:'claimclock-local-tools-v1',plugins:[new ExpirationPlugin({maxEntries:30})]}));
self.addEventListener('activate',event=>event.waitUntil((async()=>{obsoleteNavigationCaches=(await caches.keys()).filter(key=>key.startsWith('claimclock-pages-')&&key!==navigationCache);await cleanupNavigationCaches();})()));
// Public version handshake lets the update probe wait for the controller that
// will actually serve the next navigation, not just registration activation.
self.addEventListener('message',event=>{if(event.data==='CLAIMCLOCK_BUILD')event.ports[0]?.postMessage(__BUILD_ID__);});
