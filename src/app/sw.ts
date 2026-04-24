/// <reference lib="webworker" />
/**
 * Service Worker Point RH — basé sur Serwist.
 *
 * Stratégie de cache (RGPD-conscient) :
 * - Assets statiques (JS / CSS / fonts / images)       → StaleWhileRevalidate
 * - Pages HTML (navigations GET)                       → NetworkFirst + fallback /offline
 * - Routes API (/api/*)                                → NetworkOnly (aucun cache)
 * - Server Actions / POST / autres mutations          → NetworkOnly
 *
 * Aucune donnée RH personnelle (Prisma JSON, sessions, agents…) n'est persistée
 * dans le cache du service worker.
 */
import {
  Serwist,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  runtimeCaching: [
    // 1. API → jamais mis en cache (RH sensible)
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },

    // 2. Navigations HTML → NetworkFirst, fallback offline
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [
          {
            handlerDidError: async () => {
              const cache = await caches.open("pages");
              return (
                (await cache.match(OFFLINE_URL)) ??
                new Response("Hors ligne", {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                })
              );
            },
          },
        ],
      }),
    },

    // 3. Scripts / styles (dont _next/static) → StaleWhileRevalidate
    {
      matcher: ({ request }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "worker",
      handler: new StaleWhileRevalidate({ cacheName: "assets-js-css" }),
    },

    // 4. Polices → StaleWhileRevalidate longue durée
    {
      matcher: ({ request }) => request.destination === "font",
      handler: new StaleWhileRevalidate({ cacheName: "fonts" }),
    },

    // 5. Images locales (icônes, logos) → StaleWhileRevalidate
    {
      matcher: ({ request, url }) =>
        request.destination === "image" && url.origin === self.location.origin,
      handler: new StaleWhileRevalidate({ cacheName: "images" }),
    },

    // 6. Reste → réseau uniquement (prudence par défaut)
    {
      matcher: () => true,
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
