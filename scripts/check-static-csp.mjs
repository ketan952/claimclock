import {readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function auditHtml(html){
 const failures=[];
 for(const match of html.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)){
  const [,tag,attributes]=match;
  if(tag.toLowerCase()==='script'){
   const src=attributes.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
   const value=src?.[1]??src?.[2]??src?.[3];
   if(!value)failures.push('script without src');
   else if(/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value))failures.push('script src must be a same-site path');
  }
  if(/\son[a-z]+\s*=/i.test(attributes))failures.push(`inline event handler on ${tag}`);
  if(/\s(?:href|src|action)\s*=\s*["']?\s*javascript:/i.test(attributes))failures.push(`javascript URL on ${tag}`);
 }
 return failures;
}
async function htmlFiles(directory){const output=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())output.push(...await htmlFiles(path));else if(path.endsWith('.html'))output.push(path);}return output;}
export async function checkStaticCsp(directory='dist'){
 const files=await htmlFiles(directory),failures=[];
 for(const file of files)for(const issue of auditHtml(await readFile(file,'utf8')))failures.push(`${file}: ${issue}`);
 if(!files.length)throw Error('No built HTML files to audit');
 if(failures.length)throw Error(failures.join('\n'));
 return files.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(`CSP audit passed: ${await checkStaticCsp()} HTML pages; external scripts only, no inline handlers or javascript URLs.`);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
