import {selectPicker} from './picker-helpers';
import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('mobile English, clock lock, events, Hindi and source-linked GRO message',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('#intro h1')).toHaveText('A clock on your side.');
 await mkdir('qa/screenshots',{recursive:true});await page.screenshot({path:'qa/screenshots/mobile-home.png',fullPage:true});
 await selectPicker(page,'[name=insurer]','hdfc-ergo');await page.fill('[name=hospital]','Example Hospital');await page.fill('[name=city]','Pune');
 const past=new Date(Date.now()-4*3600000);const local=new Date(past.getTime()-past.getTimezoneOffset()*60000).toISOString().slice(0,16);await page.fill('[name=submittedAt]',local);await page.click('#start-form button[type=submit]');
 await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#clock-label')).toHaveText("Recorded wait beyond the rule’s window");
 await page.click('[data-letter=lock]');await expect(page.locator('#letter-body')).toHaveValue(/exact date and time/);await expect(page.locator('#letter-body')).toHaveValue(/Example Hospital/);await page.click('#letter-close');
 await page.fill('#event-form [name=note]','Desk confirmed request ID in writing');await page.click('#event-form button');await expect(page.locator('#timeline-list')).toContainText('Desk confirmed');
 await page.click('[data-letter=gro]');await expect(page.locator('#letter-body')).toHaveValue(/16\(a\)/);await expect(page.locator('#letter-body')).toHaveValue(/https:\/\/claimclock.ketan952.workers.dev\/s\/health-mc-2024/);await page.click('#letter-close');
 await page.screenshot({path:'qa/screenshots/mobile-clock.png',fullPage:true});
 await page.click('[data-language=hi]');await expect(page.locator('#clock-label')).toHaveText('दर्ज इंतज़ार नियम की समय-सीमा से आगे');await page.click('[data-letter=lock]');await expect(page.locator('#letter-body')).toHaveValue(/लिखित रूप/);await page.screenshot({path:'qa/screenshots/hindi-letter.png',fullPage:true});await page.click('#letter-close');await page.reload();await expect(page.locator('#dashboard')).toBeVisible();expect(errors).toEqual([]);
});
test('ten insurers have source-backed contacts and correct preauthorisation paragraphs',async({page})=>{
 for(const id of ['national','new-india','united-india','hdfc-ergo','icici-lombard','bajaj','star-health','care','niva-bupa','manipalcigna']){
  await page.goto('/');await page.evaluate(()=>localStorage.removeItem('claimclock:cases:v1'));await page.reload();await selectPicker(page,'[name=insurer]',id);await page.selectOption('[name=requestType]','preauth');await page.click('#start-form button[type=submit]');
  expect(await page.locator('#contacts a[href^="mailto:"]').count()).toBeGreaterThan(0);await expect(page.locator('#contacts')).toContainText('10 October 2026');await page.click('[data-letter=gro]');await expect(page.locator('#letter-body')).toHaveValue(/15\(b\)/);await page.click('#letter-close');
 }
});
test('Index is static and usable offline with source-linked six buckets',async({page,context})=>{
 await page.goto('/index/');await expect(page.locator('h1')).toContainText('Discharge Delay Index');await page.goto('/index/hdfc-ergo/');await expect(page.locator('.row-card').first()).toContainText('FY2025-26');await expect(page.locator('.values').first()).toContainText('2–6 h');await page.screenshot({path:'qa/screenshots/mobile-index.png',fullPage:true});
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toContainText('HDFC');await expect(page.locator('#offline-status')).toBeVisible();await page.goto('/');await expect(page.locator('#start-form')).toBeVisible();await context.setOffline(false);
});
test('no horizontal overflow at narrow mobile width',async({page})=>{
 await page.setViewportSize({width:360,height:800});for(const path of ['/','/index/','/index/hdfc-ergo/','/privacy/','/death/']){await page.goto(path);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
});
test('language controls recover when the Base entry cannot initialize but the clock loads',async({page})=>{
 // The live trace had a failed Base dependency followed by a successful clock import.
 // Block Base itself to reproduce the missing bootstrap deterministically in dev and production.
 let blockedBase=0;await page.route(/\/(?:_astro\/Base\.astro_|src\/layouts\/Base\.astro\?).*/,route=>{blockedBase++;return route.fulfill({status:404,body:''});});
 await page.goto('/');expect(blockedBase).toBeGreaterThan(0);await selectPicker(page,'[name=insurer]','hdfc-ergo');const past=new Date(Date.now()-4*3600000);await page.fill('[name=submittedAt]',new Date(past.getTime()-past.getTimezoneOffset()*60000).toISOString().slice(0,16));await page.click('#start-form button[type=submit]');
 await expect(page.locator('#clock-label')).toHaveText('Recorded wait beyond the rule’s window');await page.click('[data-letter=lock]');await page.click('#letter-close');await page.fill('#event-form [name=note]','Synthetic acknowledgement');await page.click('#event-form button');await page.click('[data-letter=gro]');await page.click('#letter-close');
 await page.evaluate(()=>{document.documentElement.dataset.languageEvents='0';window.addEventListener('languagechange',()=>{document.documentElement.dataset.languageEvents=String(Number(document.documentElement.dataset.languageEvents)+1);});});
 await page.click('[data-language=hi]');await expect(page.locator('html')).toHaveAttribute('lang','hi');await expect(page.locator('#clock-label')).toHaveText('दर्ज इंतज़ार नियम की समय-सीमा से आगे');await expect(page.locator('html')).toHaveAttribute('data-language-events','1');await expect(page.locator('#timeline-list')).toContainText('Synthetic acknowledgement');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','hi');await expect(page.locator('#clock-label')).toHaveText('दर्ज इंतज़ार नियम की समय-सीमा से आगे');
});
