/** Check published values, never infer contact verification from HTTP success. */
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const MAX_BYTES = 12 * 1024 * 1024;

export function normalizeText(value) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&')
    .replace(/\[at\]/gi, '@').replace(/\[dot\]/gi, '.').replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ').toLowerCase();
}
export function contactPresent(content, value, kind) {
  const text = normalizeText(content);
  if (kind === 'text') return text.includes(normalizeText(value));
  if (kind === 'email') return (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []).includes(value.trim().toLowerCase());
  const phones = value.split(/[,;/]|\bor\b/i).map(v => v.replace(/[^\d]/g, '')).filter(Boolean);
  if (!phones.length) return false;
  // Match the exact digit sequence with optional formatting, without greedily
  // consuming a following opening-hour value or numbered table row.
  return phones.every(phone => {
    const variants = [phone, ...(phone.startsWith('91') ? [phone.slice(2)] : [`91${phone}`])];
    return variants.some(digits => new RegExp(`(?<!\\d)${digits.split('').join('[\\s().-]*')}(?!\\d)`).test(text));
  });
}
async function loadSource(rawUrl, allowedHosts) {
  let url = new URL(rawUrl);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.has(url.hostname.replace(/^www\./, ''))) throw new Error('Source or redirect is not an approved primary-source host.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'ClaimClock-contact-verification/1.0 (public source check)' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const target = response.headers.get('location'); if (!target) throw new Error('Redirect has no destination.'); url = new URL(target, url); continue; }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('Source is too large for automated verification.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body ?? []) { size += chunk.length; if (size > MAX_BYTES) throw new Error('Source is too large for automated verification.'); chunks.push(chunk); }
    const buffer = Buffer.concat(chunks);
    if (buffer.subarray(0, 5).toString() === '%PDF-') {
      const directory = await mkdtemp(join(tmpdir(), 'claimclock-contact-'));
      try { const file = join(directory, 'source.pdf'); await writeFile(file, buffer); let result;
        try { result = await execute('pdftotext', ['-layout', file, '-'], { maxBuffer: MAX_BYTES, timeout: 20000 }); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const localPython = fileURLToPath(new URL('../.cache/research/venv/bin/python', import.meta.url));
          const python = process.env.CLAIMCLOCK_PYTHON ?? await access(localPython).then(() => localPython, () => 'python3');
          // Optional pre-existing build-time tooling; never installs a dependency or runs at runtime.
          result = await execute(python, ['-c', 'import fitz,sys; doc=fitz.open(sys.argv[1]); print("\\n".join(page.get_text() for page in doc))', file], { maxBuffer: MAX_BYTES, timeout: 20000 });
        }
        if (!result.stdout.trim()) throw new Error('PDF has no extractable text; manual verification needed.'); return result.stdout; }
      finally { await rm(directory, { recursive: true, force: true }); }
    }
    if (!/text\/|json|html|xml/i.test(response.headers.get('content-type') ?? '')) throw new Error('Source content type is not supported.');
    return buffer.toString('utf8');
  }
  throw new Error('Too many source redirects.');
}
export function assertions(contact) {
  const values = [];
  for (const field of ['gro_email', 'gro_phone', 'helpline', 'claims_email']) {
    if (!contact[field]) continue;
    values.push({ field, value: contact[field], kind: field.includes('email') ? 'email' : 'phone', source: contact.field_sources?.[field]?.source_url ?? contact.source_url, provenance: contact.field_sources?.[field] });
  }
  for (const [index, level] of (contact.escalation_levels ?? []).entries()) for (const field of ['role', 'email', 'phone']) if (level[field]) {
    const provenance = level.field_sources?.[field];
    values.push({ field: `escalation_levels[${index}].${field}`, value: field === 'role' ? provenance?.evidence ?? level.role : level[field], kind: field === 'role' ? 'text' : field, source: provenance?.source_url ?? level.source_url ?? contact.source_url, provenance });
  }
  for (const field of ['gro_email', 'gro_phone']) if (contact.irdai_baseline?.[field]) {
    const provenance = contact.irdai_baseline.field_sources?.[field];
    values.push({ field: `irdai_baseline.${field}`, value: contact.irdai_baseline[field], kind: field.includes('email') ? 'email' : 'phone', source: provenance?.source_url ?? contact.irdai_baseline.source_url, provenance });
  }
  return values;
}
/** Renew only values whose source content matched; browser audit dates stay immutable. */
export function renewVerifiedFields(contact, confirmed, checkedOn) {
  const checks = assertions(contact), matched = new Set(confirmed);
  for (const check of checks) if (matched.has(check.field) && check.provenance) check.provenance.verified_on = checkedOn;
  if (checks.length && checks.every(check => matched.has(check.field))) contact.verified_on = checkedOn;
  for (const [index, level] of (contact.escalation_levels ?? []).entries()) {
    const own = checks.filter(check => check.field.startsWith(`escalation_levels[${index}].`));
    if (own.length && own.every(check => matched.has(check.field))) level.verified_on = checkedOn;
  }
  const baseline = checks.filter(check => check.field.startsWith('irdai_baseline.'));
  if (baseline.length && baseline.every(check => matched.has(check.field))) contact.irdai_baseline.verified_on = checkedOn;
}
async function reviewIssue(failures, checkedOn) {
  // Only the explicitly authorized scheduled workflow enables this path.
  const token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY;
  if (!token || repository !== 'ketan952/claimclock') throw new Error('Contact issues are restricted to the personal project repository.');
  const root = `https://api.github.com/repos/${repository}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
  const existingResponse = await fetch(`${root}/issues?state=open&per_page=100`, { headers });
  if (!existingResponse.ok) throw new Error('Could not inspect existing contact review issues.');
  const existing = await existingResponse.json();
  const title = 'Contact verification: primary-source review required';
  const body = [`Automated content check on ${checkedOn}. The previously verified contact values were not changed. HTTP success alone does not renew verification. A missing value may reflect extraction, bot blocking or a page change; review the linked primary source before changing the dataset.`, '', ...failures.map(f => `- **${f.id} — ${f.field}**: ${f.reason} [Primary source](${f.source})`)].join('\n');
  const issue = existing.find(i => i.title === title && !i.pull_request);
  const response = await fetch(issue ? `${root}/issues/${issue.number}` : `${root}/issues`, { method: issue ? 'PATCH' : 'POST', headers, body: JSON.stringify(issue ? { body } : { title, body }) });
  if (!response.ok) throw new Error('Could not create or update contact review issue.');
}
export async function checkContacts({ write = false, issues = false } = {}) {
  const file = new URL('../data/contacts.json', import.meta.url);
  const contacts = JSON.parse(await readFile(file, 'utf8'));
  const allowedHosts = new Set(contacts.flatMap(c => [c.source_url, c.insurer_url, ...assertions(c).map(a => a.source)]).filter(Boolean).map(u => new URL(u).hostname.replace(/^www\./, '')));
  const sources = new Map(), failures = [], checkedOn = new Date().toISOString().slice(0, 10);
  let verified = 0, checkedFields = 0, confirmedFields = 0;
  const confirmedContacts = [];
  for (const contact of contacts) {
    const checks = assertions(contact); let success = checks.length > 0;
    const confirmed = [];
    if (!checks.length) failures.push({ id: contact.id, field: 'all', source: contact.source_url, reason: 'No published email/phone is available to verify.' });
    for (const check of checks) {
      checkedFields++;
      if (!sources.has(check.source)) sources.set(check.source, loadSource(check.source, allowedHosts).then(text => ({ text }), error => ({ error: error.message })));
      const source = await sources.get(check.source);
      const reason = source.error ?? (contactPresent(source.text, check.value, check.kind) ? null : 'Published contact value was not found in extracted source text.');
      if (reason) { success = false; failures.push({ id: contact.id, field: check.field, source: check.source, reason }); }
      else { confirmedFields++; confirmed.push(check.field); }
    }
    if (success) {
      verified++;
      confirmedContacts.push({ id: contact.id, name: contact.name, kind: contact.kind, sources: [...new Set(checks.map(check => check.source))] });
    }
    if (write) renewVerifiedFields(contact, confirmed, checkedOn);
    // No whole-page hash comparison: ads, navigation and dynamic IDs are irrelevant.
  }
  if (write) await writeFile(file, JSON.stringify(contacts, null, 2) + '\n');
  const confirmedInsurers = confirmedContacts.filter(c => c.kind === 'insurer').length;
  const summary = { checked_on: checkedOn, contacts: contacts.length, renewed: write ? verified : 0, values_confirmed: verified, checked_fields: checkedFields, confirmed_fields: confirmedFields, needs_review: failures, confirmed_contacts: confirmedContacts, confirmed_insurer_count: confirmedInsurers, ten_insurer_target_met: confirmedInsurers >= 10, read_only: !write, limitations: 'Automated primary-source content matching only; no calls or emails. A verified contact confirms publication, not operational response.' };
  console.log(JSON.stringify(summary, null, 2));
  if (issues && failures.length) await reviewIssue(failures, checkedOn);
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkContacts({ write: process.argv.includes('--write'), issues: process.argv.includes('--issues') }).catch(() => { console.error('Contact check failed. Existing verification dates must not be treated as refreshed.'); process.exitCode = 1; });
}
