import {test,expect} from '@playwright/test';
import {installMockTurnstile} from './turnstile-helper';
test.use({trace:'off'});
const key='claimclock:receipts:v1';
const a={id:'00000000-0000-4000-8000-000000000001',erase_token:'a'.repeat(64),caseId:'case-a'};
const b={id:'00000000-0000-4000-8000-000000000002',erase_token:'b'.repeat(64),caseId:'case-b'};
const code=(value:typeof a)=>`${value.id}:${value.erase_token}`;
const registry={version:1,receipts:{[a.id]:a,[b.id]:b}};
test('Privacy picker copies either receipt and manual erasure of old A preserves newer B',async({page,context})=>{
 await page.addInitScript(({key,registry})=>localStorage.setItem(key,JSON.stringify(registry)),{key,registry});
 let confirmed=false;
 await page.route('**/api/reports/*',route=>{expect(route.request().method()).toBe('DELETE');expect(route.request().url()).toContain(a.id);expect(route.request().postDataJSON()).toEqual({erase_token:a.erase_token});return route.fulfill({json:{erased:confirmed}});});
 await page.goto('/privacy/');await expect(page.locator('#saved-receipt option')).toHaveCount(3);await expect(page.locator('[name=code]')).toHaveValue(code(b));
 await page.selectOption('#saved-receipt',a.id);await expect(page.locator('[name=code]')).toHaveValue(code(a));await context.grantPermissions(['clipboard-read','clipboard-write']);await page.click('#copy-saved-receipt');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(code(a));
 await page.fill('[name=code]',code(a));await expect(page.locator('#saved-receipt')).toHaveValue('');await page.click('#erase-report button[type=submit]');await expect(page.locator('#erase-status')).toContainText('not confirmed');
 expect(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).receipts),key)).toEqual([a.id,b.id]);
 confirmed=true;await page.click('#erase-report button[type=submit]');await expect(page.locator('#erase-status')).toHaveText('Report erased.');await expect(page.locator('#saved-receipt option')).toHaveCount(2);
 expect(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).receipts),key)).toEqual([b.id]);
 await page.selectOption('#saved-receipt',b.id);await expect(page.locator('[name=code]')).toHaveValue(code(b));await page.click('[data-language=hi]');await expect(page.locator('#saved-receipt')).toHaveValue(b.id);await expect(page.locator('[name=code]')).toHaveValue(code(b));await expect(page.locator('label:has(#saved-receipt)')).toContainText('सहेजे गए');
});
test('erasure response for A does not clear B selected while the request waits',async({page})=>{
 await page.addInitScript(({key,registry})=>localStorage.setItem(key,JSON.stringify(registry)),{key,registry});
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});let started=false;
 await page.route('**/api/reports/*',async route=>{started=true;await wait;await route.fulfill({json:{erased:true}});});
 await page.goto('/privacy/');await page.selectOption('#saved-receipt',a.id);await page.click('#erase-report button[type=submit]');await expect.poll(()=>started).toBe(true);await page.selectOption('#saved-receipt',b.id);release();
 await expect(page.locator('#erase-status')).toHaveText('Report erased.');await expect(page.locator('[name=code]')).toHaveValue(code(b));await expect(page.locator('#saved-receipt')).toHaveValue(b.id);
 expect(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).receipts),key)).toEqual([b.id]);
});
test('corrupt receipt data survives manual erasure with an honest local-storage warning',async({page})=>{
 const corrupt=' {broken receipts';await page.addInitScript(({key,corrupt})=>localStorage.setItem(key,corrupt),{key,corrupt});
 await page.route('**/api/reports/*',route=>route.fulfill({json:{erased:true}}));await page.goto('/privacy/');await expect(page.locator('#receipt-warning')).toContainText('Existing data has been kept');
 await page.fill('[name=code]',code(a));await page.click('#erase-report button[type=submit]');await expect(page.locator('#erase-status')).toContainText('Report erased. This device could not update');expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(corrupt);
});
test('a failed receipt write keeps prior B and still displays new A for private copying',async({page})=>{
 await installMockTurnstile(page);await page.addInitScript(({key,b})=>{localStorage.setItem(key,JSON.stringify({version:1,receipts:{[b.id]:b}}));const setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Synthetic full storage','QuotaExceededError');return setItem.call(this,name,value);};},{key,b});
 await page.route('**/api/reports',route=>route.fulfill({status:201,json:{id:a.id,erase_token:a.erase_token}}));
 await page.goto('/');await page.selectOption('#start-form [name=insurer]','care');await page.click('#start-form button[type=submit]');await page.click('#finish-form button');await page.check('#optin-form [name=consent]');await page.click('#optin-form button');
 await expect(page.locator('#deletion-code')).toHaveValue(code(a));await expect(page.locator('#deletion-saved')).toContainText('not save');expect(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)!).receipts),key)).toEqual([b.id]);
});
