import {test,expect} from '@playwright/test';
import {selectPicker} from './picker-helpers';

test('policy clause editing keeps selection and the first confirmation click updates the verdict',async({page,browserName})=>{
 await page.goto('/deductions/');
 await selectPicker(page,'#deduction-form select[name=insurer]','hdfc-ergo');
 await page.fill('#deduction-lines','Co-pay | 1000');
 await page.check('#deduction-form [name=confirmed]');
 await page.click('#deduction-form button[type=submit]');
 const clause=page.locator('[data-policy-clause]'),arithmetic=page.locator('[data-policy-arithmetic]'),absent=page.locator('[data-policy-absent]');
 await clause.fill('10% co-pay clause');
 await clause.evaluate((field:HTMLInputElement)=>field.setSelectionRange(0,2));
 await clause.press('2');
 await expect(clause).toBeFocused();
 await expect(clause).toHaveValue('2% co-pay clause');
 expect(await clause.evaluate((field:HTMLInputElement)=>[field.selectionStart,field.selectionEnd])).toEqual([1,1]);
 // Do not blur separately: the production bug swallowed this exact first click.
 await arithmetic.click();
 await expect(arithmetic).toBeChecked();
 // WebKit follows Safari's native click-focus behavior for checkboxes.
 if(browserName!=='webkit')await expect(arithmetic).toBeFocused();
 await arithmetic.focus();await arithmetic.press('Space');await expect(arithmetic).not.toBeChecked();await expect(arithmetic).toBeFocused();await arithmetic.press('Space');await expect(arithmetic).toBeChecked();
 await expect(page.locator('[data-verdict="likely valid"]')).toContainText('₹1,000');
 await page.click('#reconsideration');
 await expect(page.locator('#letter-body')).toHaveValue(/Please confirm the percentage/);
 await expect(page.locator('#letter-body')).not.toHaveValue(/17\(b\)/);
 await page.click('#letter-close');
 await absent.focus();await absent.press('Space');
 await expect(absent).toBeFocused();
 await expect(arithmetic).not.toBeChecked();
 await expect(arithmetic).toBeDisabled();
 await expect(clause).toHaveValue('');
 await expect(page.locator('[data-verdict="challengeable"]')).toContainText('₹1,000');
 await clause.fill('Replacement clause');
 await expect(clause).toBeFocused();
 await expect(absent).not.toBeChecked();
 await expect(arithmetic).toBeEnabled();
 await expect(page.locator('[data-verdict="policy term — verify"]')).toContainText('₹1,000');
 await arithmetic.click();
 await expect(arithmetic).toBeChecked();
 await expect(page.locator('[data-verdict="likely valid"]')).toContainText('₹1,000');
});
