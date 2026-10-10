import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditLicenseSnapshot,writeLicenseAudit} from './audit-licenses.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyCompatibility(lockBytes,review){
 if(review?.policy!=='user-requested-AGPL-compatible-dependency-review'||review?.assessment!=='docs/licenses.md')throw Error('License compatibility assessment missing.');
 if(hash(lockBytes)!==review.package_lock_sha256)throw Error('Dependency snapshot changed: review licenses and update the compatibility record.');
 const report=auditLicenseSnapshot(JSON.parse(lockBytes.toString('utf8')));
 const expressions=[...new Set(report.exceptions.map(e=>e.license))].sort();
 if(JSON.stringify(expressions)!==JSON.stringify(review.license_expressions))throw Error('Unreviewed license expression in dependency graph.');
 return{...report,status:'PASS',policy:review.policy,assessment:review.assessment,reviewed_on:review.reviewed_on,package_lock_sha256:review.package_lock_sha256};
}
export async function checkReleaseLicenses(){
 const review=JSON.parse(await readFile('research/license-compatibility.json','utf8'));
 const report=verifyCompatibility(await readFile('package-lock.json'),review);
 const assessment=await readFile(review.assessment,'utf8');
 if(assessment.length<1000||!assessment.includes('AGPL-3.0'))throw Error('Compatibility explanation missing or incomplete.');
 const manifestBytes=await readFile('third-party-notices/provenance.json');
 if(hash(manifestBytes)!==review.runtime_notices_manifest_sha256)throw Error('Runtime component inventory changed: review its licenses.');
 const manifest=JSON.parse(manifestBytes);
 for(const notice of manifest.entries){const bytes=await readFile(`third-party-notices/${notice.file}`);if(hash(bytes)!==notice.sha256)throw Error(`Missing or changed third-party notice: ${notice.file}`);}
 await writeLicenseAudit(report);
 console.log(`License gate PASS: locked dependencies, ${review.license_expressions.length} reviewed additional expressions and ${manifest.entries.length} verified runtime notices. Assessment: ${review.assessment}`);
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkReleaseLicenses().catch(error=>{console.error(error.message);process.exitCode=1;});
