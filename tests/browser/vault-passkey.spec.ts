import {test,expect,type Page} from '@playwright/test';
import {installMockTurnstile} from './turnstile-helper';

// A real WebAuthn ceremony in Chromium (CDP virtual authenticator) against a mocked account API.
// The Worker's own verification is covered by tests/auth.test.ts; this proves the browser side:
// option conversion, resident-key creation, PRF handling, cookie-less session polling and vault upload.
const b64=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64url');
// WebAuthn needs a registrable domain as the relying party id, so the local run uses localhost rather than 127.0.0.1.
const base=new URL(process.env.QA_BASE_URL||'http://localhost:4322');const rpId=base.hostname;
async function mockAccountApi(page:Page,state:{registered:Record<string,unknown>|null;vault:{version:number;ciphertext:string|null}}){
 await page.route('**/api/auth/register/options',route=>route.fulfill({json:{challenge_id:'11111111-1111-4111-8111-111111111111',publicKey:{challenge:b64(crypto.getRandomValues(new Uint8Array(32))),rp:{id:rpId,name:'ClaimClock'},user:{id:b64(new TextEncoder().encode('22222222-2222-4222-8222-222222222222')),name:'ClaimClock account',displayName:'ClaimClock account'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:120000,attestation:'none',authenticatorSelection:{residentKey:'required',requireResidentKey:true,userVerification:'required'},extensions:{credProps:true,prf:{}}}}}));
 await page.route('**/api/auth/register/verify',async route=>{state.registered=route.request().postDataJSON();await route.fulfill({status:201,json:{authenticated:true,user_id:'22222222-2222-4222-8222-222222222222',credential_id:(state.registered as {id:string}).id,backup_eligible:false}});});
 await page.route('**/api/auth/login/options',route=>route.fulfill({json:{challenge_id:'33333333-3333-4333-8333-333333333333',publicKey:{challenge:b64(crypto.getRandomValues(new Uint8Array(32))),rpId,timeout:120000,userVerification:'required',allowCredentials:[]}}}));
 await page.route('**/api/auth/login/verify',route=>route.fulfill({json:{authenticated:true,user_id:'22222222-2222-4222-8222-222222222222',credential_id:(state.registered as {id:string}|null)?.id||'',wrapped_key:(state.registered as {wrapped_key?:string}|null)?.wrapped_key||null,vault_version:state.vault.version}}));
 await page.route('**/api/auth/wrapped-key',async route=>{const body=route.request().postDataJSON();if(state.registered)state.registered.wrapped_key=body.wrapped_key;await route.fulfill({json:{saved:true}});});
 await page.route('**/api/auth/session',route=>route.fulfill({json:state.registered?{authenticated:true,user_id:'22222222-2222-4222-8222-222222222222',credential_id:(state.registered as {id:string}).id,credentials:[{id:(state.registered as {id:string}).id,created_at:'2026-10-16T00:00:00Z',last_used_at:null,has_wrapped_key:Boolean(state.registered.wrapped_key)}],vault_version:state.vault.version,vault_updated_at:null}:{authenticated:false}}));
 await page.route('**/api/vault',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{version:state.vault.version,ciphertext:state.vault.ciphertext,updated_at:state.vault.ciphertext?'2026-10-16T00:00:00Z':null}});
  const body=route.request().postDataJSON() as {ciphertext:string;version:number};
  if(body.version!==state.vault.version)return route.fulfill({status:409,json:{error:'conflict'}});
  state.vault={version:state.vault.version+1,ciphertext:body.ciphertext};
  return route.fulfill({json:{version:state.vault.version,updated_at:new Date().toISOString()}});
 });
}
for(const hasPrf of [true,false])test(`a real Chromium passkey ceremony (PRF ${hasPrf?'available':'unavailable'}) creates the account, uploads only ciphertext and unlocks the vault key again through ${hasPrf?'PRF':'the recovery key'}`,async({page})=>{
 test.setTimeout(120000);
 const state={registered:null as Record<string,unknown>|null,vault:{version:0,ciphertext:null as string|null}};
 await installMockTurnstile(page);
 await mockAccountApi(page,state);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('WebAuthn.enable');
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,hasPrf} as never});
 await page.goto(new URL('/vault/',base).href);
 await page.fill('#profile-form [name=name]','Ramesh Kumar');await page.click('#profile-form button[type=submit]');
 await expect(page.locator('#account-register')).toBeEnabled();
 await page.click('#account-register');
 await expect(page.locator('#account-status')).toContainText(/Account created/,{timeout:15000});
 expect(state.registered).not.toBeNull();
 const registered=state.registered as {id:string;response:{clientDataJSON:string;attestationObject:string;transports:string[]};wrapped_key?:string};
 expect(registered.id.length).toBeGreaterThan(16);
 const clientData=JSON.parse(Buffer.from(registered.response.clientDataJSON,'base64url').toString());
 expect(clientData.type).toBe('webauthn.create');expect(clientData.origin).toBe(base.origin);
 expect(registered.response.attestationObject.length).toBeGreaterThan(100);
 const credentials=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
 expect(credentials.credentials.length).toBe(1);expect(credentials.credentials[0].isResidentCredential).toBe(true);
 await expect(page.locator('#sync-status')).toContainText(/Synced|up to date/i,{timeout:15000});
 expect(state.vault.version).toBe(1);
 const envelope=Buffer.from(state.vault.ciphertext!,'base64url');
 expect(envelope[0]).toBe(1);expect(state.vault.ciphertext).not.toContain('Ramesh');
 expect(Buffer.from(state.vault.ciphertext!,'base64url').toString('latin1')).not.toContain('Ramesh Kumar');
 const key=await page.evaluate(()=>localStorage.getItem('claimclock:vault-key:v1'));
 expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
 const prfWrapped=Boolean(registered.wrapped_key);expect(prfWrapped).toBe(hasPrf);
 // Simulate a new device: same account and passkey, no local vault or key.
 await page.evaluate(()=>{localStorage.removeItem('claimclock:vault:v1');localStorage.removeItem('claimclock:vault-key:v1');localStorage.removeItem('claimclock:vault-sync:v1');});
 state.registered={...state.registered!};
 await page.reload();
 await page.click('#account-login');
 await expect(page.locator('#account-status')).not.toContainText(/Waiting for your passkey/,{timeout:20000});
 if(prfWrapped){
  await expect(page.locator('#account-status')).toContainText(/unlocked the vault/,{timeout:15000});
  await expect(page.locator('#profile-form [name=name]')).toHaveValue('Ramesh Kumar',{timeout:15000});
 }else{
  await expect(page.locator('#account-status')).toContainText(/cannot decrypt the vault yet/,{timeout:15000});
  await page.fill('#recovery-form [name=recovery]',key!);await page.click('#recovery-submit');
  await expect(page.locator('#profile-form [name=name]')).toHaveValue('Ramesh Kumar',{timeout:15000});
 }
 await expect(page.locator('#sync-summary')).toContainText(/Last synced/);
 await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
});
