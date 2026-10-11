import {expect,type Page} from '@playwright/test';

/** Choose through the visible picker UI, retaining native-select fallback. */
export async function selectPicker(page:Page,selector:string,value:string):Promise<void>{
 const select=page.locator(selector);
 await select.waitFor({state:'attached'});
 if(await select.getAttribute('hidden')===null){
  await select.selectOption(value);
 }else{
  await select.locator('..').locator('button[data-picker-trigger]').click();
  const dialog=page.locator('dialog.select-picker-dialog[open]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type=search]').fill('');
  const escaped=await page.evaluate(value=>CSS.escape(value),value);
  await dialog.locator(`button[data-picker-value="${escaped}"]`).click();
  await expect(dialog).toBeHidden();
 }
 await expect(select).toHaveValue(value);
}
