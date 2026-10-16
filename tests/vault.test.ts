import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePolicyText,parseIndianDate,parseRupees} from '../src/lib/policy-parser.ts';
import {parseVault,emptyVault,selectPolicy,continuityMonths,indisputabilityMonths,daysUntilRenewal,monthsBetween,plans,type Vault,type Policy} from '../src/lib/vault.ts';
import {generateVaultKey,encryptVault,decryptVault,wrapVaultKey,unwrapVaultKey,recoveryLink,parseRecoveryInput,normalizeVaultKey,VaultCryptoError,MAX_VAULT_BYTES} from '../src/lib/vault-crypto.ts';
import {personalize,identityFor,PLACEHOLDERS} from '../src/lib/identity.ts';
import type {Letter} from '../src/lib/types.ts';

const schedule=`HDFC ERGO General Insurance Company Limited
Policy Schedule — my:Optima Secure
Policy No.: 2825 2034 5678 9000 000
Policy Period: From 12/05/2023 to 11/05/2024 (Midnight)
Date of First Policy with the Company: 12/05/2021
Sum Insured: Rs. 10,00,000
Room Rent: At Actuals
Co-payment: Nil
Insured Person Details
1 | Ramesh Kumar | Self | 12/03/1980
2 | Sunita Kumar | Spouse | 05/08/1984
3 | Aarav Kumar | Son | 20/01/2012
UHID: HDF/2023/00042`;
const starCis=`Star Health and Allied Insurance Co. Ltd.
CUSTOMER INFORMATION SHEET — Senior Citizens Red Carpet Health Insurance Policy
Policy Number: P/700001/01/2025/012345
Period of Insurance: 01-Oct-2025 to 30-Sep-2026
Sum Insured Rs. 5 Lakhs
Room rent: Rs. 1,000/- per day
Co-payment 30% of each and every claim
Name of the Insured: Mrs. Kamla Devi (Age 68 years, DOB 11/11/1957)`;

test('policy parser reads insurer, plan, number, dates, sum insured, room rule, co-pay and members from an HDFC-style schedule',()=>{
 const parsed=parsePolicyText(schedule);
 assert.equal(parsed.insurerId,'hdfc-ergo');assert.equal(parsed.planId,'hdfc-ergo-optima-secure');assert.equal(parsed.planName,'my:Optima Secure');
 assert.equal(parsed.policyNumber,'2825 2034 5678 9000 000');
 assert.equal(parsed.inceptionDate,'2023-05-12');assert.equal(parsed.renewalDate,'2024-05-11');assert.equal(parsed.continuityFrom,'2021-05-12');
 assert.equal(parsed.sumInsured,1000000);assert.equal(parsed.roomRent,'At Actuals');assert.equal(parsed.copayPercent,0);
 assert.equal(parsed.uhid,'HDF/2023/00042');
 assert.deepEqual(parsed.members.map(m=>[m.name,m.relation]),[['Ramesh Kumar','self'],['Sunita Kumar','spouse'],['Aarav Kumar','child']]);
 assert.deepEqual(parsed.warnings,[]);
});
test('policy parser handles lakh amounts, month-name dates, percentage co-pay and a titled single insured',()=>{
 const parsed=parsePolicyText(starCis);
 assert.equal(parsed.insurerId,'star-health');assert.equal(parsed.planId,'star-senior-citizens-red-carpet');
 assert.equal(parsed.policyNumber,'P/700001/01/2025/012345');assert.equal(parsed.sumInsured,500000);
 assert.equal(parsed.inceptionDate,'2025-10-01');assert.equal(parsed.renewalDate,'2026-09-30');assert.equal(parsed.continuityFrom,undefined);
 assert.equal(parsed.copayPercent,30);assert.match(parsed.roomRent!,/1,000/);
 assert.deepEqual(parsed.members,[{name:'Kamla Devi',birthYear:1957}]);
});
test('policy parser reports what it could not find instead of guessing',()=>{
 const parsed=parsePolicyText('Thank you for choosing us. Terms and conditions apply.');
 assert.deepEqual(parsed.warnings,['insurer','policyNumber','sumInsured','inceptionDate','members']);
 assert.equal(parsed.policyNumber,undefined);
 assert.equal(parseIndianDate('31/02/2024'),null);assert.equal(parseIndianDate('5 Sept 2024'),'2024-09-05');assert.equal(parseIndianDate('2024-13-01'),null);
 assert.equal(parseRupees('₹ 1 Cr'),10000000);assert.equal(parseRupees('Rs 7.5 Lakh'),750000);assert.equal(parseRupees('Rs 500'),undefined);
});

