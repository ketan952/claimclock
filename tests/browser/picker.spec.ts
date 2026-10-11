import {test,expect,type Page} from '@playwright/test';
import contacts from '../../data/contacts.json' with {type:'json'};
import enRaw from '../../src/i18n/en.json' with {type:'json'};
import hiRaw from '../../src/i18n/hi.json' with {type:'json'};
import {selectPicker} from './picker-helpers';

const en=enRaw as Record<string,string>,hi=hiRaw as Record<string,string>;
const CASES_KEY='claimclock:cases:v1';
const insurer='#start-form select[name=insurer]',tpa='#start-form select[name=tpa]';
const dialog=(page:Page)=>page.locator('dialog.select-picker-dialog[open]');
const trigger=(page:Page,selector:string)=>page.locator(selector).locator('..').locator('button[data-picker-trigger]');
async function open(page:Page,selector:string){
 await expect(page.locator(selector)).toHaveAttribute('hidden','');
 const button=trigger(page,selector);await expect(button).toHaveAttribute('aria-haspopup','dialog');await button.click();await expect(dialog(page)).toBeVisible();return dialog(page);
}
async function choose(page:Page,selector:string,value:string){await expect(trigger(page,selector)).toBeVisible();await selectPicker(page,selector,value);}
function backup(id:string,hospital:string,insurerId='care',tpaId=''){
 return{format:'claimclock-case',version:1,exportedAt:'2026-10-10T09:00:00.000Z',timeline:{id,insurerId,tpaId,hospital,city:'Pune',requestType:'discharge',submittedAt:'2026-10-10T08:00:00.000Z',events:[{id:`event-${id}`,at:'2026-10-10T08:15:00.000Z',type:'ack',note:`Synthetic note for ${id}`}]},deductions:[]};
}
const alpha=backup('picker-alpha','Synthetic Alpha Hospital','care','medi-assist');
const beta=backup('picker-beta','Synthetic Beta Hospital','hdfc-ergo');
async function seed(page:Page,cases=[alpha,beta]){
 await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:CASES_KEY,value:{version:1,selectedId:cases[0].timeline.id,cases}});
}
const file=(value:unknown)=>({name:'synthetic-picker-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function insideDialog(page:Page){expect(await dialog(page).evaluate(node=>node.contains(document.activeElement))).toBe(true);}

// Use the actual trigger and result buttons. A hidden native select is never
// manipulated by selectOption in these enhanced-control acceptance cases.
test('all insurer entry points offer the full local list and commit an explicit searched choice',async({page})=>{
 for(const [path,selector]of [['/',insurer],['/deductions/','#deduction-form select[name=insurer]'],['/rejected/','#rejection-form select[name=insurer]']]as const){
  await page.goto(path);const picker=await open(page,selector);await expect(picker).toHaveAccessibleName(en['label.insurer']);await insideDialog(page);
  const values=await picker.locator('button[data-picker-value]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.pickerValue));
  for(const contact of contacts.filter(c=>c.kind==='insurer'))expect(values).toContain(contact.id);
  const search=picker.getByRole('searchbox');await expect(search).toHaveAccessibleName(en['picker.search']);await search.fill('HDFC');await expect(picker.locator('button[data-picker-value]')).toHaveCount(1);await search.fill(contacts.find(contact=>contact.id==='hdfc-ergo')!.name_hi);await expect(picker.locator('button[data-picker-value]')).toHaveCount(1);
  await expect(page.locator(selector)).toHaveValue('');await picker.locator('button[data-picker-value="hdfc-ergo"]').click();await expect(picker).toBeHidden();await expect(page.locator(selector)).toHaveValue('hdfc-ergo');await expect(trigger(page,selector)).toContainText('HDFC ERGO');await expect(trigger(page,selector)).toBeFocused();
 }
});

test('Escape, explicit close and backdrop cancel without changing the committed insurer and return focus',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await choose(page,insurer,'care');
 let picker=await open(page,insurer);await expect(picker.locator('button[data-picker-value="care"]')).toHaveAttribute('aria-current','true');await picker.getByRole('searchbox').fill('HDFC');await picker.getByRole('searchbox').press('ArrowDown');await page.keyboard.press('Escape');await expect(picker).toBeHidden();await expect(page.locator(insurer)).toHaveValue('care');await expect(trigger(page,insurer)).toBeFocused();
 picker=await open(page,insurer);await picker.getByRole('button',{name:en['picker.close'],exact:true}).click();await expect(picker).toBeHidden();await expect(page.locator(insurer)).toHaveValue('care');await expect(trigger(page,insurer)).toBeFocused();
 picker=await open(page,insurer);const box=await picker.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThan(5);await page.mouse.click(box!.x-4,box!.y+box!.height/2);await expect(picker).toBeHidden();await expect(page.locator(insurer)).toHaveValue('care');await expect(trigger(page,insurer)).toBeFocused();
});

test('keyboard navigation, modal focus, no-results recovery and IME composition preserve deliberate selection',async({page})=>{
 await page.goto('/');const picker=await open(page,insurer),search=picker.getByRole('searchbox');
 const outgoing:string[]=[];page.on('request',request=>outgoing.push(request.url()+' '+(request.postData()||'')));
 await search.fill('synthetic-no-matching-insurer-934871');await expect(picker.locator('button[data-picker-value]')).toHaveCount(0);await expect(picker.getByRole('status')).toHaveText(en['picker.noResults']);await search.press('Enter');await expect(picker).toBeVisible();await expect(page.locator(insurer)).toHaveValue('');
 await picker.getByRole('button',{name:en['picker.clear'],exact:true}).click();await expect(search).toHaveValue('');await search.press('ArrowDown');const options=picker.locator('button[data-picker-value]');await expect(options.first()).toBeFocused();await page.keyboard.press('End');await expect(options.last()).toBeFocused();await page.keyboard.press('ArrowUp');await expect(options.nth(await options.count()-2)).toBeFocused();await page.keyboard.press('Home');await expect(options.first()).toBeFocused();await page.keyboard.press('ArrowDown');await expect(options.nth(1)).toBeFocused();await expect(page.locator(insurer)).toHaveValue('');
 await page.keyboard.press('End');await page.keyboard.press('Tab');await insideDialog(page);await page.keyboard.press('Shift+Tab');await insideDialog(page);await search.focus();await search.press('ArrowDown');const selected=await options.first().getAttribute('data-picker-value');await page.keyboard.press('Enter');await expect(picker).toBeHidden();await expect(page.locator(insurer)).toHaveValue(selected!);
 const reopened=await open(page,insurer),input=reopened.getByRole('searchbox');await input.fill('Care');await expect(reopened.locator('button[data-picker-value]')).toHaveCount(1);
 await input.evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));await expect(reopened).toBeVisible();await expect(page.locator(insurer)).toHaveValue(selected!);await input.press('Enter');await expect(reopened).toBeHidden();await expect(page.locator(insurer)).toHaveValue('care');
 expect(outgoing.some(value=>value.includes('synthetic-no-matching-insurer-934871'))).toBe(false);
});

