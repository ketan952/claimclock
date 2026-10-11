import {test,expect,type Page} from '@playwright/test';

const insurer='#start-form select[name=insurer]';
const trigger=(page:Page)=>page.locator(insurer).locator('..').locator('[data-picker-trigger]');
const picker=(page:Page)=>page.locator('dialog.select-picker-dialog[open]');
async function open(page:Page){await page.goto('/');await expect(page.locator(insurer)).toHaveAttribute('hidden','');await trigger(page).click();return picker(page);}
async function usable(page:Page,top:number,bottom:number){
 const metrics=await picker(page).evaluate(node=>{
  const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
  const results=node.querySelector('.picker-results')!,buttons=[...results.querySelectorAll('button')];
  return {dialog:rect(node),heading:rect(node.querySelector('h2')!),close:rect(node.querySelector('.picker-close')!),search:rect(node.querySelector('input')!),list:rect(results),width:innerWidth,pageWidth:document.documentElement.scrollWidth,hitRows:buttons.filter(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit&&(hit===button||button.contains(hit));}).length};
 });
 for(const field of [metrics.dialog,metrics.heading,metrics.close,metrics.search]){expect(field.top).toBeGreaterThanOrEqual(top-1);expect(field.bottom).toBeLessThanOrEqual(bottom+1);}
 expect(metrics.close.height).toBeGreaterThanOrEqual(48);expect(metrics.search.height).toBeGreaterThanOrEqual(48);expect(metrics.list.height).toBeGreaterThanOrEqual(48);expect(metrics.hitRows).toBeGreaterThanOrEqual(1);expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.width+1);
}

test('200px-high insurer picker keeps a visible label, close, search and selectable result',async({page})=>{
 for(const width of [667,320]){
  await page.setViewportSize({width,height:200});const modal=await open(page);await modal.getByRole('searchbox').fill('health');await usable(page,0,200);
  await expect(modal.getByRole('status')).toHaveText('7 options');await modal.getByRole('searchbox').press('ArrowDown');await expect(modal.locator('[data-picker-value="aditya-birla"]')).toBeFocused();await usable(page,0,200);
  await page.keyboard.press('Tab');expect(await modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);await page.keyboard.press('Shift+Tab');expect(await modal.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  await modal.getByRole('searchbox').fill('Care');await modal.locator('[data-picker-value="care"]').click();await expect(page.locator(insurer)).toHaveValue('care');await expect(trigger(page)).toBeFocused();
 }
});

test('visual viewport keyboard inset compacts an already open picker and restores the full layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});const modal=await open(page);await modal.getByRole('searchbox').fill('health');
 // Controlled viewport geometry, not a claim to automate a physical keyboard.
 // Keep layout height 844 while the keyboard leaves 200px at offsetTop 24.
 await page.evaluate(()=>{const view=window.visualViewport!;Object.defineProperties(view,{height:{configurable:true,value:200},offsetTop:{configurable:true,value:24}});view.dispatchEvent(new Event('resize'));});
 await expect(modal).toHaveClass(/picker-compact/);await usable(page,24,224);await modal.getByRole('searchbox').press('ArrowDown');await usable(page,24,224);
 await page.evaluate(()=>{const view=window.visualViewport!;delete (view as unknown as {height?:number}).height;delete (view as unknown as {offsetTop?:number}).offsetTop;view.dispatchEvent(new Event('resize'));});
 await expect(modal).not.toHaveClass(/picker-compact/);await usable(page,0,844);await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(trigger(page)).toBeFocused();
});

test('shrinking the viewport keeps the already focused last result visible',async({page})=>{
 await page.setViewportSize({width:667,height:700});const modal=await open(page);await modal.getByRole('searchbox').press('ArrowDown');await page.keyboard.press('End');
 const last=modal.locator('[data-picker-value]').last();await expect(last).toBeFocused();await page.setViewportSize({width:667,height:200});
 await expect.poll(()=>last.evaluate(node=>{const row=node.getBoundingClientRect(),list=node.closest('.picker-results')!.getBoundingClientRect();return row.top>=list.top-1&&row.bottom<=list.bottom+1;})).toBe(true);
 await expect(last).toBeFocused();await usable(page,0,200);const value=await last.getAttribute('data-picker-value');await page.keyboard.press('Enter');await expect(page.locator(insurer)).toHaveValue(value!);await expect(trigger(page)).toBeFocused();
});
