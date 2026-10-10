import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('public/data', {recursive:true});
for (const name of ['nl48.json','nl48.csv','contacts.json','rules.json','filings.json','consumables.json','schemas.json']) {
  try { await cp(`data/${name}`, `public/data/${name}`); } catch (e) { if(e.code !== 'ENOENT') throw e; }
}
// Heavy OCR assets are copied once installed and downloaded only when requested.
for (const [from,to] of [
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/vendor/pdf.worker.min.mjs'],
  ['node_modules/tesseract.js/dist/worker.min.js','public/vendor/tesseract/worker.min.js']
]) { try { await mkdir(to.slice(0,to.lastIndexOf('/')), {recursive:true}); await cp(from,to); } catch(e) { if(e.code !== 'ENOENT') throw e; } }
await mkdir('public/vendor/tesseract/lang',{recursive:true});
for(const variant of ['lstm','simd-lstm','relaxedsimd-lstm']) {
  await cp(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`,`public/vendor/tesseract/tesseract-core-${variant}.wasm.js`);
}
for(const [from,to] of [
 ['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt','public/vendor/tesseract/worker.min.js.LICENSE.txt'],
 ['node_modules/tesseract.js/LICENSE.md','public/vendor/tesseract/LICENSE-tesseract.txt'],
 ['node_modules/tesseract.js-core/LICENSE','public/vendor/tesseract/LICENSE-core.txt'],
 ['node_modules/pdfjs-dist/LICENSE','public/vendor/LICENSE-pdfjs.txt']
]) { try{await cp(from,to);}catch(e){if(e.code!=='ENOENT')throw e;} }
const asset=JSON.parse(await readFile('data/ocr-assets.json','utf8'));
let model;try{model=await readFile('.cache/eng.traineddata');}catch{
 const r=await fetch(asset.url);if(!r.ok)throw Error('Unable to download pinned English OCR model');model=Buffer.from(await r.arrayBuffer());
}
if(createHash('sha256').update(model).digest('hex')!==asset.sha256)throw Error('OCR model integrity mismatch');
await writeFile('public/vendor/tesseract/lang/eng.traineddata',model);
let modelLicense;try{modelLicense=await readFile('.cache/ocr-model-LICENSE');}catch{const r=await fetch(asset.license_url);if(!r.ok)throw Error('OCR model license unavailable');modelLicense=Buffer.from(await r.arrayBuffer());await mkdir('.cache',{recursive:true});await writeFile('.cache/ocr-model-LICENSE',modelLicense);}
await writeFile('public/vendor/tesseract/lang/LICENSE',modelLicense);
