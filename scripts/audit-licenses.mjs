import {readFile,writeFile,mkdir} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const allowed=new Set(['MIT','Apache-2.0','AGPL-3.0','AGPL-3.0-only','MIT OR Apache-2.0','(MIT OR Apache-2.0)','(MIT OR CC0-1.0)']);
const exceptions=Object.entries(lock.packages).filter(([path])=>path).filter(([,p])=>!allowed.has(p.license)).map(([path,p])=>({package:path.replace(/^node_modules\//,''),version:p.version,license:p.license||'UNKNOWN',dev:!!p.dev,optional:!!p.optional}));
await mkdir('research',{recursive:true});
await writeFile('research/dependency-license-audit.json',JSON.stringify({generated_on:'2026-10-10',status:exceptions.length?'BLOCKED: required stack has dependencies outside user allowlist':'PASS',allowlist:[...allowed],exceptions},null,2)+'\n');
console.log(`${exceptions.length} lockfile entries outside MIT/Apache-2.0/AGPL-3.0 allowlist (includes optional platform builds).`);
if(exceptions.length)process.exitCode=1;