test('a language change preserves the open query, focused result and committed value, with Hindi TPA search',async({page})=>{
 await page.goto('/');await choose(page,insurer,'care');const picker=await open(page,insurer),search=picker.getByRole('searchbox');await search.fill('HDFC');await search.press('ArrowDown');await expect(picker.locator('button[data-picker-value="hdfc-ergo"]')).toBeFocused();
 // Exercise a language change arriving while the modal is open without using
 // force-click to bypass its inert backdrop or moving the user's focus.
 await page.locator('[data-language=hi]').evaluate((button:HTMLButtonElement)=>button.click());await expect(picker).toHaveAccessibleName(hi['label.insurer']);await expect(search).toHaveAccessibleName(hi['picker.search']);await expect(search).toHaveValue('HDFC');await expect(picker.getByRole('button',{name:hi['picker.close'],exact:true})).toBeVisible();await expect(picker.locator('button[data-picker-value="hdfc-ergo"]')).toBeFocused();await expect(page.locator(insurer)).toHaveValue('care');await page.keyboard.press('Enter');await expect(page.locator(insurer)).toHaveValue('hdfc-ergo');await expect(trigger(page,insurer)).toBeFocused();
 const tpaPicker=await open(page,tpa);await tpaPicker.getByRole('searchbox').fill(contacts.find(contact=>contact.id==='medi-assist')!.name_hi);await expect(tpaPicker.locator('button[data-picker-value]')).toHaveCount(1);await tpaPicker.locator('button[data-picker-value="medi-assist"]').click();await expect(page.locator(tpa)).toHaveValue('medi-assist');
});

