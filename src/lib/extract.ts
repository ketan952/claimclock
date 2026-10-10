import {t} from './i18n';
const extractionError=(key:string)=>Object.assign(Error(t(key)),{translationKey:key});
async function preprocess(blob:Blob):Promise<Blob>{
 const worker=new Worker(new URL('./preprocess.worker.ts',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{worker.terminate();reject(extractionError('extract.timeout'));},30000);worker.onmessage=(e:MessageEvent<{blob?:Blob;error?:string}>)=>{clearTimeout(timeout);worker.terminate();if(e.data.blob)resolve(e.data.blob);else reject(extractionError('extract.unavailable'));};worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(extractionError('extract.unavailable'));};worker.postMessage({blob});});
}
export async function extractFile(file:File,onProgress:(key:string,fields?:Record<string,string|number>)=>void):Promise<string>{
 if(file.size>20*1024*1024)throw extractionError('extract.size');
 let ocr:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|null=null;
 async function recognize(blob:Blob){
  onProgress('extract.preparing');
  const image=await preprocess(blob);
  if(!ocr){const {createWorker}=await import('tesseract.js');ocr=await createWorker('eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract',langPath:'/vendor/tesseract/lang',gzip:false,workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')onProgress('extract.readingProgress',{percent:Math.round(m.progress*100)});}});}
  const result=await ocr.recognize(image);return result.data.text;
 }
 try{
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
   const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
   const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,disableFontFace:true,disableAutoFetch:true});const doc=await task.promise;
   try{
    if(doc.numPages>20)throw extractionError('extract.tooManyPages');
    const out:string[]=[];
    for(let n=1;n<=doc.numPages;n++){
     onProgress('extract.page',{page:n,total:doc.numPages});const page=await doc.getPage(n),content=await page.getTextContent();
     let text='';for(const item of content.items)if('str' in item)text+=item.str+('hasEOL' in item&&item.hasEOL?'\n':' ');
     if(text.trim().length<20){const viewport=page.getViewport({scale:1.6});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvas,viewport}).promise;const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(extractionError('extract.renderFailed'))));text=await recognize(blob);canvas.width=canvas.height=0;}
     out.push(`--- ${file.name}: ${t('extract.pageLabel')} ${n} ---\n${text}`);page.cleanup();
    }
    return out.join('\n\n');
   }finally{await task.destroy();}
  }
  if(file.type.startsWith('image/'))return await recognize(file);
  throw extractionError('extract.format');
 }finally{if(ocr)await (ocr as {terminate:()=>Promise<unknown>}).terminate();}
}
