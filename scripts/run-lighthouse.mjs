import lighthouse from 'lighthouse';
import {launch} from 'chrome-launcher';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.QA_BASE_URL||'http://127.0.0.1:8787/';
const chrome=await launch({chromePath:chromium.executablePath(),chromeFlags:['--headless=new','--no-first-run','--disable-gpu']});
try{
 const result=await lighthouse(url,{port:chrome.port,output:'json',onlyCategories:['performance','accessibility','best-practices','seo'],logLevel:'error'});
 await mkdir('qa',{recursive:true});await mkdir('.cache',{recursive:true});
 await writeFile('.cache/lighthouse-full.json',result.report);
 const {lhr}=result;
 const summary={url:lhr.finalDisplayedUrl,run_at:lhr.fetchTime,environment:url.startsWith('https://')?'Public deployment, Lighthouse simulated mobile (not a physical 4G device)':'Local Wrangler, Lighthouse simulated mobile (not a live 4G measurement)',scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,Math.round(v.score*100)])),metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','speed-index','total-blocking-time','cumulative-layout-shift','interactive','total-byte-weight'].filter(k=>lhr.audits[k]).map(k=>[k,{value:lhr.audits[k].numericValue,display:lhr.audits[k].displayValue}])),failed:Object.entries(lhr.audits).filter(([,a])=>a.score!==null&&a.score<.9).map(([id,a])=>({id,title:a.title,display:a.displayValue}))};
 await writeFile(url.startsWith('https://')?'qa/lighthouse-live.json':'qa/lighthouse.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{await chrome.kill();}
