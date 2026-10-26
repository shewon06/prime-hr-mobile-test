// PRIME HR NEXT LEVEL — Cloudflare Pages static build
// Publishes only approved public application assets into dist/.
// No HR schema, SQL migrations, server source, README, or credentials files.
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=dirname(fileURLToPath(import.meta.url));
const target=join(root,"dist");
const publicFiles=[
  "index.html",
  "employee.html",
  "app.js",
  "employee.js",
  "styles.css",
  "config.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];
const conf=await readFile(join(root,"config.js"),"utf8");
if(!conf.includes("https://qkhcojaouueypkgrzlov.supabase.co") || !conf.includes("sb_publishable_")){
 throw Error("Production Supabase public configuration is missing.");
}
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of publicFiles){
 const source=join(root,name);
 const file=await stat(source);
 if(!file.isFile())throw Error("Missing public asset "+name);
 await copyFile(source,join(target,name));
}
const headers=String.raw`/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
  X-Robots-Tag: noindex, nofollow, noarchive

/
  Cache-Control: no-cache, no-store, must-revalidate

/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/employee.html
  Cache-Control: no-cache, no-store, must-revalidate

/config.js
  Cache-Control: no-cache, no-store, must-revalidate

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate

/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: no-cache, must-revalidate

/app.js
  Cache-Control: no-cache, must-revalidate

/employee.js
  Cache-Control: no-cache, must-revalidate
`;
await writeFile(join(target,"_headers"),headers.trim()+"\n","utf8");
console.log("Cloudflare Pages release prepared: "+publicFiles.length+" public files + _headers in dist/");
