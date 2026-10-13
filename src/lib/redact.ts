export function knownIdentifiers(raw:string):string[] {
 const found:string[]=[];
 for(const match of raw.matchAll(/(?:patient\s*(?:name)?|insured\s*(?:name)?|name|policy\s*(?:no\.?|number|id)|uhid|claim\s*(?:no\.?|number|id))\s*[:#-]\s*([^\n\r|;]{3,70})/gi))found.push(match[1].trim());
 return found;
}
export function redact(text:string,identifiers:string[]=[]):string {
 let result=text;
 for(const value of [...identifiers].sort((a,b)=>b.length-a.length)){
  if(value.length>=3)result=result.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[REDACTED]');
 }
 return result
  .replace(/(?:patient\s*(?:name)?|insured\s*(?:name)?|name|policy\s*(?:no\.?|number|id)?|uhid|claim\s*(?:no\.?|number|id)?|dob|date of birth|address)\s*[:#-]\s*[^\n\r|;]+/gi,'[IDENTIFIER REDACTED]')
  .replace(/\b(?:Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g,'[NAME REDACTED]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL REDACTED]')
  .replace(/(?:\+91[\s-]?)?[6-9]\d{9}\b/g,'[PHONE REDACTED]')
  .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,'[ID REDACTED]')
  .replace(/\b(?!\d{1,3}-(?:month|months|day|days|hour|hours|year|years|week|weeks|bed|bedded|page|pages|tier|wheeler)\b)(?=[A-Z0-9/-]{8,}\b)(?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{7,}\b/gi,'[ID REDACTED]')
  .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,'[DATE REDACTED]')
  .slice(0,800);
}
