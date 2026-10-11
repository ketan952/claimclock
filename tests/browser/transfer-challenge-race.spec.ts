import {test,expect} from '@playwright/test';
import {selectPicker} from './picker-helpers';
import {mockTurnstileConfig} from './turnstile-helper';

// Always a local challenge/API mock, including when the separate live transfer
// round-trip suite is enabled. This test cannot consume production lookups.
test('case changes during a delayed challenge prevent transfer dispatch and allow an explicit retry',async({page,context})=>{
 await context.route('**/api/config',route=>route.fulfill({json:{ai_enabled:false,...mockTurnstileConfig}}));
 await page.addInitScript(()=>{
  const state=window as unknown as {pendingTransferAction:string;completeTransferChallenge:()=>void};
  let callback:(token:string)=>void=()=>{};state.pendingTransferAction='';
  window.turnstile={ready:done=>done(),render:(_container,options)=>{callback=options.callback;state.pendingTransferAction=options.action;return 'synthetic-delayed-transfer';},execute:()=>{},remove:()=>{state.pendingTransferAction='';}};
  state.completeTransferChallenge=()=>callback(`synthetic-${state.pendingTransferAction}`);
 });
 let creates=0,lookups=0;
 await context.route('**/api/transfers',route=>{creates++;expect(route.request().headers()['x-turnstile-token']).toBe('synthetic-transfer_create');return route.fulfill({status:201,json:{code:'ABCDEFGH',expires_at:'2026-10-18T00:00:00.000Z'}});});
 await context.route('**/api/transfers/lookup',route=>{lookups++;expect(route.request().headers()['x-turnstile-token']).toBe('synthetic-transfer_lookup');return route.fulfill({status:404,json:{error:'Synthetic transfer unavailable'}});});
 const pending=(action:string)=>page.waitForFunction(action=>(window as unknown as {pendingTransferAction:string}).pendingTransferAction===action,action);
 const complete=()=>page.evaluate(()=>(window as unknown as {completeTransferChallenge:()=>void}).completeTransferChallenge());
 const timeline={id:'synthetic-challenge-race',insurerId:'care',hospital:'Synthetic transfer race hospital',city:'Pune',requestType:'discharge',submittedAt:'2019-11-10T06:00:00.000Z',events:[]};
 await page.goto('/');await page.evaluate(timeline=>localStorage.setItem('claimclock:cases:v1',JSON.stringify({version:1,selectedId:timeline.id,cases:[{format:'claimclock-case',version:1,exportedAt:'2019-11-10T09:00:00.000Z',timeline,deductions:[]}]})),timeline);await page.reload();await page.locator('#transfer-panel > summary').click();

 await page.click('#transfer-create');await pending('transfer_create');await expect(page.locator('#transfer-create')).toBeDisabled();await page.click('#case-new');await complete();
 await expect(page.locator('#transfer-create')).toBeEnabled();await expect(page.locator('#transfer-status')).toHaveAttribute('data-i18n-message','transfer.caseChanged');await expect(page.locator('#transfer-created')).toBeHidden();expect(creates).toBe(0);
 await selectPicker(page,'#case-select',timeline.id);await page.click('#transfer-create');await pending('transfer_create');await complete();await expect(page.locator('#transfer-created')).toBeVisible();expect(creates).toBe(1);const link=await page.locator('#transfer-link').inputValue();

 await page.fill('#transfer-reference',link);await page.click('#transfer-receive');await pending('transfer_lookup');await expect(page.locator('#transfer-receive')).toBeDisabled();await page.click('#case-new');await complete();
 await expect(page.locator('#transfer-receive')).toBeEnabled();await expect(page.locator('#transfer-status')).toHaveAttribute('data-i18n-message','transfer.caseChanged');await expect(page.locator('#restore-dialog')).toBeHidden();await expect(page.locator('#transfer-link')).toHaveValue('');expect(lookups).toBe(0);
 await page.click('#transfer-receive');await pending('transfer_lookup');await complete();await expect(page.locator('#transfer-status')).toHaveAttribute('data-i18n-message','transfer.notFound');await expect(page.locator('#transfer-receive')).toBeEnabled();expect(lookups).toBe(1);
 const cases=await page.evaluate(()=>JSON.parse(localStorage.getItem('claimclock:cases:v1')!).cases);expect(cases).toHaveLength(1);expect(cases[0].timeline).toEqual(timeline);
});
