const SW_VERSION = 'v1.0.0';
const CACHE_STATIC = `conakry-static-${SW_VERSION}`;
const CACHE_TILES  = `conakry-tiles-${SW_VERSION}`;

const STATIC_FILES = ['./index.html','./manifest.json'];

const BOUNDS = { minLat:9.48, maxLat:9.65, minLng:-13.75, maxLng:-13.55 };
const ZOOM_LEVELS = [12,13,14,15];

function deg2tile(lat,lng,zoom){
  const n=Math.pow(2,zoom);
  const x=Math.floor((lng+180)/360*n);
  const latRad=lat*Math.PI/180;
  const y=Math.floor((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2*n);
  return{x,y};
}

function getTileUrls(){
  const urls=[];
  const subs=['a','b','c'];
  for(const z of ZOOM_LEVELS){
    const tl=deg2tile(BOUNDS.maxLat,BOUNDS.minLng,z);
    const br=deg2tile(BOUNDS.minLat,BOUNDS.maxLng,z);
    for(let x=tl.x;x<=br.x;x++){
      for(let y=tl.y;y<=br.y;y++){
        urls.push(`https://${subs[(x+y)%3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const staticCache=await caches.open(CACHE_STATIC);
    for(const url of STATIC_FILES){try{await staticCache.add(url);}catch(e){}}
    const tileCache=await caches.open(CACHE_TILES);
    const tileUrls=getTileUrls();
    const BATCH=10;
    for(let i=0;i<tileUrls.length;i+=BATCH){
      const batch=tileUrls.slice(i,i+BATCH);
      await Promise.allSettled(batch.map(async url=>{
        try{
          const cached=await tileCache.match(url);
          if(!cached){const r=await fetch(url);if(r.ok)await tileCache.put(url,r);}
        }catch(e){}
      }));
      const progress=Math.min(100,Math.round(((i+BATCH)/tileUrls.length)*100));
      const clients=await self.clients.matchAll();
      clients.forEach(c=>c.postMessage({type:'CACHE_PROGRESS',progress,current:Math.min(i+BATCH,tileUrls.length),total:tileUrls.length}));
    }
    const clients=await self.clients.matchAll();
    clients.forEach(c=>c.postMessage({type:'CACHE_COMPLETE'}));
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_STATIC&&k!==CACHE_TILES).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const url=event.request.url;
  if(url.includes('tile.openstreetmap.org')){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_TILES);
      const cached=await cache.match(event.request);
      if(cached)return cached;
      try{
        const r=await fetch(event.request);
        if(r.ok)await cache.put(event.request,r.clone());
        return r;
      }catch{
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#1a1a2e"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_STATIC);
    const cached=await cache.match(event.request);
    if(cached)return cached;
    try{const r=await fetch(event.request);if(r.ok)await cache.put(event.request,r.clone());return r;}
    catch{return new Response('Hors ligne',{status:503});}
  })());
});
