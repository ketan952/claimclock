import {selectPicker} from './picker-helpers';
import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import contacts from '../../data/contacts.json' with {type:'json'};
import rules from '../../data/rules.json' with {type:'json'};
import rows from '../../data/nl48.json' with {type:'json'};
import plans from '../../data/plans.json' with {type:'json'};
import en from '../../src/i18n/en.json' with {type:'json'};
import hi from '../../src/i18n/hi.json' with {type:'json'};
const normalize=(s:string)=>s.replace(/[“”"↗]/g,'').replace(/\s+/g,' ').trim();
const properNames=[...contacts.map(c=>c.name),...plans.map(p=>p.name),'English',...rows.map(r=>r.tpa).filter(s=>!/^In-house|^Combined |^Consolidated /.test(s)),'ClaimClock Voice','ClaimClock','Ketan Gautam','Bima Bharosa','e-Jagriti','WhatsApp','Cloudflare Worker','Cloudflare D1','Cloudflare','Turnstile','AGPL-3.0','Product Management Committee','Claims Review Committee','Medi Assist','MDIndia','Paramount','Health360','Genins','LINK-K','FHPL','Heritage','Health Insurance TPA of India','Park','Volo','Vidal','Reliance General','JavaScript','Azure','ackoassets.com'];
const sourceTexts=new Set(rules.flatMap(r=>[r.quote,r.paragraph]).map(normalize));
const remainingEnglish=(text:string)=>{
 if(sourceTexts.has(normalize(text)))return '';
 let remaining=text.replace(/https?:\/\/\S+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\/s\/[a-z0-9-]+|\brules\.json\b|\.ics\b|\.txt\b/g,'');
 for(const name of [...properNames].sort((a,b)=>b.length-a.length))remaining=remaining.split(name).join('');
 remaining=remaining.replace(/\b(?:NL-48|CSV|JSON|GRO|TPA|IRDAI|IIB|GST|CGHS|RBI|NABH|NABL|III|EN|IST|AI|OCR|PDF|PNG|JPEG|DPDP|API|IP|UHID|CIS|PIN|OPD|OT|MC|ICU|HTTP|HTTPS|MB|SHA256|FY\d{4}|D1)\b/g,'');
 return remaining.match(/[A-Za-z]{3,}(?:[ -]+[A-Za-z]{3,})*/g)?.join(' ')||'';
};
test('Hindi mode translates visible interface text and accessible labels without broad chrome exemptions',async({page})=>{
 expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
 const leaks:{route:string;text:string;remaining:string}[]=[];
 await page.addInitScript(()=>localStorage.setItem('claimclock:language','hi'));
 const routes=['/','/404.html','/privacy/','/deductions/','/rejected/','/death/','/index/','/methodology/','/about/','/offline/','/vault/','/check-coverage/','/compare/','/renewal/','/reimbursement/',...contacts.filter(c=>c.kind==='insurer').map(c=>`/index/${c.id}/`)];
 for(const route of routes){
  await page.goto(route);await expect(page.locator('html')).toHaveAttribute('lang','hi');await page.locator('details').evaluateAll(nodes=>nodes.forEach(node=>(node as HTMLDetailsElement).open=true));
  const texts=await page.evaluate(()=>{
   const output:string[]=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const node=walker.currentNode,parent=node.parentElement,text=node.textContent?.trim()||'';
    if(!parent||!text||parent.closest('script,style,svg,textarea')||!parent.getClientRects().length)continue;
    if(/[A-Za-z]{3}/.test(text))output.push(parent.closest('.brand')?.textContent||text);
   }
   for(const node of document.querySelectorAll<HTMLElement>('[aria-label],[placeholder],[title]'))if(node.getClientRects().length)for(const attr of ['aria-label','placeholder','title']){const text=node.getAttribute(attr);if(text)output.push(text);}
   return output;
  });
  for(const text of new Set(texts)){const remaining=remainingEnglish(text);if(remaining)leaks.push({route,text,remaining});}
 }
 await writeFile('qa/hindi-leaks.json',JSON.stringify({checked_at:new Date().toISOString(),leaks},null,2)+'\n');
 expect(leaks).toEqual([]);
});
test('Hindi dialog regenerates subject and body and uses full month names',async({page})=>{
 await page.goto('/rejected/');await selectPicker(page,'[name=insurer]','hdfc-ergo');await page.fill('[name=rejectedOn]','2026-10-01');await page.fill('[name=ground]','Policy waiting period');await page.click('#rejection-form button[type=submit]');
 await expect(page.locator('#letter-subject')).toContainText('Formal grievance');
 // The language switch is behind the modal, so invoke its real click handler through the DOM.
 await page.locator('[data-language=hi]').evaluate((el:HTMLElement)=>el.click());
 await expect(page.locator('#letter-subject')).toContainText('औपचारिक शिकायत');await expect(page.locator('#letter-body')).toHaveValue(/1 अक्टूबर 2026/);await expect(page.locator('#letter-body')).toHaveValue(/14 दिनों/);await expect(page.locator('#letter-body')).not.toHaveValue(/I request reconsideration/);
 await page.locator('[data-language=en]').evaluate((el:HTMLElement)=>el.click());await expect(page.locator('#letter-body')).toHaveValue(/I request reconsideration/);
});