test('required insurer validation focuses the visible trigger while short choices remain native',async({page})=>{
 const errors:string[]=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto('/');await expect(page.locator(insurer)).toHaveAttribute('hidden','');await expect(page.locator('#start-form select[name=requestType]')).toBeVisible();
 await page.click('#start-form button[type=submit]');await expect(trigger(page,insurer)).toBeFocused();await expect(trigger(page,insurer)).toHaveAttribute('aria-invalid','true');await expect(page.locator('#dashboard')).toBeHidden();expect(errors.some(value=>/invalid form control.*not focusable/i.test(value))).toBe(false);
 await choose(page,insurer,'care');await expect(trigger(page,insurer)).not.toHaveAttribute('aria-invalid','true');await page.click('#start-form button[type=submit]');await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#finish-form select[name=outcome]')).toBeVisible();
 await page.goto('/index/');await expect(page.locator('#index-sort')).toBeVisible();expect(await page.locator('#index-sort').getAttribute('hidden')).toBeNull();
});

test('optional TPA has an explicit empty option and form reset updates both visible pickers',async({page})=>{
 await page.goto('/');await choose(page,insurer,'care');await choose(page,tpa,'medi-assist');await expect(trigger(page,tpa)).toContainText('Medi Assist');
 const picker=await open(page,tpa);expect(await picker.locator('button[data-picker-value]').count()).toBe(contacts.filter(c=>c.kind==='tpa').length+1);await picker.locator('button[data-picker-value=""]').click();await expect(page.locator(tpa)).toHaveValue('');await expect(trigger(page,tpa)).toHaveText(en['label.noTpa']);
 await choose(page,tpa,'medi-assist');await page.locator('#start-form').evaluate((form:HTMLFormElement)=>form.reset());await expect(page.locator(insurer)).toHaveValue('');await expect(trigger(page,insurer)).toHaveText(en['label.choose']);await expect(page.locator(tpa)).toHaveValue('');await expect(trigger(page,tpa)).toHaveText(en['label.noTpa']);
});

