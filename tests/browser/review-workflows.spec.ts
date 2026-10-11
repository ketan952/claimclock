import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {selectPicker} from './picker-helpers';

const key='claimclock:cases:v1';
const backup={format:'claimclock-case',version:1,exportedAt:'2019-11-10T10:00:00.000Z',timeline:{id:'synthetic-review-case',insurerId:'care',hospital:'Synthetic review hospital',city:'Pune',requestType:'discharge',submittedAt:'2019-11-10T06:00:00.000Z',events:[]},deductions:[]};
async function seed(page:Page){await page.goto('/');await page.evaluate(({key,backup})=>localStorage.setItem(key,JSON.stringify({version:1,selectedId:backup.timeline.id,cases:[backup]})),{key,backup});await page.reload();}
const stored=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
async function event(page:Page,note:string){await page.fill('#event-form [name=note]',note);await page.click('#event-form button[type=submit]');}
async function loadLines(page:Page){await page.goto('/deductions/');await selectPicker(page,'#deduction-case',backup.timeline.id);await page.click('#deduction-load');}
async function reviewLines(page:Page,amount:number){await selectPicker(page,'#deduction-form [name=insurer]','care');await page.fill('#deduction-lines',`Co-pay | ${amount}`);await page.check('#deduction-form [name=confirmed]');await page.click('#deduction-form button[type=submit]');}

test('two tabs cannot overwrite saved events or decisions with a stale draft, and loading latest is explicit',async({page,context})=>{
 await seed(page);const other=await context.newPage();await other.goto('/');
 await page.fill('#event-form [name=note]','Synthetic draft from tab A');await event(other,'Synthetic saved event from tab B');
 await page.click('#event-form button[type=submit]');
 await expect(page.locator('#workflow-status')).toContainText('not overwritten');
 await expect(page.locator('#event-form [name=note]')).toHaveValue('Synthetic draft from tab A');
 expect((await stored(page)).cases[0].timeline.events.map((e:{note:string})=>e.note)).toEqual(['Synthetic saved event from tab B']);
 const pending=page.waitForEvent('download');await page.click('#workflow-download');const downloaded=await pending;const draft=JSON.parse(await readFile((await downloaded.path())!,'utf8'));
 expect(draft.timeline.events.map((e:{note:string})=>e.note)).toEqual(['Synthetic draft from tab A']);
 page.once('dialog',dialog=>dialog.dismiss());await page.click('#workflow-load-latest');await expect(page.locator('#event-form [name=note]')).toHaveValue('Synthetic draft from tab A');
 page.once('dialog',dialog=>dialog.accept());await page.click('#workflow-load-latest');await expect(page.locator('#timeline-list')).toContainText('Synthetic saved event from tab B');
 await page.click('#edit-details');await page.fill('#start-form [name=city]','Synthetic draft city');await page.fill('#start-form [name=submittedAt]','2019-11-10T12:30');
 await other.fill('#finish-form [name=decidedAt]','2019-11-10T15:00');await other.click('#finish-form button[type=submit]');
 const before=await stored(page);await page.click('#start-form button[type=submit]');
 await expect(page.locator('#workflow-status')).toContainText('not overwritten');await expect(page.locator('#start-view')).toBeVisible();
 await expect(page.locator('#start-form [name=city]')).toHaveValue('Synthetic draft city');await expect(page.locator('#start-form [name=submittedAt]')).toHaveValue('2019-11-10T12:30');expect(await stored(page)).toEqual(before);
 await other.close();
});

test('a stale tab cannot resurrect a deleted case or delete newly attached evidence',async({page,context})=>{
 await seed(page);const other=await context.newPage();await other.goto('/');other.once('dialog',dialog=>dialog.accept());await other.click('#case-delete');
 await event(page,'Synthetic draft after deletion');await expect(page.locator('#workflow-status')).toContainText('deleted');expect((await stored(page)).cases).toEqual([]);
 page.once('dialog',dialog=>dialog.accept());await page.click('#workflow-load-latest');await expect(page.locator('#start-view')).toBeVisible();await expect(page.locator('#dashboard')).toBeHidden();expect((await stored(page)).cases).toEqual([]);
 await seed(page);await loadLines(other);await reviewLines(other,2500);await other.click('#deduction-save');await expect(other.locator('#deduction-case-status')).toContainText('lines saved');
 page.once('dialog',dialog=>dialog.accept());await page.click('#case-delete');await expect(page.locator('#workflow-status')).toContainText('not overwritten');expect((await stored(page)).cases[0].deductions[0].amount).toBe(2500);
 await event(page,'Synthetic event preserving new attachments');expect((await stored(page)).cases[0].deductions[0].amount).toBe(2500);expect((await stored(page)).cases[0].timeline.events[0].note).toBe('Synthetic event preserving new attachments');
 await other.close();
});

