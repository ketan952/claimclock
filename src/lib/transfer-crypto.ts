import {parseBackup,type CaseBackup} from './backup.ts';

export const MAX_TRANSFER_BYTES=65_536;
export const TRANSFER_VERSION=1;
const IV_BYTES=12,TAG_BYTES=16,KEY_BYTES=32;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
export class TransferError extends Error {
 readonly kind:'invalid'|'large'|'decrypt'|'unsupported';
 constructor(kind:TransferError['kind']){super(`Transfer ${kind}`);this.name='TransferError';this.kind=kind;}
}
export function encodeBase64url(bytes:Uint8Array):string {
 let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
 return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
/** Accept exactly one canonical, unpadded representation, before allocating. */
export function decodeBase64url(text:string,maxBytes=MAX_TRANSFER_BYTES):Uint8Array<ArrayBuffer> {
 if(!text||text.length>Math.ceil(maxBytes*4/3)||!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)throw new TransferError('invalid');
 let binary:string;try{binary=atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4));}catch{throw new TransferError('invalid');}
 const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
 if(bytes.length>maxBytes||encodeBase64url(bytes)!==text)throw new TransferError('invalid');
 return bytes;
}
function keyBytes(key:string):Uint8Array<ArrayBuffer>{const bytes=decodeBase64url(key,KEY_BYTES);if(bytes.length!==KEY_BYTES)throw new TransferError('invalid');return bytes;}
function webCrypto():Crypto{if(!globalThis.crypto?.subtle)throw new TransferError('unsupported');return globalThis.crypto;}
export async function encryptBackup(value:CaseBackup):Promise<{ciphertext:string;key:string}> {
 const backup=parseBackup(value),plain=encoder.encode(JSON.stringify(backup));
 if(plain.byteLength+1+IV_BYTES+TAG_BYTES>MAX_TRANSFER_BYTES)throw new TransferError('large');
 const crypto=webCrypto(),rawKey=crypto.getRandomValues(new Uint8Array(KEY_BYTES)),iv=crypto.getRandomValues(new Uint8Array(IV_BYTES));
 const key=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},key,plain));
 const envelope=new Uint8Array(1+IV_BYTES+encrypted.length);envelope[0]=TRANSFER_VERSION;envelope.set(iv,1);envelope.set(encrypted,1+IV_BYTES);
 return{ciphertext:encodeBase64url(envelope),key:encodeBase64url(rawKey)};
}
export async function decryptBackup(ciphertext:string,privateKey:string):Promise<CaseBackup> {
 const envelope=decodeBase64url(ciphertext),rawKey=keyBytes(privateKey);
 if(envelope.length<1+IV_BYTES+TAG_BYTES+1||envelope[0]!==TRANSFER_VERSION)throw new TransferError('invalid');
 try{
  const crypto=webCrypto(),key=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:envelope.slice(1,1+IV_BYTES),tagLength:128},key,envelope.slice(1+IV_BYTES));
  return parseBackup(JSON.parse(decoder.decode(plain)));
 }catch(error){if(error instanceof TransferError&&error.kind==='unsupported')throw error;throw new TransferError('decrypt');}
}
export type TransferReference={code:string;key:string};
export function parseTransferReference(input:string,separateKey=''):TransferReference {
 let text=input.trim();
 if(text.length>2048)throw new TransferError('invalid');
 if(/^https?:\/\//i.test(text)){
  let url:URL;try{url=new URL(text);}catch{throw new TransferError('invalid');}
  if(!url.hash.startsWith('#transfer='))throw new TransferError('invalid');
  text=url.hash.slice('#transfer='.length);
 }else if(text.startsWith('#transfer='))text=text.slice('#transfer='.length);
 const parts=text.split('.');
 const code=parts[0]?.toUpperCase(),key=parts.length===2?parts[1]:separateKey.trim();
 if(parts.length>2||!code||!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)||!key||(parts.length===2&&separateKey.trim()&&separateKey.trim()!==key))throw new TransferError('invalid');
 keyBytes(key);return{code,key};
}
export function transferLink(reference:TransferReference,origin:string):string {
 const checked=parseTransferReference(`${reference.code}.${reference.key}`),url=new URL('/',origin);
 if(!['http:','https:'].includes(url.protocol))throw new TransferError('invalid');
 url.hash=`transfer=${checked.code}.${checked.key}`;return url.href;
}
