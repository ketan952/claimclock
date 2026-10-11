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