test('case selection, edit details and a new case keep programmatic picker values and labels synchronized',async({page})=>{
 await seed(page);await page.goto('/');await expect(trigger(page,'#case-select')).toContainText('Synthetic Alpha Hospital');await page.click('#edit-details');await expect(page.locator(insurer)).toHaveValue('care');await expect(trigger(page,insurer)).toContainText('Care');await expect(page.locator(tpa)).toHaveValue('medi-assist');await expect(trigger(page,tpa)).toContainText('Medi Assist');
 const picker=await open(page,'#case-select');await picker.getByRole('searchbox').fill('Beta');await expect(page.locator('#case-select')).toHaveValue(alpha.timeline.id);await picker.locator('button[data-picker-value="picker-beta"]').click();await expect(trigger(page,'#case-select')).toContainText('Synthetic Beta Hospital');await expect(page.locator('#timeline-list')).toContainText('Synthetic note for picker-beta');await page.click('#edit-details');await expect(trigger(page,insurer)).toContainText('HDFC ERGO');await expect(trigger(page,tpa)).toHaveText(en['label.noTpa']);
 await page.click('#case-new');await expect(page.locator('#case-select')).toHaveValue('');await expect(trigger(page,'#case-select')).toHaveText(en['cases.unsaved']);await expect(page.locator(insurer)).toHaveValue('');await expect(trigger(page,insurer)).toHaveText(en['label.choose']);await expect(trigger(page,tpa)).toHaveText(en['label.noTpa']);
 await page.click('#start-form button[type=submit]');await expect(trigger(page,insurer)).toHaveAttribute('aria-invalid','true');await choose(page,'#case-select',beta.timeline.id);await page.click('#edit-details');await expect(page.locator(insurer)).toHaveValue('hdfc-ergo');await expect(trigger(page,insurer)).toContainText('HDFC ERGO');await expect(trigger(page,insurer)).not.toHaveAttribute('aria-invalid','true');await expect(page.locator(insurer).locator('..').locator('.picker-error')).toBeHidden();
});

test('restore target picker remains inside the preview workflow and deduction case choices use current dynamic options',async({page})=>{
 await seed(page);await page.goto('/');const saved=await page.evaluate(key=>localStorage.getItem(key),CASES_KEY);await page.setInputFiles('#backup-file',file(backup('incoming-picker','Synthetic incoming replacement')));await expect(page.locator('#restore-dialog')).toBeVisible();
 let picker=await open(page,'#restore-target');await picker.getByRole('searchbox').fill('Beta');await page.keyboard.press('Escape');await expect(picker).toBeHidden();await expect(page.locator('#restore-dialog')).toBeVisible();await expect(trigger(page,'#restore-target')).toBeFocused();await expect(page.locator('#restore-target')).toHaveValue('');await expect(page.locator('#restore-replace')).toBeDisabled();
 await choose(page,'#restore-target',beta.timeline.id);await expect(trigger(page,'#restore-target')).toContainText('Synthetic Beta Hospital');await expect(page.locator('#restore-replace')).toBeEnabled();expect(await page.evaluate(key=>localStorage.getItem(key),CASES_KEY)).toBe(saved);await page.click('#restore-cancel');expect(await page.evaluate(key=>localStorage.getItem(key),CASES_KEY)).toBe(saved);
 await page.goto('/deductions/');picker=await open(page,'#deduction-case');await picker.getByRole('searchbox').fill('Beta');await picker.locator('button[data-picker-value="picker-beta"]').click();await expect(page.locator('#deduction-case')).toHaveValue(beta.timeline.id);await expect(trigger(page,'#deduction-case')).toContainText('Synthetic Beta Hospital');
});

test('long case labels and Hindi controls fit 320, 390, 768 and 1440 pixel viewports with usable rows',async({page})=>{
 test.setTimeout(60000);const cases=Array.from({length:50},(_,i)=>backup(`case-${i+1}`,`Synthetic district hospital ${String(i+1).padStart(2,'0')} with a long department and ward description`));await seed(page,cases);await page.goto('/');await page.click('[data-language=hi]');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:width===768?1024:844});const picker=await open(page,'#case-select');await expect(picker).toHaveAccessibleName(hi['cases.choose']);await expect(picker.getByRole('button',{name:hi['picker.close'],exact:true})).toBeVisible();await expect(picker.getByRole('searchbox')).toHaveAccessibleName(hi['picker.search']);await expect(picker.locator('button[data-picker-value]')).toHaveCount(51);
  const metrics=await picker.evaluate(node=>{const rect=node.getBoundingClientRect(),search=node.querySelector('input')!,buttons=[...node.querySelectorAll<HTMLElement>('button[data-picker-value]')],results=node.querySelector<HTMLElement>('.picker-results')!;return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,pageWidth:document.documentElement.scrollWidth,inputFont:parseFloat(getComputedStyle(search).fontSize),minimumRow:Math.min(...buttons.map(b=>b.getBoundingClientRect().height)),resultsWidth:results.scrollWidth,resultsClientWidth:results.clientWidth,scrollable:results.scrollHeight>results.clientHeight};});
  expect(metrics.left).toBeGreaterThanOrEqual(-1);expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth+1);expect(metrics.top).toBeGreaterThanOrEqual(-1);expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight+1);expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth+1);expect(metrics.inputFont).toBeGreaterThanOrEqual(16);expect(metrics.minimumRow).toBeGreaterThanOrEqual(48);expect(metrics.resultsWidth).toBeLessThanOrEqual(metrics.resultsClientWidth+1);expect(metrics.scrollable).toBe(true);
  await picker.getByRole('searchbox').fill('hospital 50');await expect(picker.locator('button[data-picker-value]')).toHaveCount(1);await picker.locator('button[data-picker-value="case-50"]').click();await expect(trigger(page,'#case-select')).toContainText('hospital 50');
 }
});

