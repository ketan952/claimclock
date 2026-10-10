import {test,expect} from '@playwright/test';
import contacts from '../../data/contacts.json' with {type:'json'};
test('comparison presents all insurers, required source rows, units and working sorts',async({page})=>{
 await page.goto('/index/');await expect(page.locator('#comparison-rows tr')).toHaveCount(32);
 for(const id of ['star-health','care','aditya-birla','sbi-general','national','united-india','oriental']){const row=page.locator(`#comparison-rows tr[data-insurer="${id}"]`);await expect(row).toHaveCount(1);await expect(row).toContainText('%');}
 await page.selectOption('#index-sort','lt1');const numbers=await page.locator('#comparison-rows tr').evaluateAll(rows=>rows.map(r=>(r as HTMLElement).dataset.lt1).filter(v=>v!==''&&v!==undefined).map(Number));expect(numbers).toEqual([...numbers].sort((a,b)=>b-a));
 await page.selectOption('#index-sort','name');await expect(page.locator('#comparison-rows tr').first()).toContainText('Acko');
 await expect(page.locator('.notice')).toContainText('TPA receives');await expect(page.locator('.notice')).toContainText('2–6');
 await page.screenshot({path:'qa/screenshots/comparison-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'qa/screenshots/comparison-desktop.png',fullPage:true});
});
test('all pages have preview metadata, static PNGs, install assets and sitemap',async({request})=>{
 test.setTimeout(120000);
 const paths=['/','/about/','/privacy/','/methodology/','/death/','/deductions/','/rejected/','/offline/','/index/',...contacts.filter(c=>c.kind==='insurer').map(c=>`/index/${c.id}/`)];
 const images=new Set<string>();for(const path of paths){const r=await request.get(path);expect(r.ok()).toBe(true);const html=await r.text();for(const name of ['og:title','og:description','og:image'])expect(html).toContain(`property="${name}"`);expect(html).toContain('name="twitter:card" content="summary_large_image"');const image=html.match(/property="og:image" content="([^"]+)"/)?.[1];expect(image).toBeTruthy();images.add(new URL(image!).pathname);}
 for(const image of images){const r=await request.get(image);expect(r.ok(),image).toBe(true);const b=await r.body();expect(b.subarray(1,4).toString()).toBe('PNG');expect(b.readUInt32BE(16)).toBe(1200);expect(b.readUInt32BE(20)).toBe(630);}
 for(const [path,size]of [['/icon-192.png',192],['/icon-512.png',512],['/apple-touch-icon.png',180]]as const){const b=await(await request.get(path)).body();expect(b.readUInt32BE(16)).toBe(size);expect(b.readUInt32BE(20)).toBe(size);}
 const ico=await(await request.get('/favicon.ico')).body();expect(ico.readUInt16LE(2)).toBe(1);
 expect(await(await request.get('/robots.txt')).text()).toContain('Sitemap: https://claimclock.ketan952.workers.dev/sitemap.xml');expect(await(await request.get('/sitemap.xml')).text()).toContain('/index/star-health/');
});
test('unusual published ranges name their channels and retain source review status',async({page})=>{
 await page.goto('/index/');
 const manipal=page.locator('#comparison-rows tr[data-insurer="manipalcigna"]');
 await expect(manipal.locator('[data-share]').nth(3)).toHaveText('0.21–45%');
 await expect(manipal.locator('[data-review-indicator]')).toContainText('PDF reverified');
 const endpoints=manipal.locator('[data-channel-endpoints]').nth(3);
 await endpoints.locator('summary').click();await expect(endpoints).toContainText('MEDI ASSIST INSURANCE TPA P LTD');await expect(endpoints).toContainText('In-house');
 const raheja=page.locator('#comparison-rows tr[data-insurer="raheja-qbe"]');await expect(raheja).toContainText('FY2024-25');await expect(raheja.locator('[data-share]').nth(1)).toHaveText('19–100%');
 await raheja.locator('[data-channel-endpoints]').nth(1).locator('summary').click();await expect(raheja.locator('[data-channel-endpoints]').nth(1)).toContainText('Paramount TPA');
 await page.goto('/index/universal-sompo/');const rounded=page.locator('[data-row-id="universal-sompo-fy2025-26-inhouse-individual-discharge"]');await expect(rounded.locator('[data-row-validation]')).toHaveAttribute('data-row-validation','pass');await expect(rounded.locator('[data-row-validation]')).toContainText('99%');await expect(rounded.locator('.pdf-link')).toHaveAttribute('href',/#page=1$/);
 await page.goto('/index/niva-bupa/');const incomplete=page.locator('[data-row-id="niva-bupa-fy2025-26-inhouse-individual-discharge"]');await expect(incomplete.locator('[data-row-validation]')).toHaveAttribute('data-row-validation','incomplete');await expect(incomplete.locator('.values')).toContainText('—');
 await page.goto('/index/united-india/');await expect(page.locator('[data-review-status="pending"]').first()).toContainText('manual re-verification pending');
});
