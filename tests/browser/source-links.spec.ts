import {test,expect} from '@playwright/test';
import sources from '../../data/source-links.json' with {type:'json'};
import contacts from '../../data/contacts.json' with {type:'json'};
import {auditHtml} from '../../scripts/check-static-csp.mjs';
test('all public pages contain external scripts only and no inline event handlers',async({request})=>{
 const routes=['/','/privacy/','/death/','/deductions/','/rejected/','/index/','/about/','/methodology/','/offline/','/vault/','/check-coverage/','/compare/','/renewal/',...contacts.filter(c=>c.kind==='insurer').map(c=>`/index/${c.id}/`)];
 for(const route of routes){const response=await request.get(route);expect(response.ok(),route).toBe(true);expect(auditHtml(await response.text()),route).toEqual([]);}
});
test('short citation links return a 302 to the exact primary source',async({request})=>{
 test.skip(!process.env.QA_BASE_URL,'Static preview does not implement Cloudflare redirect rules.');
 for(const source of sources){const response=await request.get(`/s/${source.slug}`,{maxRedirects:0});expect(response.status()).toBe(302);expect(response.headers().location).toBe(source.url);}
});