test('reopening saved Zuno details reveals the selected row and a different picker resets shared scroll on a short screen',async({page})=>{
 await page.setViewportSize({width:320,height:460});await page.goto('/');await choose(page,insurer,'zuno');await page.click('#start-form button[type=submit]');await expect(page.locator('#dashboard')).toBeVisible();await page.reload();await expect(page.locator('#dashboard')).toBeVisible();await page.click('#edit-details');await expect(page.locator(insurer)).toHaveValue('zuno');
 const picker=await open(page,insurer),selected=picker.locator('button[data-picker-value="zuno"]');await expect(selected).toHaveAttribute('aria-current','true');
 const withinResults=(node:HTMLElement)=>{const row=node.getBoundingClientRect(),list=node.closest('.picker-results')!.getBoundingClientRect();return row.top>=list.top-1&&row.bottom<=list.bottom+1&&row.left>=list.left-1&&row.right<=list.right+1;};
 // No focus/scroll helper is allowed here: opening must reveal the saved
 // selection itself, before any keyboard or pointer interaction with the list.
 await expect.poll(()=>selected.evaluate(withinResults)).toBe(true);expect(await picker.locator('.picker-results').evaluate(node=>node.scrollTop)).toBeGreaterThan(0);await picker.getByRole('button',{name:en['picker.close'],exact:true}).click();
 const tpaPicker=await open(page,tpa),empty=tpaPicker.locator('button[data-picker-value=""]');await expect(empty).toHaveAttribute('aria-current','true');await expect.poll(()=>empty.evaluate(withinResults)).toBe(true);expect(await tpaPicker.locator('.picker-results').evaluate(node=>node.scrollTop)).toBe(0);await expect(page.locator(tpa)).toHaveValue('');
});

test('without JavaScript the original labelled insurer and TPA selects remain usable native controls',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});try{const page=await context.newPage();await page.goto(new URL('/',baseURL).href);await expect(page.locator(insurer)).toBeVisible();await expect(page.locator(tpa)).toBeVisible();await expect(page.locator('[data-picker-trigger]')).toHaveCount(0);await expect(page.locator(insurer)).toHaveAccessibleName(en['label.insurer']);await page.locator(insurer).selectOption('care');await expect(page.locator(insurer)).toHaveValue('care');await page.locator(tpa).selectOption('medi-assist');await expect(page.locator(tpa)).toHaveValue('medi-assist');await page.locator(tpa).selectOption('');await expect(page.locator(tpa)).toHaveValue('');await page.goto(new URL('/rejected/',baseURL).href);await expect(page.locator('#rejection-form select[name=insurer]')).toBeVisible();await page.locator('#rejection-form select[name=insurer]').selectOption('hdfc-ergo');await expect(page.locator('#rejection-form select[name=insurer]')).toHaveValue('hdfc-ergo');}finally{await context.close();}
});
