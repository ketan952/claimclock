import {test,expect} from '@playwright/test';

test('native form submission cannot put local details in a URL when JavaScript is unavailable',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,javaScriptEnabled:false});
 const page=await context.newPage();
 const leaked:string[]=[];
 page.on('request',request=>{if(request.url().includes('synthetic-private-value'))leaked.push(request.url());});
 try {
  for(const path of ['/','/deductions/','/rejected/','/privacy/']){
   const response=await page.goto(path);
   expect(response?.headers()['content-security-policy']).toContain("form-action 'none'");
   const form=page.locator('form').first();
   await form.evaluate(node=>{
    const sentinel=document.createElement('input');sentinel.name='privacy_test';sentinel.value='synthetic-private-value';node.append(sentinel);
    (node as HTMLFormElement).submit();
   });
   await page.waitForTimeout(100);
   expect(new URL(page.url()).search).toBe('');
  }
  expect(leaked).toEqual([]);
 } finally {await context.close();}
});
