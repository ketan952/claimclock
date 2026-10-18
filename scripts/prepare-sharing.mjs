import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const origin='https://claimclock.ketan952.workers.dev';
const contacts=JSON.parse(await readFile('data/contacts.json','utf8')).filter(c=>c.kind==='insurer');
const rows=JSON.parse(await readFile('data/nl48.json','utf8'));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const wrap=(s,max=36)=>{const lines=[''];for(const word of s.split(' ')){if((lines.at(-1)+' '+word).length>max)lines.push(word);else lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;}return lines.slice(0,3);};
await mkdir('public/og',{recursive:true});
const coverage=new Set(rows.map(r=>r.insurer_id)).size;
for(const entry of [{id:'default',name:'A clock on your side',subtitle:'Keep your timeline. Prepare your next message.'},{id:'index',name:'Discharge Delay Index',subtitle:`Source-linked disclosures for ${coverage} of 32 insurers.`},...contacts.map(c=>({id:c.id,name:c.name,subtitle:rows.some(r=>r.insurer_id===c.id)?`Published disclosures · ${[...new Set(rows.filter(r=>r.insurer_id===c.id).map(r=>r.period))].join(' / ')}`:'Verified numeric disclosure pending.'}))]){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f6f5ef"/><rect x="0" width="18" height="630" fill="#183f35"/><circle cx="1090" cy="95" r="42" fill="none" stroke="#183f35" stroke-width="8"/><path d="M1090 68v29l20 12" fill="none" stroke="#183f35" stroke-width="8" stroke-linecap="round"/><g font-family="Arial,sans-serif" fill="#183f35"><text x="66" y="94" font-size="32" font-weight="700">ClaimClock</text><text x="66" y="148" font-size="20" letter-spacing="3">DISCHARGE DELAY INDEX</text>${wrap(entry.name).map((line,i)=>`<text x="66" y="${240+i*60}" font-size="48" font-weight="700">${esc(line)}</text>`).join('')}<text x="66" y="454" font-size="25">${esc(entry.subtitle)}</text><text x="66" y="502" font-size="23">The 2–6 hour bucket cannot establish 3-hour compliance.</text><text x="66" y="565" font-size="20">claimclock.ketan952.workers.dev${entry.id==='default'?'/':entry.id==='index'?'/index/':`/index/${entry.id}/`}</text></g></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(`public/og/${entry.id}.png`);
}
const icon=await readFile('public/icon.svg');
for(const [name,size]of[['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]])await sharp(icon).resize(size,size).png().toFile(`public/${name}`);
const png=await sharp(icon).resize(32,32).png().toBuffer();const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);await writeFile('public/favicon.ico',Buffer.concat([ico,png]));
const paths=['/','/about/','/privacy/','/methodology/','/deductions/','/rejected/','/death/','/vault/','/check-coverage/','/compare/','/renewal/','/reimbursement/','/index/',...contacts.map(c=>`/index/${c.id}/`)];
await writeFile('public/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>\n`);
await writeFile('public/robots.txt',`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Sharing assets: ${contacts.length+2} PNG cards; install icons; sitemap.`);
