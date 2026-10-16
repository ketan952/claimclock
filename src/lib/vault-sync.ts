// Account and sync client for the vault (M20). Every network call carries only what the
// server is allowed to see: passkey material, a session cookie and ciphertext.
import {getTurnstileToken} from './turnstile';
import {createPasskey,getPasskey,passkeysSupported,type CreationOptions,type RequestOptions} from './webauthn-client.ts';
import {decryptVault,encryptVault,unwrapVaultKey,wrapVaultKey} from './vault-crypto.ts';
import {loadVaultKey,parseVault,saveVaultKey,type Vault} from './vault.ts';

export class SyncError extends Error {
 readonly messageKey:string;
 constructor(messageKey:string){super(messageKey);this.name='SyncError';this.messageKey=messageKey;}
}
export type SessionSummary={authenticated:boolean;user_id?:string;credential_id?:string;credentials?:{id:string;created_at:string;last_used_at:string|null;has_wrapped_key:boolean}[];vault_version?:number;vault_updated_at?:string|null};
export type RemoteVault={version:number;ciphertext:string|null;updated_at:string|null};
async function api<T>(path:string,method:'GET'|'POST'|'PUT'|'DELETE',body?:unknown,headers:Record<string,string>={}):Promise<T> {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
 let response:Response;
 try{response=await fetch(path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});}
 catch{throw new SyncError('vault.network');}
 finally{clearTimeout(timer);}
 if(!response.ok){
  if(response.status===401)throw new SyncError('vault.signedOut');
  if(response.status===409)throw new SyncError('vault.conflict');
  if(response.status===429)throw new SyncError('vault.busy');
  if(response.status===403)throw new SyncError('vault.verification');
  if(response.status===503)throw new SyncError('vault.unavailable');
  throw new SyncError('vault.requestFailed');
 }
 const text=await response.text();if(text.length>400_000)throw new SyncError('vault.requestFailed');
 try{const parsed:unknown=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed as T;}catch{throw new SyncError('vault.requestFailed');}
}
export function getSession():Promise<SessionSummary>{return api<SessionSummary>('/api/auth/session','GET');}
export function logout():Promise<void>{return api('/api/auth/logout','POST',{}).then(()=>undefined);}
export function eraseAccount():Promise<void>{return api('/api/auth/account','DELETE',{confirm:true}).then(()=>undefined);}
/** Creates the passkey account. The vault key must already exist locally so it can be wrapped for passkey-only unlock on other devices. */
export async function registerPasskey(vaultKey:string):Promise<{userId:string;prfWrapped:boolean}> {
 if(!passkeysSupported())throw new SyncError('vault.passkeysUnsupported');
 let token:string;try{token=await getTurnstileToken('auth_register');}catch{throw new SyncError('vault.verification');}
 const options=await api<{challenge_id:string;publicKey:CreationOptions}>('/api/auth/register/options','POST',{},{'X-Turnstile-Token':token});
 const created=await createPasskey(options.publicKey).catch(error=>{throw new SyncError(error?.kind==='cancelled'?'vault.cancelled':error?.kind==='unsupported'?'vault.passkeysUnsupported':'vault.passkeyFailed');});
 const wrapped=created.prfOutput?await wrapVaultKey(vaultKey,created.prfOutput):null;
 const verified=await api<{user_id:string;credential_id:string}>('/api/auth/register/verify','POST',{challenge_id:options.challenge_id,id:created.id,response:created.response,...(wrapped?{wrapped_key:wrapped}:{})});
 let prfWrapped=Boolean(wrapped);
 // Some authenticators only evaluate PRF on an assertion: one extra confirmation stores the wrapped key.
 if(!prfWrapped&&created.prfEnabled){
  try{
   const login=await api<{challenge_id:string;publicKey:RequestOptions}>('/api/auth/login/options','POST',{});
   const asserted=await getPasskey(login.publicKey,created.id);
   await api('/api/auth/login/verify','POST',{challenge_id:login.challenge_id,id:asserted.id,response:asserted.response});
   if(asserted.prfOutput){await api('/api/auth/wrapped-key','PUT',{wrapped_key:await wrapVaultKey(vaultKey,asserted.prfOutput)});prfWrapped=true;}
  }catch{/* The account exists; the recovery key remains the cross-device path. */}
 }
 return {userId:verified.user_id,prfWrapped};
}
export type LoginResult={userId:string;vaultVersion:number;keyRecovered:boolean;needsRecoveryKey:boolean};
export async function loginPasskey():Promise<LoginResult> {
 if(!passkeysSupported())throw new SyncError('vault.passkeysUnsupported');
 const options=await api<{challenge_id:string;publicKey:RequestOptions}>('/api/auth/login/options','POST',{});
 const asserted=await getPasskey(options.publicKey).catch(error=>{throw new SyncError(error?.kind==='cancelled'?'vault.cancelled':error?.kind==='unsupported'?'vault.passkeysUnsupported':'vault.passkeyFailed');});
 const verified=await api<{user_id:string;wrapped_key:string|null;vault_version:number}>('/api/auth/login/verify','POST',{challenge_id:options.challenge_id,id:asserted.id,response:asserted.response});
 let keyRecovered=false;
 if(!loadVaultKey()&&verified.wrapped_key&&asserted.prfOutput){
  try{saveVaultKey(await unwrapVaultKey(verified.wrapped_key,asserted.prfOutput));keyRecovered=true;}catch{/* Fall back to the recovery key below. */}
 }else if(loadVaultKey()&&!verified.wrapped_key&&asserted.prfOutput){
  // This device holds the key and the passkey supports PRF: store the wrapped key for the next device.
  try{await api('/api/auth/wrapped-key','PUT',{wrapped_key:await wrapVaultKey(loadVaultKey()!,asserted.prfOutput)});}catch{/* Optional convenience; nothing is lost. */}
 }
 return {userId:verified.user_id,vaultVersion:verified.vault_version,keyRecovered,needsRecoveryKey:!loadVaultKey()};
}
export async function pullVault(key:string):Promise<{vault:Vault;version:number;updatedAt:string}|null> {
 const remote=await api<RemoteVault>('/api/vault','GET');
 if(!remote.ciphertext||!Number.isInteger(remote.version)||remote.version<1)return null;
 let plaintext:string;try{plaintext=await decryptVault(remote.ciphertext,key);}catch{throw new SyncError('vault.wrongKey');}
 try{return {vault:parseVault(JSON.parse(plaintext)),version:remote.version,updatedAt:remote.updated_at||''};}catch{throw new SyncError('vault.corruptRemote');}
}
export async function pushVault(vault:Vault,key:string,expectedVersion:number):Promise<{version:number;updatedAt:string}> {
 const ciphertext=await encryptVault(JSON.stringify(vault),key);
 const saved=await api<{version:number;updated_at:string}>('/api/vault','PUT',{ciphertext,version:expectedVersion});
 if(!Number.isInteger(saved.version))throw new SyncError('vault.requestFailed');
 return {version:saved.version,updatedAt:saved.updated_at};
}
