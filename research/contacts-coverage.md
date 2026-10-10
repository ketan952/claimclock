# Verified contact coverage — ClaimClock

Content verified **10 October 2026 (Asia/Kolkata)**. `data/contacts.json` contains **49 entities: 32 insurers and 17 TPA records**. Each non-null contact field carries primary-source evidence and URL; English and Hindi names are supplied. No emails were sent and no calls were made. “Verified” means **published on the cited primary source**, not tested deliverability, current staffing, licensing status or a guaranteed response.

## Scope and source priority

The insurer scope is Indian retail hospital/health claim escalation, built from the current [IRDAI health insurer register](https://irdai.gov.in/list-of-health-insurers), [general insurer register](https://irdai.gov.in/list-of-general-insurers), and [GRO directory](https://irdai.gov.in/list-of-gros), supplemented by insurer grievance pages. All eight standalone health insurers listed during this review are included, including Galaxy, Narayana and the newly listed Prudential HCL. The other 24 insurer records are general insurers with relevant health-claim contacts. This is not a directory of life-policy benefit riders.

The [IRDAI TPA register](https://irdai.gov.in/list-of-tpas) supplied 17 current directory records, including renamed and legacy service entities; provider grievance pages supply the GRO where verifiable. The list is **not a count of 17 independent active licensed operators**: registries and provider pages retain merged and renamed records. The registry’s CEO/CAO email was never relabeled GRO. Licence-valid-until dates in the regulator directory can be historic; renewal status was not independently certified.

Where the current provider page has explicit role-specific data, it takes precedence over an older regulator entry. Regulator-only data remains labeled and sourced as such. HTTP 403, bot protection, TLS errors and timeouts were recorded as lookup limitations; they do not establish that a contact is invalid. Contact details were never guessed from email naming patterns.

## Coverage and deliberate gaps

**31 of 32 insurers** have a primary-published GRO email. Prudential HCL’s accessible official grievance page identifies levels but did not expose the Level 3 officer email. Its verified customer-support email, helpline and [official grievance page](https://prudentialhealth.in/raise-grievance) are provided, with `gro_email: null`. The UI should present the official page and ask the user to select the current GRO; it must not generate a guessed recipient.

**6 of 17 TPA records** have a verified grievance email (Medi Assist, MDIndia, Paramount, Vidal, Good Health, Ericson). Park has a specifically identified GRO telephone but no plaintext GRO email verified. Other records carry the official registry/provider helpline and any published general support email. A support email is not a confirmed dedicated claims or GRO address; `notes` records this. The user’s insurer remains the relevant formal grievance target, even if a TPA handled cashless processing.

| Missing GRO email | Verified alternative |
|---|---|
| Prudential HCL Health Insurance (`prudential-hcl`) | helpline 1800 268 2000; published support customersupport@prudentialhealth.in; [source](https://prudentialhealth.in/raise-grievance) |
| Heritage Health Insurance TPA Private Limited (`heritage`) | helpline 1800 345 3477; [source](https://irdai.gov.in/list-of-tpas) |
| Family Health Plan Insurance TPA Limited (`fhpl`) | helpline 1800 102 4033; [source](https://irdai.gov.in/list-of-tpas) |
| Volo Health Insurance TPA Pvt. Ltd ( Formerly East West Assist Insurance TPA Private Limited) (`volo`) | helpline 011-47222666; published support support@volohealth.in; [source](https://www.volohealth.in/) |
| Medsave Health Insurance TPA Limited (`medsave`) | helpline 1800 111 142; published support info@medsave.in; [source](https://www.medsave.in/WebGrievanceMail.aspx) |
| Genins India Insurance TPA Limited (`genins`) | helpline 1800 890 2359; [source](https://irdai.gov.in/list-of-tpas) |
| Health India Insurance TPA Services Private Limited (`healthindia`) | helpline 1800 2201 02; published support customersupport@healthindiatpa.com; [source](https://irdai.gov.in/list-of-tpas) |
| Park Mediclaim Insurance TPA Private Limited (`park`) | GRO phone 9821236752 / 011-43191079; helpline 1800 11 55 33; [source](https://www.parkmediclaim.co.in/Contact/CustomerSupport) |
| Health Assist Insurance TPA Pvt. Ltd. (Formerly known as Safeway Insurance TPA Pvt. Ltd.) (`health-assist`) | helpline 1800 102 5671; published support contact@healthassisttpa.com; [source](https://www.safewaytpa.in/grievance.aspx) |
| Health Insurance TPA of India Limited (`hitpa`) | helpline 1800 180 3600, 1800 102 3600; support email left null after source recheck; [source](https://irdai.gov.in/list-of-tpas) |
| Link-K Insurance TPA Private Limited (`link-k`) | helpline 044 35255426; [source](https://irdai.gov.in/list-of-tpas) |
| AKNA Health Insurance TPA Private Limited (`akna`) | helpline 1800-569-4455; [source](https://irdai.gov.in/list-of-tpas) |

## Renames, mergers and source conflicts handled

- **Bajaj General**, **Magma General**, **Generali Central**, **IndusInd General** and **Zurich Kotak** use their current published names. Familiar legacy names remain aliases for search.
- The current Generali Central grievance page uses **GCIGRO@generalicentral.com**; the IndusInd page uses **grievances@indusindinsurance.com**. Old Future Generali/Reliance-domain addresses were not preferred when the current provider supplied the new address.
- HDFC ERGO’s current provider page identifies **cgo@hdfcergo.com** for the chief escalation; the older regulator address is documented in notes.
- Zuno’s official January 2026 GRO PDF provides **tarun.mathur@hizuno.com** and **7208001193**. A regulator phone rendered in scientific notation was not converted into a guessed number. United India’s malformed registry GRO phone is left null; its general helpline is separately verified against the live official grievance page.
- Narayana’s current published officer is **Bharathi Bai A G**, **gro@narayanahealth.insurance**, **+91 80507 31511**. Its dedicated grievance line is separately sourced.
- **Paramount** publishes integration with **Medi Assist effective 1 February 2026**. Its legacy record is retained for existing policyholders and marked accordingly; it is not represented as a separate newly active operator. Medi Assist’s aliases include the merged Raksha operation.
- **Volo** includes former East West Assist, and **Health Assist** includes former Safeway, preserving search usability.
- Ericson’s current provider grievance page publishes **1800 202 2034**, differing from the older directory number; the current provider number is used.
- Good Health’s current February 2026 grievance PDF supplies **grievance@ghpltpa.com**. Its legacy references to old Ombudsman rules are not used as legal sources.

## Entities excluded or not inferred

- **Agriculture Insurance Company**, **ECGC** and **Kshema**: no relevant retail hospital health product verified in this bounded scope; specialized general insurer registration alone does not prove such a product is sold.
- **Kiwi General**: current official homepage presents group health as **“Coming soon”**, with motor products active. Do not infer a current retail health claim service merely from general-insurer registration. Revisit when a health product launches.
- **Bharti AXA General** and **Reliance Health** legacy directory entries are not treated as newly current independent insurers where absent from the current insurer registers.
- Life insurance benefit riders, overseas insurers, hospitals, agents and brokers are outside this hospital cashless insurer/TPA matrix. An absent entity must lead to the official regulator directory and policy document, never an invented email.

## Schema and maintenance

`id` is a stable app key; `kind` is `insurer` or `tpa`; `gro_email`, `gro_phone`, `helpline`, and `claims_email` may be null. `escalation_levels` preserves separately verified roles. `field_sources` provides each contact field’s exact URL and evidence excerpt; excerpts may normalize whitespace and separate table cells for readability. `content_sha256` is an evidence/content change aid, not a cryptographic assertion that all fields came from the same full HTTP body. `verified_on` is the content-review date, and `verification_status` explicitly says `published-contact-verified`.

Do not describe `claims_email` as a dedicated claims channel when `notes` says it is general support. Do not auto-fill a regulator directory’s CEO/CAO email into a grievance letter. Every unavailable recipient must remain visible as unavailable; provide its official source link, the insurer GRO where known, and IRDAI’s regulator directory fallback.

Automated weekly checks should record response status/content changes under a distinct `last_checked_on`. HTTP success alone must **not** update `verified_on`; only re-review of role, address, phone and evidence can do that. Review redirects and renamed brands before replacing recipients. Preserve null fields when evidence is inconclusive.

## Stable insurer IDs

- `national` — National Insurance
- `new-india` — The New India Assurance
- `oriental` — The Oriental Insurance
- `united-india` — United India Insurance
- `acko` — Acko General
- `aditya-birla` — Aditya Birla Health
- `galaxy` — Galaxy Health Insurance
- `bajaj` — Bajaj General
- `chola` — Cholamandalam MS
- `navi` — Navi General Insurance
- `zuno` — Zuno General Insurance
- `generali-central` — Generali Central
- `digit` — Go Digit General
- `hdfc-ergo` — HDFC ERGO General
- `icici-lombard` — ICICI Lombard General
- `iffco-tokio` — IFFCO Tokio General
- `zurich-kotak` — Zurich Kotak General
- `liberty` — Liberty General Insurance
- `magma` — Magma General Insurance Limited
- `manipalcigna` — Manipal Cigna
- `niva-bupa` — Niva Bupa Health Insurance Company Limited
- `raheja-qbe` — Raheja QBE
- `indusind` — IndusInd General Insurance
- `care` — Care Health Insurance (Formely Religare Health Insurance Co. Ltd.)
- `royal-sundaram` — Royal Sundaram General Insurance Co.Limited
- `sbi-general` — SBI General
- `shriram` — Shriram General
- `star-health` — Star Health and Allied
- `narayana` — Narayana Health
- `tata-aig` — Tata- AIG General
- `universal-sompo` — Universal Sompo General
- `prudential-hcl` — Prudential HCL Health Insurance
