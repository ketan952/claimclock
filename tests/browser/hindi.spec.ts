import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import contacts from '../../data/contacts.json' with {type:'json'};
import rules from '../../data/rules.json' with {type:'json'};
test('Hindi mode has no English-only interface text on public core pages',async({page})=>{
 const allowed=[...contacts.map(c=>c.name),...rules.map(r=>r.quote),'ClaimClock','AGPL-3.0','CSV ↓','JSON ↓','Bima Bharosa ↗','e-Jagriti ↗','NL-48','AI','PDF','CSV','JSON','GRO','TPA','IRDAI','EN','IST'];
 const leaks:{route:string;text:string}[]=[];
 await page.addInitScript(()=>localStorage.setItem('claimclock:language','hi'));
 for(const route of ['/','/privacy/','/deductions/','/rejected/','/death/','/index/','/index/hdfc-ergo/','/methodology/','/about/','/offline/']){
  await page.goto(route);await expect(page.locator('html')).toHaveAttribute('lang','hi');
  const texts=await page.evaluate(()=>{
   const output:string[]=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const node=walker.currentNode,parent=node.parentElement,text=node.textContent?.trim()||'';
    if(!parent||!text||parent.closest('script,style,svg,pre,[data-primary-quote]')||!parent.getClientRects().length)continue;
    if(/[A-Za-z]{3}/.test(text)&&!/[\u0900-\u097f]/.test(text))output.push(text);
   }
   return output;
  });
  for(const text of new Set(texts))if(!allowed.includes(text)&&!/^https?:|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))leaks.push({route,text});
 }
 await writeFile('qa/hindi-leaks.json',JSON.stringify({checked_at:new Date().toISOString(),leaks},null,2)+'\n');
 expect(leaks).toEqual([]);
});
