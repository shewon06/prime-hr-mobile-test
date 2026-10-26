// PRIME HR Mobile Install Test service worker.
// Network-first for HTML navigation avoids older installation screens after updates.
const CACHE="prime-hr-mobile-install-test-v2-20261026";
const CORE=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install", event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("prime-hr-mobile-install-test-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL("./",self.location.href).pathname))return;
  if(request.mode==="navigate"){
    event.respondWith(
      fetch(request).then(response=>{
        if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("./index.html",copy));}
        return response;
      }).catch(()=>caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
