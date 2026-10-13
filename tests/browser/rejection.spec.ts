import {selectPicker} from './picker-helpers';
import {test,expect} from '@playwright/test';
test('rejected claim form produces a source-linked bilingual GRO draft without submitting claim details',async({page})=>{
 const posts:string[]=[];const leaks:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());if(new URL(r.url()).searchParams.has('ground'))leaks.push(r.url());});
 let releaseModule!:()=>void;const moduleGate=new Promise<void>(resolve=>{releaseModule=resolve;});
 await page.route('**/_astro/rejected.*.js',async route=>{await moduleGate;await route.continue();});
 await page.goto('/deductions/');const navigation=page.click('a[href="/rejected/"]');
 try {await expect(page.locator('#rejection-form button[type=submit]')).toBeDisabled();}
 finally {releaseModule();}
 await navigation;await expect(page.locator('#rejection-form button[type=submit]')).toBeEnabled();await expect(page.locator('h1')).toContainText('rejected claim');
 await selectPicker(page,'[name=insurer]','hdfc-ergo');await page.fill('[name=rejectedOn]','2026-10-01');await page.fill('[name=ground]','Waiting period exclusion');await page.click('#rejection-form button[type=submit]');
 await expect(page.locator('#letter-body')).toHaveValue(/Waiting period exclusion/);await expect(page.locator('#letter-body')).toHaveValue(/17\(a\)/);await expect(page.locator('#letter-email')).toHaveAttribute('href',/^mailto:[^?]+\?/);await page.click('#letter-close');
 await page.click('[data-language=hi]');await page.click('#rejection-form button[type=submit]');await expect(page.locator('#letter-body')).toHaveValue(/14 दिनों/);await page.click('#letter-close');
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(posts).toEqual([]);expect(leaks).toEqual([]);expect(new URL(page.url()).search).toBe('');
});

test('rejection category, 60-month moratorium, doctor note, reimbursement checklist, two-policies coordination and Ombudsman draft work in both languages',async({page})=>{
 await page.goto('/rejected/');
 await selectPicker(page,'[name=insurer]','star-health');
 await page.fill('[name=rejectedOn]','2026-10-01');
 await page.fill('[name=ground]','Claim repudiated for alleged non-disclosure of hypertension prior to policy inception.');
 await expect(page.locator('[name=category]')).toHaveValue('non-disclosure');
 await page.check('[name=moratorium60Months]');
 await page.click('#rejection-form button[type=submit]');
 await expect(page.locator('#letter-body')).toHaveValue(/60 months of continuous coverage/);
 await expect(page.locator('#letter-body')).toHaveValue(/proposal form, underwriting records/);
 await page.click('#letter-close');

 // Doctor's justification note template
 await page.click('#prepare-doctor-note');
 await expect(page.locator('#letter-body')).toHaveValue(/Why inpatient admission was medically necessary/);
 await page.click('#letter-close');

 // Reimbursement 7-paper checklist & hospital desk request
 await page.locator('#reimbursement-details > summary').click();
 await page.check('[data-reimb-item="icp"]');
 await page.click('#prepare-reimbursement-desk');
 await expect(page.locator('#letter-body')).toHaveValue(/Indoor Case Papers/);
 await page.click('#letter-close');

 // Two policies (Corporate + Personal) balance coordination letter
 await page.locator('#two-policies-details > summary').click();
 await page.selectOption('#two-policies-form [name=primaryInsurer]','ICICI Lombard General');
 await page.selectOption('#two-policies-form [name=secondaryInsurer]','star-health');
 await page.fill('#two-policies-form [name=balanceAmount]','45000');
 await page.click('#two-policies-form button[type=submit]');
 await expect(page.locator('#letter-body')).toHaveValue(/45,000/);
 await expect(page.locator('#letter-body')).toHaveValue(/18\(a\)/);
 await page.click('#letter-close');

 // Insurance Ombudsman eligibility check & complaint summary
 await page.locator('#ombudsman-details > summary').click();
 await expect(page.locator('#ombudsman-form [name=ombudsmanInsurer]')).toHaveValue('star-health');
 await page.fill('#ombudsman-form [name=groDate]','2026-09-15');
 await page.fill('#ombudsman-form [name=replyDate]','2026-10-01');
 await page.fill('#ombudsman-form [name=amount]','125000');
 await page.click('#ombudsman-check-btn');
 await expect(page.locator('#ombudsman-check-status')).toContainText('Eligible on timing and amount');
 await page.click('#ombudsman-draft-btn');
 await expect(page.locator('#letter-body')).toHaveValue(/1,25,000/);
 await expect(page.locator('#letter-ombudsman-portal')).toBeVisible();
 await expect(page.locator('#letter-email')).toBeHidden();
 await page.click('#letter-close');

 // Checklist persistence across reload
 await page.reload();
 await page.locator('#reimbursement-details > summary').click();
 await expect(page.locator('[data-reimb-item="icp"]')).toBeChecked();
});
