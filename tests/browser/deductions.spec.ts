import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixtures=JSON.parse(readFileSync('tests/fixtures/settlements.json','utf8')).fixtures;
function textPdf(lines:string[]){
 const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const content=`BT /F1 13 Tf 45 760 Td 20 TL ${lines.map((s,i)=>`${i?'T* ':''}(${esc(s)}) Tj`).join('\n')} ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
 let out='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);
}
test('ten synthetic settlements produce reviewed local classifications and letters without AI',async({page})=>{
 const external:string[]=[];page.on('request',r=>{if(r.url().startsWith('http')&&new URL(r.url()).origin!==new URL(process.env.QA_BASE_URL||'http://127.0.0.1:4322').origin)external.push(r.url());});
 for(const fixture of fixtures){
  await page.goto('/deductions/');await page.selectOption('#deduction-form [name=insurer]','hdfc-ergo');
  await page.fill('#deduction-lines',`${fixture.reviewed_deduction.description} | ${fixture.reviewed_deduction.amount}`);await page.check('#deduction-form [name=confirmed]');await page.click('#deduction-form button');
  if(fixture.reviewed_deduction.policyClause){await page.fill('#deduction-cards input:not([type=checkbox])',fixture.reviewed_deduction.policyClause);await page.locator('#deduction-cards input:not([type=checkbox])').blur();await page.check('#deduction-cards input[type=checkbox]');}
  await expect(page.locator('#deduction-cards')).toContainText(fixture.expected.status);
  await page.click('#reconsideration');await expect(page.locator('#letter-body')).toHaveValue(/17\(b\)/);await expect(page.locator('#letter-body')).toHaveValue(/within 14 days under the PPHI Master Circular/);await expect(page.locator('#letter-body')).not.toHaveValue(/ClaimClock|Ask for|challengeable|no reason given|CRC/);await page.click('#letter-close');
 }
 await page.click('#prepare-ai');await expect(page.locator('#ai-provider')).toContainText('AI is unavailable');await page.check('#ai-form [name=consent]');await page.click('#ai-form button');await expect(page.locator('#ai-status')).toContainText('letters still work');await expect(page.locator('#deduction-results')).toBeVisible();
 await page.screenshot({path:'qa/screenshots/mobile-deductions.png',fullPage:true});expect(external).toEqual([]);
});
test('text PDF extraction happens on-device',async({page})=>{
 await page.goto('/deductions/');await page.setInputFiles('#settlement-file',{name:'synthetic-settlement.pdf',mimeType:'application/pdf',buffer:textPdf(['SYNTHETIC SETTLEMENT - NOT A REAL CLAIM','Patient Name: Aditi Kulkarni','Non-medical consumables | 1500','Unexplained adjustment | 3250'])});
 await expect(page.locator('#extracted-text')).toHaveValue(/Non-medical consumables/, {timeout:30000});await expect(page.locator('#extracted-text')).toHaveValue(/3250/);
});
test('English photo OCR uses only self-hosted assets',async({page})=>{
 test.setTimeout(120000);const external:string[]=[];page.on('request',r=>{if(r.url().startsWith('http')&&new URL(r.url()).origin!==new URL(process.env.QA_BASE_URL||'http://127.0.0.1:4322').origin)external.push(r.url());});
 await page.goto('/deductions/');const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=650;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='42px Arial';['SYNTHETIC SETTLEMENT','Non-medical consumables: 1500','Co-payment deduction: 4000','Please review the policy clause.'].forEach((line,i)=>x.fillText(line,60,110+i*110));return c.toDataURL('image/png').split(',')[1];});
 await page.setInputFiles('#bill-file',{name:'synthetic-bill.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await expect(page.locator('#extracted-text')).toHaveValue(/consumables/i,{timeout:100000});await expect(page.locator('#extracted-text')).toHaveValue(/1500/);expect(external).toEqual([]);
});