test('deduction replacement detects stale lines while preserving unrelated timeline updates',async({page,context})=>{
 await seed(page);await loadLines(page);await reviewLines(page,1000);await page.click('#deduction-save');
 const other=await context.newPage();await loadLines(other);
 await reviewLines(page,2000);page.once('dialog',dialog=>dialog.accept());await page.click('#deduction-save');
 other.once('dialog',dialog=>dialog.accept());await other.click('#deduction-save');await expect(other.locator('#deduction-case-status')).toContainText('nothing was overwritten');expect((await stored(page)).cases[0].deductions[0].amount).toBe(2000);await expect(other.locator('#deduction-lines')).toHaveValue('Co-pay | 1000');
 await other.goto('/');await event(other,'Synthetic newer timeline evidence');
 await page.locator('[data-policy-clause]').fill('Synthetic policy term');await page.locator('[data-policy-arithmetic]').check();page.once('dialog',dialog=>dialog.accept());await page.click('#deduction-save');
 expect((await stored(page)).cases[0].timeline.events[0].note).toBe('Synthetic newer timeline evidence');expect((await stored(page)).cases[0].deductions[0].policyCalculationConfirmed).toBe(true);await other.close();
});

test('restore replacement rejects a changed preview target and still allows import as a separate case',async({page,context})=>{
 await seed(page);const other=await context.newPage();await other.goto('/');
 const incoming={...backup,timeline:{...backup.timeline,hospital:'Synthetic imported replacement'}};
 await page.setInputFiles('#backup-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
 await event(other,'Synthetic evidence after preview');await selectPicker(page,'#restore-target',backup.timeline.id);await page.click('#restore-replace');
 await expect(page.locator('#restore-status')).toContainText('Nothing was replaced');expect((await stored(page)).cases[0].timeline.events[0].note).toBe('Synthetic evidence after preview');
 await page.click('#restore-new');expect((await stored(page)).cases).toHaveLength(2);expect((await stored(page)).cases[0].timeline.hospital).toBe(backup.timeline.hospital);await other.close();
});

test('language changes preserve details being edited and case changes clear closed letter actions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seed(page);
 await page.click('[data-letter=lock]');await page.click('#letter-close');await page.click('#edit-details');await page.fill('#start-form [name=hospital]','Synthetic unsaved hospital');
 await page.click('[data-language=hi]');await expect(page.locator('#start-view')).toBeVisible();await expect(page.locator('#dashboard')).toBeHidden();await expect(page.locator('#start-form [name=hospital]')).toHaveValue('Synthetic unsaved hospital');expect((await stored(page)).cases[0].timeline.hospital).toBe(backup.timeline.hospital);
 await page.click('#case-new');await page.click('[data-language=en]');await expect(page.locator('#letter-body')).toHaveValue('');await expect(page.locator('#letter-copy')).toBeDisabled();await expect(page.locator('#letter-download')).toBeDisabled();await expect(page.locator('#letter-email')).not.toHaveAttribute('href');await expect(page.locator('#letter-whatsapp')).not.toHaveAttribute('href');expect(errors).toEqual([]);
});

test('a stale draft backup does not combine its original insurer with another insurers new deductions',async({page,context})=>{
 await seed(page);const other=await context.newPage();await other.goto('/');await other.click('#edit-details');await selectPicker(other,'#start-form [name=insurer]','hdfc-ergo');await other.click('#start-form button[type=submit]');
 await loadLines(other);await other.fill('#deduction-lines','Synthetic changed-insurer adjustment | 1500');await other.check('#deduction-form [name=confirmed]');await other.click('#deduction-form button[type=submit]');await other.click('#deduction-save');
 await event(page,'Synthetic original-insurer draft');await expect(page.locator('#workflow-status')).toContainText('not overwritten');
 const pending=page.waitForEvent('download');await page.click('#workflow-download');const downloaded=await pending;const draft=JSON.parse(await readFile((await downloaded.path())!,'utf8'));
 expect(draft.timeline.insurerId).toBe('care');expect(draft.deductions).toEqual([]);expect((await stored(page)).cases[0].timeline.insurerId).toBe('hdfc-ergo');expect((await stored(page)).cases[0].deductions[0].amount).toBe(1500);await other.close();
});

test('reviewed lines cannot attach to another claim restored over the same case ID',async({page,context})=>{
 await seed(page);await loadLines(page);await reviewLines(page,1500);const other=await context.newPage();await other.goto('/');
 const replacement={...backup,timeline:{...backup.timeline,hospital:'Synthetic different claim hospital',submittedAt:'2020-01-10T06:00:00.000Z'}};
 await other.setInputFiles('#backup-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});await selectPicker(other,'#restore-target',backup.timeline.id);await other.click('#restore-replace');
 await page.click('#deduction-save');await expect(page.locator('#deduction-case-status')).toContainText('nothing was overwritten');expect((await stored(page)).cases[0].deductions).toEqual([]);expect((await stored(page)).cases[0].timeline.hospital).toBe('Synthetic different claim hospital');await expect(page.locator('#deduction-lines')).toHaveValue('Co-pay | 1500');await other.close();
});
