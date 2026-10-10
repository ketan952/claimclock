import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const failures=[];
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(/\.(?:ts|astro|mjs|json)$/.test(p))out.push(p);}return out;}
for(const path of [...await files('src'),...await files('worker'),...await files('templates')]){
 const text=await readFile(path,'utf8');
 if(/\t/.test(text))failures.push(`${path}: use spaces, not literal tabs`);
 if(/\beval\s*\(/.test(text))failures.push(`${path}: dynamic evaluation is prohibited`);
 if(path.startsWith('worker/')&&/console\.(?:log|debug|error|info|warn)\s*\(/.test(text))failures.push(`${path}: Worker logging must stay disabled`);
 if(/\.innerHTML\s*=|\.outerHTML\s*=/.test(text))failures.push(`${path}: use textContent or createElement for user-derived content`);
 if(path.endsWith('.astro')&&/<script\b[^>]*src=["']https?:/.test(text))failures.push(`${path}: third-party runtime script`);
}
const en=JSON.parse(await readFile('src/i18n/en.json','utf8')),hi=JSON.parse(await readFile('src/i18n/hi.json','utf8'));
for(const key of new Set([...Object.keys(en),...Object.keys(hi)]))if(!en[key]||!hi[key])failures.push(`Missing language value: ${key}`);
for(const path of await files('src')){const text=await readFile(path,'utf8');for(const match of text.matchAll(/data-i18n="([^"]+)"/g))if(!en[match[1]])failures.push(`${path}: unknown translation ${match[1]}`);}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('Source safety/style checks and bilingual key checks passed.');
