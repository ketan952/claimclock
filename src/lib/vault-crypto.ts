// Browser-side vault cryptography (M20). The vault key is generated here, never sent to the
// server, and either kept on the device, written as a recovery link, or wrapped with a key the
// passkey derives (WebAuthn PRF) so a synced passkey can unlock the vault on a new device.
import {decodeBase64url,encodeBase64url,TransferError} from './transfer-crypto.ts';

export const VAULT_ENVELOPE_VERSION=1;
export const MAX_VAULT_BYTES=256*1024;
const IV_BYTES=12,TAG_BYTES=16,KEY_BYTES=32;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
// Fixed PRF input: the authenticator mixes it with its own secret, so a constant is correct here.
export const PRF_SALT=Uint8Array.from([0x63,0x6c,0x61,0x69,0x6d,0x63,0x6c,0x6f,0x63,0x6b,0x2d,0x76,0x61,0x75,0x6c,0x74,0x2d,0x70,0x72,0x66,0x2d,0x76,0x31,0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88]);
const HKDF_INFO=encoder.encode('claimclock-vault-wrap-v1');
export class VaultCryptoError extends Error {
 readonly kind:'invalid'|'large'|'decrypt'|'unsupported';
 constructor(kind:VaultCryptoError['kind']){super(`Vault ${kind}`);this.name='VaultCryptoError';this.kind=kind;}
}
function webCrypto():Crypto{if(!globalThis.crypto?.subtle)throw new VaultCryptoError('unsupported');return globalThis.crypto;}
function bytesOf(text:string,maxBytes:number):Uint8Array<ArrayBuffer>{try{return decodeBase64url(text,maxBytes);}catch(error){if(error instanceof TransferError&&error.kind==='unsupported')throw new VaultCryptoError('unsupported');throw new VaultCryptoError('invalid');}}
export function generateVaultKey():string{return encodeBase64url(webCrypto().getRandomValues(new Uint8Array(KEY_BYTES)));}
/** Validates a vault key's canonical text form and returns it unchanged. */
export function normalizeVaultKey(key:string):string{const bytes=bytesOf(key.trim(),KEY_BYTES);if(bytes.length!==KEY_BYTES)throw new VaultCryptoError('invalid');return key.trim();}
async function aesKey(raw:Uint8Array<ArrayBuffer>,usage:KeyUsage):Promise<CryptoKey>{return webCrypto().subtle.importKey('raw',raw,{name:'AES-GCM'},false,[usage]);}
async function seal(plain:Uint8Array<ArrayBuffer>,raw:Uint8Array<ArrayBuffer>,maxBytes:number):Promise<string> {
 if(plain.byteLength+1+IV_BYTES+TAG_BYTES>maxBytes)throw new VaultCryptoError('large');
 const crypto=webCrypto(),iv=crypto.getRandomValues(new Uint8Array(IV_BYTES));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},await aesKey(raw,'encrypt'),plain));
 const envelope=new Uint8Array(1+IV_BYTES+encrypted.length);envelope[0]=VAULT_ENVELOPE_VERSION;envelope.set(iv,1);envelope.set(encrypted,1+IV_BYTES);
 return encodeBase64url(envelope);
}
async function open(ciphertext:string,raw:Uint8Array<ArrayBuffer>,maxBytes:number):Promise<Uint8Array<ArrayBuffer>> {
 const envelope=bytesOf(ciphertext,maxBytes);
 if(envelope.length<1+IV_BYTES+TAG_BYTES+1||envelope[0]!==VAULT_ENVELOPE_VERSION)throw new VaultCryptoError('invalid');
 try{return new Uint8Array(await webCrypto().subtle.decrypt({name:'AES-GCM',iv:envelope.slice(1,1+IV_BYTES),tagLength:128},await aesKey(raw,'decrypt'),envelope.slice(1+IV_BYTES)));}
 catch(error){if(error instanceof VaultCryptoError)throw error;throw new VaultCryptoError('decrypt');}
}
export async function encryptVault(plaintext:string,key:string):Promise<string>{return seal(encoder.encode(plaintext),bytesOf(normalizeVaultKey(key),KEY_BYTES),MAX_VAULT_BYTES);}
export async function decryptVault(ciphertext:string,key:string):Promise<string> {
 const plain=await open(ciphertext,bytesOf(normalizeVaultKey(key),KEY_BYTES),MAX_VAULT_BYTES);
 try{return decoder.decode(plain);}catch{throw new VaultCryptoError('decrypt');}
}
/** HKDF-SHA256 over the authenticator's PRF output yields the wrapping key; the output itself is never stored. */
async function wrappingKey(prfOutput:Uint8Array<ArrayBuffer>):Promise<Uint8Array<ArrayBuffer>> {
 if(prfOutput.byteLength<32)throw new VaultCryptoError('invalid');
 const crypto=webCrypto(),material=await crypto.subtle.importKey('raw',prfOutput,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:PRF_SALT,info:HKDF_INFO},material,256));
}
export async function wrapVaultKey(key:string,prfOutput:Uint8Array<ArrayBuffer>):Promise<string>{return seal(bytesOf(normalizeVaultKey(key),KEY_BYTES),await wrappingKey(prfOutput),400);}
export async function unwrapVaultKey(wrapped:string,prfOutput:Uint8Array<ArrayBuffer>):Promise<string> {
 const raw=await open(wrapped,await wrappingKey(prfOutput),400);
 if(raw.length!==KEY_BYTES)throw new VaultCryptoError('decrypt');
 return encodeBase64url(raw);
}
/** The recovery link carries the key in the URL fragment, which browsers never send to a server. */
export function recoveryLink(key:string,origin:string):string {
 const url=new URL('/vault/',origin);if(!['http:','https:'].includes(url.protocol))throw new VaultCryptoError('invalid');
 url.hash=`recover=${normalizeVaultKey(key)}`;return url.href;
}
export function parseRecoveryInput(input:string):string {
 let text=input.trim();if(text.length>2048)throw new VaultCryptoError('invalid');
 if(/^https?:\/\//i.test(text)){let url:URL;try{url=new URL(text);}catch{throw new VaultCryptoError('invalid');}text=url.hash;}
 if(text.startsWith('#recover='))text=text.slice('#recover='.length);
 return normalizeVaultKey(text);
}
