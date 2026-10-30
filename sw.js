"use strict";

// Çevrimdışı çalışma (PWA). SÜRÜM, index.html içindeki ?v= numarasıyla aynı olmalı;
// her yeni sürümde ikisi birlikte artırılır (testle denetlenir).
const SURUM = "5.2";
const ONBELLEK = `manyetik-his-v${SURUM}`;
const DOSYALAR = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  `./style.css?v=${SURUM}`,
  `./cards.js?v=${SURUM}`,
  `./vendor/supabase.js?v=${SURUM}`,
  `./ses.js?v=${SURUM}`,
  `./script.js?v=${SURUM}`,
  `./settings.js?v=${SURUM}`,
  `./yardim.js?v=${SURUM}`,
  `./online.js?v=${SURUM}`,
  `./pwa.js?v=${SURUM}`,
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim()));
});

// Önce ağ (her zaman güncel sürüm), internet yoksa önbellek.
// Yalnızca bu sitenin dosyaları: Supabase istekleri (başka alan adı) olduğu gibi geçer.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const kopya = res.clone();
          caches.open(ONBELLEK).then((c) => c.put(req, kopya));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((r) =>
          r || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
