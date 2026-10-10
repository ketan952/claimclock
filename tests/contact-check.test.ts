import test from 'node:test';
import assert from 'node:assert/strict';
import {assertions, contactPresent, renewVerifiedFields} from '../scripts/check-contacts.mjs';

const provenance = (url: string) => ({source_url:url,verified_on:'2026-10-01',evidence:'Grievance Redressal Officer'});
function record() {
  return {id:'synthetic',source_url:'https://insurer.example/grievance',verified_on:'2026-10-01',
    gro_email:'gro@insurer.example',field_sources:{gro_email:provenance('https://insurer.example/gro')},
    own_page:{verified_on:'2026-10-01'},
    escalation_levels:[{role:'Grievance Redressal Officer',email:'level@insurer.example',phone:'04443664600',verified_on:'2026-10-01',source_url:'https://insurer.example/levels',field_sources:{role:provenance('https://insurer.example/roles'),email:provenance('https://insurer.example/email'),phone:provenance('https://insurer.example/phone')}}],
    irdai_baseline:{gro_email:'legacy@insurer.example',source_url:'https://irdai.gov.in/list-of-gros',verified_on:'2026-10-01',field_sources:{gro_email:provenance('https://irdai.gov.in/list-of-gros')}}};
}
test('contact checker covers insurer fields, role evidence and regulator baseline with field-specific URLs',()=>{
  const checks=assertions(record());
  assert.equal(checks.length,5);
  assert.equal(checks.find(c=>c.field==='escalation_levels[0].phone')?.source,'https://insurer.example/phone');
  assert.equal(checks.find(c=>c.field==='irdai_baseline.gro_email')?.value,'legacy@insurer.example');
  assert.equal(checks.find(c=>c.field==='escalation_levels[0].role')?.kind,'text');
});
test('partial source success renews only verified fields and leaves role/page/overall dates unchanged',()=>{
  const c=record();renewVerifiedFields(c,['escalation_levels[0].email'],'2026-10-10');
  assert.equal(c.escalation_levels[0].field_sources.email.verified_on,'2026-10-10');
  assert.equal(c.escalation_levels[0].field_sources.phone.verified_on,'2026-10-01');
  assert.equal(c.escalation_levels[0].verified_on,'2026-10-01');
  assert.equal(c.verified_on,'2026-10-01');assert.equal(c.own_page.verified_on,'2026-10-01');
});
test('complete content verification renews public values, never relabels the original browser audit',()=>{
  const c=record();renewVerifiedFields(c,assertions(c).map(x=>x.field),'2026-10-10');
  assert.equal(c.verified_on,'2026-10-10');assert.equal(c.irdai_baseline.verified_on,'2026-10-10');
  assert.equal(c.escalation_levels[0].verified_on,'2026-10-10');assert.equal(c.own_page.verified_on,'2026-10-01');
});
test('contact matching handles published obfuscation and Unicode phone separators without substring false positives',()=>{
  assert.equal(contactPresent('Support: csd[at]orientalinsurance[dot]co[dot]in','csd@orientalinsurance.co.in','email'),true);
  assert.equal(contactPresent('Grievance Helpline: 044‑4366 4600','04443664600','phone'),true);
  assert.equal(contactPresent('Email oldgro@insurer.example','gro@insurer.example','email'),false);
  assert.equal(contactPresent('Reference 1180012345','180012345','phone'),false);
  assert.equal(contactPresent('Access denied — HTTP 200','gro@insurer.example','email'),false);
});
