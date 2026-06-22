---
layout: null
---
'use strict';
var CACHE    = 'oxbyte-{{ site.github.build_revision | default: site.time | date: "%Y%m%d" }}';
var PRECACHE = [
  '/',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/features/misc.js',
  '/assets/js/lib/theme.js',
  '/assets/js/features/device.js',
  '/assets/fonts/fonts.css',
  '/search.json',
  '/favicon.svg',
  '/offline.html'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;

  /* Static assets: stale-while-revalidate */
  if (/\.(css|js|woff2?|ttf|svg|webp|png|jpe?g|gif|ico)(\?.*)?$/.test(path)) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  /* Data files: network-first, cache fallback */
  if (/\.(json|xml)$/.test(path)) {
    e.respondWith(networkFirst(e.request, null));
    return;
  }

  /* HTML: network-first with offline.html fallback */
  if (e.request.headers.get('accept') && e.request.headers.get('accept').indexOf('text/html') !== -1) {
    e.respondWith(networkFirst(e.request, '/offline.html'));
    return;
  }
});

function staleWhileRevalidate(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networkFetch = fetch(request).then(function (res) {
        if (res.ok) cache.put(request, res.clone());
        return res;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    });
  });
}

function networkFirst(request, fallback) {
  return fetch(request).then(function (res) {
    if (res.ok) {
      var clone = res.clone();
      caches.open(CACHE).then(function (c) { c.put(request, clone); });
    }
    return res;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      if (fallback) return caches.match(fallback).then(function (fb) {
        return fb || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      });
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    });
  });
}
