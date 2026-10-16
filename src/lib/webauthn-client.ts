// Thin browser wrapper around navigator.credentials for passkeys (M20). Converts the
// server's base64url options to buffers and the authenticator's buffers back, and reads the
// optional PRF extension output that unlocks the vault without a password.
import {decodeBase64url,encodeBase64url} from './transfer-crypto.ts';
import {PRF_SALT} from './vault-crypto.ts';

export type CreationOptions={challenge:string;rp:{id:string;name:string};user:{id:string;name:string;displayName:string};pubKeyCredParams:{type:'public-key';alg:number}[];timeout:number;attestation:string;authenticatorSelection:Record<string,unknown>;extensions?:Record<string,unknown>};
export type RequestOptions={challenge:string;rpId:string;timeout:number;userVerification:string;allowCredentials:unknown[]};
export type CreatedPasskey={id:string;response:{clientDataJSON:string;attestationObject:string;transports:string[]};prfEnabled:boolean;prfOutput:Uint8Array<ArrayBuffer>|null};
export type AssertedPasskey={id:string;response:{clientDataJSON:string;authenticatorData:string;signature:string;userHandle:string|null};prfOutput:Uint8Array<ArrayBuffer>|null};
export class PasskeyError extends Error {
 readonly kind:'unsupported'|'cancelled'|'failed';
 constructor(kind:PasskeyError['kind']){super(`Passkey ${kind}`);this.name='PasskeyError';this.kind=kind;}
}
export function passkeysSupported():boolean{return typeof window!=='undefined'&&typeof window.PublicKeyCredential==='function'&&!!navigator.credentials?.create;}
export async function platformPasskeyAvailable():Promise<boolean> {
 if(!passkeysSupported())return false;
 try{return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();}catch{return false;}
}
const toBuffer=(text:string,max:number)=>decodeBase64url(text,max).buffer as ArrayBuffer;
const fromBuffer=(buffer:ArrayBuffer)=>encodeBase64url(new Uint8Array(buffer));
function prfResult(credential:PublicKeyCredential):{enabled:boolean;output:Uint8Array<ArrayBuffer>|null} {
 const results=credential.getClientExtensionResults() as {prf?:{enabled?:boolean;results?:{first?:ArrayBuffer}}};
 const first=results.prf?.results?.first;
 return {enabled:results.prf?.enabled===true||first instanceof ArrayBuffer,output:first instanceof ArrayBuffer&&first.byteLength>=32?new Uint8Array(first):null};
}
function translate(error:unknown):PasskeyError {
 if(error instanceof PasskeyError)return error;
 const name=error instanceof Error?error.name:'';
 if(name==='NotAllowedError'||name==='AbortError')return new PasskeyError('cancelled');
 if(name==='NotSupportedError'||name==='SecurityError')return new PasskeyError('unsupported');
 return new PasskeyError('failed');
}
export async function createPasskey(options:CreationOptions):Promise<CreatedPasskey> {
 if(!passkeysSupported())throw new PasskeyError('unsupported');
 try{
  const publicKey={
   challenge:toBuffer(options.challenge,64),rp:options.rp,
   user:{id:toBuffer(options.user.id,64),name:options.user.name,displayName:options.user.displayName},
   pubKeyCredParams:options.pubKeyCredParams,timeout:options.timeout,attestation:options.attestation,authenticatorSelection:options.authenticatorSelection,
   extensions:{credProps:true,prf:{eval:{first:PRF_SALT}}},
  } as unknown as PublicKeyCredentialCreationOptions;
  const credential=await navigator.credentials.create({publicKey}) as PublicKeyCredential|null;
  if(!credential)throw new PasskeyError('failed');
  const response=credential.response as AuthenticatorAttestationResponse;
  const transports=typeof response.getTransports==='function'?response.getTransports().filter(t=>/^[a-z-]{1,20}$/.test(t)).slice(0,8):[];
  const prf=prfResult(credential);
  return {id:credential.id,response:{clientDataJSON:fromBuffer(response.clientDataJSON),attestationObject:fromBuffer(response.attestationObject),transports},prfEnabled:prf.enabled,prfOutput:prf.output};
 }catch(error){throw translate(error);}
}
export async function getPasskey(options:RequestOptions,allowCredentialId?:string):Promise<AssertedPasskey> {
 if(!passkeysSupported())throw new PasskeyError('unsupported');
 try{
  const publicKey={
   challenge:toBuffer(options.challenge,64),rpId:options.rpId,timeout:options.timeout,userVerification:options.userVerification,
   allowCredentials:allowCredentialId?[{type:'public-key',id:toBuffer(allowCredentialId,1023)}]:[],
   extensions:{prf:{eval:{first:PRF_SALT}}},
  } as unknown as PublicKeyCredentialRequestOptions;
  const credential=await navigator.credentials.get({publicKey}) as PublicKeyCredential|null;
  if(!credential)throw new PasskeyError('failed');
  const response=credential.response as AuthenticatorAssertionResponse;
  return {id:credential.id,response:{clientDataJSON:fromBuffer(response.clientDataJSON),authenticatorData:fromBuffer(response.authenticatorData),signature:fromBuffer(response.signature),userHandle:response.userHandle?fromBuffer(response.userHandle):null},prfOutput:prfResult(credential).output};
 }catch(error){throw translate(error);}
}
