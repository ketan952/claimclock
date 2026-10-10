import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyCompatibility} from '../scripts/check-release-licenses.mjs';
const lock=readFileSync(new URL('../package-lock.json',import.meta.url));
const review=JSON.parse(readFileSync(new URL('../research/license-compatibility.json',import.meta.url),'utf8'));
test('reviewed AGPL-compatible snapshot passes without a known-failure exception',()=>{assert.equal(verifyCompatibility(lock,review).status,'PASS');});
test('dependency changes and unreviewed licenses fail the release gate',()=>{
 assert.throws(()=>verifyCompatibility(Buffer.concat([lock,Buffer.from(' ')]),review),/snapshot changed/);
 const changed=JSON.parse(lock.toString());changed.packages['node_modules/example-license-test']={version:'1',license:'UNKNOWN'};const bytes=Buffer.from(JSON.stringify(changed));
 assert.throws(()=>verifyCompatibility(bytes,{...review,package_lock_sha256:createHash('sha256').update(bytes).digest('hex')}),/Unreviewed license/);
});