const member={id:'m1',name:'Ramesh Kumar',relation:'self' as const};
const policy:Policy={id:'p1',kind:'health',insurerId:'hdfc-ergo',planId:'hdfc-ergo-optima-secure',policyNumber:'2825-1',sumInsured:1000000,inceptionDate:'2023-05-12',continuityFrom:'2021-05-12',renewalDate:'2027-05-11',memberIds:['m1'],claimNumber:'CLM-77'};
const vault=():Vault=>({...emptyVault(),profile:{name:'Ramesh Kumar',city:'Pune',language:'en'},members:[member],policies:[policy],defaultPolicyId:'p1'});

test('vault parsing is strict: unknown fields, unknown insurers or plans, dangling members and oversized content are rejected',()=>{
 assert.equal(parseVault(vault()).policies[0].continuityFrom,'2021-05-12');
 for(const broken of [
  {...vault(),extra:1},
  {...vault(),policies:[{...policy,insurerId:'invented'}]},
  {...vault(),policies:[{...policy,planId:'invented-plan'}]},
  {...vault(),policies:[{...policy,memberIds:['ghost']}]},
  {...vault(),policies:[{...policy,inceptionDate:'2023-02-30'}]},
  {...vault(),policies:[{...policy,continuityFrom:'2024-01-01'}]},
  {...vault(),defaultPolicyId:'missing'},
  {...vault(),members:[{...member,relation:'cousin'}]},
  {...vault(),profile:{name:'x'.repeat(101),city:'',language:'en'}},
  {...vault(),members:Array.from({length:21},(_,i)=>({...member,id:`m${i}`}))},
 ])assert.throws(()=>parseVault(broken));
 assert.ok(plans.some(p=>p.id==='hdfc-ergo-optima-secure'));
});
test('continuity, indisputability and renewal arithmetic use day-first calendar months',()=>{
 const now=new Date('2026-10-16T00:00:00Z');
 assert.equal(monthsBetween('2021-05-12',now),65);assert.equal(monthsBetween('2026-09-17',now),0);assert.equal(monthsBetween('2026-09-16',now),1);
 assert.equal(continuityMonths(policy,now),65);assert.equal(continuityMonths({...policy,continuityFrom:undefined},now),41);assert.equal(continuityMonths({...policy,inceptionDate:undefined,continuityFrom:undefined},now),null);
 assert.equal(indisputabilityMonths('health'),60);assert.equal(indisputabilityMonths('life'),36);assert.equal(indisputabilityMonths('motor'),null);
 assert.equal(daysUntilRenewal(policy,now),207);assert.equal(daysUntilRenewal({...policy,renewalDate:undefined},now),null);
});
test('policy selection prefers the matching insurer, then the default, and never pre-fills an unlisted insurer with the wrong policy',()=>{
 const second:Policy={...policy,id:'p2',insurerId:'star-health',policyNumber:'STAR-9'};
 const v={...vault(),policies:[policy,second]};
 assert.equal(selectPolicy(v,'star-health')?.id,'p2');assert.equal(selectPolicy(v,'hdfc-ergo')?.id,'p1');assert.equal(selectPolicy(v,'care'),null);
 assert.equal(selectPolicy(v,'unlisted')?.id,'p1','the default policy applies when the case insurer is not listed');
 assert.equal(selectPolicy({...v,defaultPolicyId:null},'unlisted'),null);assert.equal(selectPolicy(null,'hdfc-ergo'),null);
});
test('letters are personalised from the vault in both languages, leaving unknown fields as placeholders',()=>{
 const identity=identityFor(vault(),'hdfc-ergo');
 assert.deepEqual(identity,{name:'Ramesh Kumar',policyNumber:'2825-1',claimNumber:'CLM-77'});
 const letter:Letter={id:'x',kind:'gro',language:'en',generatedAt:'',subject:'s',body:'Name: [Your name]\nPolicy number: [Policy number]\nClaim number: [Claim number]\nUHID [UHID]\nPatient name: [Patient name]',ruleIds:[]};
 const filled=personalize(letter,identity);
 assert.equal(filled.body,'Name: Ramesh Kumar\nPolicy number: 2825-1\nClaim number: CLM-77\nUHID [UHID]\nPatient name: [Patient name]');
 const hindi=personalize({...letter,language:'hi',body:'नाम: [आपका नाम]\nपॉलिसी संख्या: [पॉलिसी संख्या]\nदावा संख्या: [दावा संख्या]\nपॉलिसी / दावा संख्या: [पॉलिसी / दावा संख्या]'},identity);
 assert.equal(hindi.body,'नाम: Ramesh Kumar\nपॉलिसी संख्या: 2825-1\nदावा संख्या: CLM-77\nपॉलिसी / दावा संख्या: 2825-1 / CLM-77');
 assert.equal(personalize(letter,{}).body,letter.body);
 assert.ok(PLACEHOLDERS.every(p=>p.en.startsWith('[')&&p.hi.startsWith('[')));
 assert.equal(personalize({...letter,body:'Name: [Your name]'},{name:'Ravi [Policy number]'}).body,'Name: Ravi [Policy number]','substituted values are inserted literally, never re-expanded');
});
test('vault envelopes round-trip, reject the wrong key, bound size and carry the version byte; PRF wrapping unlocks the same key',async()=>{
 const key=generateVaultKey();assert.equal(normalizeVaultKey(` ${key} `),key);
 const plaintext=JSON.stringify(vault());
 const ciphertext=await encryptVault(plaintext,key);
 assert.notEqual(ciphertext,plaintext);assert.equal(await decryptVault(ciphertext,key),plaintext);
 await assert.rejects(()=>decryptVault(ciphertext,generateVaultKey()),(e:VaultCryptoError)=>e.kind==='decrypt');
 await assert.rejects(()=>decryptVault('AAAA',key),(e:VaultCryptoError)=>e.kind==='invalid');
 await assert.rejects(()=>encryptVault('x'.repeat(MAX_VAULT_BYTES),key),(e:VaultCryptoError)=>e.kind==='large');
 assert.throws(()=>normalizeVaultKey('short'),(e:VaultCryptoError)=>e.kind==='invalid');
 const prf=crypto.getRandomValues(new Uint8Array(32));
 const wrapped=await wrapVaultKey(key,prf);
 assert.ok(wrapped.length>=40&&wrapped.length<=400);
 assert.equal(await unwrapVaultKey(wrapped,prf),key);
 await assert.rejects(()=>unwrapVaultKey(wrapped,crypto.getRandomValues(new Uint8Array(32))),(e:VaultCryptoError)=>e.kind==='decrypt');
 const link=recoveryLink(key,'https://claimclock.example');
 assert.equal(link,`https://claimclock.example/vault/#recover=${key}`);
 assert.equal(parseRecoveryInput(link),key);assert.equal(parseRecoveryInput(`#recover=${key}`),key);assert.equal(parseRecoveryInput(key),key);
 assert.throws(()=>parseRecoveryInput('https://claimclock.example/vault/?recover=abc'));
});
