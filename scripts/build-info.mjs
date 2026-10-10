import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// Content identity stays stable when only release evidence changes.
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p==='research/nl48-m10-qa.json'||/^(src|worker|data|scripts|migrations|templates|public)\//.test(p)||/^(package(-lock)?\.json|astro\.config\.mjs|wrangler\.jsonc|public\/_headers|public\/_redirects)$/.test(p)).sort();
const hash=createHash('sha256');
for(const path of [...new Set(files)]){try{hash.update(path);hash.update(readFileSync(path));}catch{/* Deleted tracked files are absent from this build. */}}
export const buildId=hash.digest('hex').slice(0,16);
