import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditLicenseSnapshot,writeLicenseAudit} from './audit-licenses.mjs';

export function verifyReleaseApproval(lockBytes,approval){
  if(approval?.scope!=='existing-dependency-snapshot-for-deployment'||approval?.approved_by!=='user'||approval?.authorization!=='Allow the existing dependencies for this deployment'){
    throw new Error('Release blocked: a recorded user approval for this dependency snapshot is required.');
  }
  const actual=createHash('sha256').update(lockBytes).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(approval.package_lock_sha256)||actual!==approval.package_lock_sha256){
    throw new Error('Release blocked: package-lock.json differs from the user-approved snapshot. Review changed dependencies and obtain a new explicit approval.');
  }
  return actual;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const lockBytes=await readFile('package-lock.json');
    const approval=JSON.parse(await readFile('research/dependency-release-approval.json','utf8'));
    const hash=verifyReleaseApproval(lockBytes,approval);
    const report=auditLicenseSnapshot(JSON.parse(lockBytes.toString('utf8')));
    await writeLicenseAudit(report);
    console.log(`Release license gate PASS: user-approved dependency snapshot ${hash}.`);
    console.log(`Strict audit remains ${report.exceptions.length?'BLOCKED':'PASS'} (${report.exceptions.length} entries outside the unchanged allowlist).`);
    console.log(`Approval includes existing embedded runtime components; see ${approval.assessment}. Upstream licenses and notices still apply.`);
  }catch(error){
    console.error(error.message);
    process.exitCode=1;
  }
}
