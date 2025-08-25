// Simple offline-first service worker for Friendsy Snake
const CACHE = "friendsy-snake-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))) 
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res=> res || fetch(req).then(netRes=>{
      // Cache new GET responses
      if(req.method === "GET"){
        const copy = netRes.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
      }
      return netRes;
    }).catch(()=> caches.match("./index.html")))
  );
});
