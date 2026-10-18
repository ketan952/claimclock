# ClaimClock — Product Roadmap & Startup Blueprint

**Last updated:** 18 October 2026  
**Repository:** `ketan952/claimclock` (AGPL-3.0-only)  
**Live URL:** https://claimclock.ketan952.workers.dev/  
**Audience:** the founder, and the coding agent that executes the milestones in §13.

**Core invariants to preserve across all phases:**
- **Claims-first, never sales-first.** ClaimClock earns nothing when a policy is sold. No insurer commissions, no lead-selling, no affiliate links, no "buy" buttons. Every competitor in India monetises the purchase; we monetise the moment the policy has to pay. This is the moat, not a constraint (§8, §10).
- **₹0/month for the rollout phase (Phases 1–2, M20–M28).** Cloudflare Workers Free + D1 + static assets + free-tier OpenAI-compatible LLM and speech APIs (`openai/gpt-oss-120b`, `whisper-large-v3-turbo` on Groq, Web Speech/Web Audio). No paid service, subscription or per-message cost may be introduced in Phases 1–2. Paid infrastructure is unlocked only in Phase 3, and only after the first paying customer exists (cost phasing in §12).
- **User-specific login + emergency guest access.** Full logged-in experience (Profile, Family, Policy Vault, Saved Claims, Voice Agent memory, zero `[placeholder]` letters) while an unauthenticated visitor in a hospital can still run the clock on-device and attach it to an account later.
- **Privacy & DPDP-first.** Medical and policy PDFs are parsed on-device (`pdfjs-dist` + `tesseract.js`). Vault records in D1 are client-side encrypted (WebCrypto `AES-GCM`). One-click erasure. DPDP Rules 2025 core obligations apply from **13 May 2027** (§11.2).
- **Open rules, protected people.** `data/rules.json`, `data/contacts.json` and the NL-48 dataset stay open and citable; user data is encrypted and never sold. Aggregated, k-anonymised outcome data is the only data product (§10.6).
- **Regulatory boundary (IRDAI).** Informational consumer-rights and policy-literacy platform — **not** a broker, corporate agent, web aggregator or ISNP. Plan comparisons use public Customer Information Sheets (CIS), policy wordings and NL-48 disclosures. No solicitation.
- **No "AI lawyer" claims.** Letters are document preparation grounded in cited rules. We never promise outcomes. (FTC v. DoNotPay, final order Feb 2025 — §11.3.)

---

## 0. The Startup Thesis in One Page

### 0.1 The problem, in numbers (FY25–FY26, primary sources in Appendix A)

| Signal | Figure | Source |
|---|---|---|
| Health-insurance grievances (general + health segment), FY25 | **1,37,361**, up **41%** YoY (97,503 in FY24); ~69% are claim repudiation / delay / partial settlement | IRDAI Annual Report 2024-25 |
| Bima Bharosa health-claim complaints | 47,658 (FY24) → 64,365 (FY25) → **73,729 (FY26, to Feb 2026)** | Lok Sabha reply, Dept. of Financial Services |
| Bima Bharosa all complaints, FY26 | 2,97,468 total; **1,17,979 health** | Lok Sabha reply |
| Insurance Ombudsman, health, FY25 | **37,585** complaints; 11,027 awards; **56% in the policyholder's favour** | IRDAI Handbook 2024-25, Table 57 |
| Claimants reporting rejection or partial approval "for invalid reasons" (last 3 yrs) | **44%** (15% rejected + 29% partial); **50% waited 6–48 hours** for discharge approval | LocalCircles 2026, 54,000 respondents, 323 districts |
| Dissatisfied claimants not given a clear rejection reason | **73%** (up from 53% in 2023); 76% of reimbursement claimants borrowed or liquidated investments | Policybazaar Claims Study 2.0 (2,228 claimants) |
| Claimants reporting at least one problem | **4 in 10**; 32% hold a second policy to fill employer-cover gaps | Hansa Research CuES 2026 |
| Market size | ₹1,17,505 Cr health premium FY25 (+9.2%); ₹1.24 lakh Cr in 11 months of FY26 (+15.3%); 2.65 Cr policies; 3.26 Cr claims registered; avg paid claim ₹28,910 | IRDAI Annual Report; GI Council |
| Retention | Avg **73%** retention on insurers' top-selling retail product (FY26, NL-47); renewal hikes of **25–41%** reported in 2026; seniors drove a 61% jump in porting | Mint analysis; Moneycontrol |

The asymmetry: insurers and TPAs now run AI that decides a claim in under a minute (Vitraya: ~90% auto-adjudicated; Medi Assist MAtrix: ~1.09 Cr claims in FY26). The patient at the TPA desk has a WhatsApp group and a photocopy. ClaimClock is the policyholder's side of that machine.

### 0.2 Wedge → expansion

1. **Wedge (live today):** the hospital-bedside statutory clock (1 h pre-auth / 3 h discharge), the on-device deduction auditor, and the cited grievance letter kit. Free, no login, works offline.
2. **Retention layer (§6.1–6.2):** Renewal Guardian and Reimbursement Tracker. A hospitalisation happens to a few percent of insured lives a year; **renewal happens to 100% of them**, and ~27% churn. Renewal is the annual re-engagement event that makes a claims tool a yearly habit.
3. **Data moat (§6.8, §8.1):** opt-in outcome reports become the only policyholder-side dataset of real pre-auth times, discharge times, deduction reversals and GRO response times — by insurer × TPA × hospital × city.
4. **Revenue (§10):** B2C Plus subscription; B2B2C "ClaimClock for Teams" (employers); B2B "ClaimClock Desk" (small hospitals); flat-fee expert escalation; anonymised benchmarks (Resolver model).
5. **Expansion (§5):** Life (Section 45, 15/45-day clocks) and Motor (surveyor clock, Zero-Dep auditor) on the same engine.

### 0.3 Why now (2024–2027 shifts that create the opening)

| Shift | What it does for ClaimClock |
|---|---|
| Health Master Circular (29 May 2024) + PPHI Master Circular (5 Sep 2024) | Hard, citable deadlines: 1 h / 3 h cashless, 15-day reimbursement, Bank Rate + 2% penal interest, CRC approval for repudiation, clause-specific rejection reasons, "documents at one go". Our product is the enforcement UI for these. |
| Grievances +41% YoY and rising monthly media coverage (Mint, ET, Moneycontrol, Business Standard) | Demand and free distribution. Journalists need policyholder-side data; nobody publishes it. |
| GST 0% on individual health (22 Sep 2025) while renewal premiums rise 25–41% | Price-shock renewals → porting surge → need for a neutral renewal/porting assistant. |
| IRDAI senior-citizen cap: premium hikes ≤10%/yr (30 Jan 2025) | A checkable rule → an auto-generated complaint when breached. |
| DPDP Rules notified (13 Nov 2025; core duties 13 May 2027) | Privacy-first architecture becomes a compliance advantage over incumbents holding plaintext health data. |
| AHPI vs Bajaj / Care / Star cashless suspensions (Aug–Oct 2025) | Cashless can vanish overnight; patients need a reimbursement fallback and network alerts. Hospitals want evidence of insurer delays too. |
| NHCX (38 private payers, 867 hospitals, 30k private claim messages as of Sep 2026; Parliamentary committee recommends a mandate) and GIC common empanelment | Machine-readable claim status is coming; we build the adapter now and become the consumer-facing layer when it lands. |
| Bima Sugam Public Insurance Registry (PIR) designed to "support multiple customer-facing platforms" | A future consented policy-import rail for exactly this kind of app. |
| Insurance Amendment Act 2025 (in force 5 Feb 2026) + IRDAI distribution consultation (23 Sep 2026): commission caps, commission disclosure, mis-selling clawbacks | Trust in commission-funded advice falls further; a zero-commission brand gains. |

### 0.4 What we are and are not

| We are | We are not |
|---|---|
| A policyholder-side rights and evidence tool | An insurer, TPA, broker, agent, aggregator or ISNP |
| Document preparation with cited rules | Legal practice, medical advice or an "AI lawyer" |
| A free emergency utility with paid convenience and B2B layers | A lead-gen funnel for insurers |
| An open rules dataset with closed, encrypted user data | A data broker |

### 0.5 18-month targets

- 10,000 completed hospital clocks; 2,500 opt-in outcome reports; public index covering ≥15 insurers × ≥10 cities.
- 3 hospital pilots (50–200 beds) and 5 SME employer pilots → first ₹ revenue by month 9.
- Renewal Guardian adopted by 40% of vault users; renewal-season return rate ≥50%.
- DPDP compliance pack shipped before 13 May 2027.
- Company incorporated, trademark filed, DPIIT Startup India recognition, advisory board of four (§14).

---

## 1. Why Login + User-Specific State Changes Everything

Right now, every time a user visits ClaimClock, the app treats them like a stranger — letters have `[Your name]` and `[Policy number]` placeholders, the app doesn't know whether they have a corporate or personal policy, and it doesn't know their family members.

With **Login + User-Specific Profiles**, the app becomes **their personal insurance command center**:

1. **My Profile:** Name, City, Preferred Language (`en-IN` / `hi-IN` / Hinglish). Every generated letter (Clock-Lock, Follow-up, GRO, Bima Bharosa, Ombudsman, Two-Policies, Doctor Note) is **100% pre-filled** with their real name, policy number, UHID, and claim ID — ready to send in one tap with zero `[brackets]` to edit.
2. **My Family Members:** Self, Spouse, Kids, and Parents (with ages and pre-existing conditions like Diabetes/BP), mapped to which policy covers which family member (e.g., *"Self + Spouse + Kid on HDFC ERGO Optima Secure; Parents on Star Senior Citizens Red Carpet"*).
3. **My Policy Vault (Health, Life, Motor):**
   - Stores Insurer, Plan Name, Policy Number, Sum Insured, No-Claim Bonus, Inception Date (automatically tracks Waiting Period completion, the **60-Month Health Moratorium**, and the **36-Month Life Section 45 Shield**!), Room Rent rule, Co-pay %, Consumables rider, Annual Full-Body Checkup limit & last-claimed date, and Renewal Date.
4. **My Active & Past Claims:** Syncs their hospital clocks, uploaded deduction audits, and escalation timeline across phone, tablet, and laptop.
5. **Personal Context for the Grok-Style Voice Agent:** When the user taps the microphone and says *"If I take my wife for a full body checkup this Saturday, will my policy pay for it?"*, the voice agent already knows which policy covers their wife, what the annual checkup limit is, and how to book it!
6. **Delegation ("Claim Buddy", §6.3):** the person in the bed is rarely the person doing the paperwork. A vault can grant a spouse, child or friend time-boxed access to run the clock and send letters on the patient's behalf.

### How Login Works at ₹0/Month (No Paid SMS Gateways)
- **Primary Login — WebAuthn Passkeys (`navigator.credentials`):** One-tap biometric sign-in (FaceID / TouchID / Android fingerprint / Windows Hello) stored in Cloudflare D1 (`users` & `passkey_credentials` tables). Zero passwords to forget, zero SMS DLT cost.
- **Secondary Login / Cross-Device Link — Account Code + Recovery Key / QR:** A 1-tap QR or 12-word/short recovery key so the user can log into their laptop from their phone or share their Family Vault with their spouse in 5 seconds.
- **Later (Phase 3+, Plus/Teams users only):** WhatsApp authentication templates at ₹0.115 + GST per message (Meta India rate card, 1 Oct 2026) for users who cannot use passkeys. Not part of the ₹0 rollout.

---

## 2. Grok-Style Interactive Live Voice Agent ("ClaimClock Voice")

The user should not just type in a chat box — they should be able to **talk live, back-and-forth** with an interactive voice agent (like **Grok Voice Mode**), in **English, Hindi, or Hinglish**, while the agent both **answers out loud** and **executes actions on screen on their behalf**.

### 2.1 How the Live Voice Loop Works (Hands-Free, Real-Time, ₹0 Cost)
1. **Hands-Free Voice Activity Detection (VAD) & Barge-In (`src/lib/voice-agent.ts`):**
   - Uses the browser's `navigator.mediaDevices.getUserMedia({ audio: true })` + Web Audio API `AnalyserNode` to render a live, pulsing **Voice Orb / Waveform** on screen.
   - **Automatic Turn-Taking:** Detects when the user starts speaking and when they pause (~700ms silence threshold), automatically sending the utterance without requiring the user to hold a button.
   - **Instant Barge-In (Interruption):** If the user speaks while the bot is talking, the bot immediately stops speaking (`speechSynthesis.cancel()` / audio buffer stop) and listens to the user — just like Grok Voice Mode.
   - **Important Header Change Required in M22:** Update `public/_headers` from `Permissions-Policy: camera=(), microphone=(), geolocation=()` to `Permissions-Policy: camera=(), microphone=(self), geolocation=()` so microphone access is permitted on `claimclock.ketan952.workers.dev`.
2. **Dual-Engine Speech-to-Text (STT):**
   - **Fast Streaming Path (0ms network cost):** Browser `SpeechRecognition` / `webkitSpeechRecognition` (`lang: 'en-IN'` or `'hi-IN'`) shows live interim words on screen as the user speaks.
   - **High-Accuracy Multilingual Path (Groq Free Tier):** Sends recorded speech chunks (WebM/Opus, capped at 25 seconds) to `/api/voice/transcribe` → Groq `whisper-large-v3-turbo` (free tier: 20 RPM, 2,000 requests/day), which handles Indian accents, medical/insurance terms, and mixed Hindi-English (*Hinglish*) accurately.
3. **Agentic Brain with Live Tool Execution (`/api/copilot` on `openai/gpt-oss-120b`):**
   - System prompt instructs the model to speak in **short, natural, conversational spoken sentences** (2–4 sentences max, no markdown bullet dumps in spoken audio) while returning structured `tool_calls` for visual cards and actions.
   - Grounded in:
     - The logged-in user's **Profile, Family Members, Saved Policies, and Active Claims**.
     - Our verified `data/rules.json`, `data/contacts.json`, `data/plans.json`, and `data/nl48.json`.
   - Hard rule: the model never invents a deadline, rule or contact. Every statutory statement is rendered from a `rules.json` entry with its citation; if no rule matches, the agent says so.
4. **Spoken Voice Output (TTS):**
   - Speaks the agent's `spoken_reply` out loud immediately using:
     - Primary: Browser `window.speechSynthesis` selecting the highest-quality local `en-IN` (e.g., *Rishi* / *Veena* / Google English India) or `hi-IN` (*Lekha* / Google हिन्दी) voice for instant, zero-latency playback, with an optional neural TTS path via Groq (`canopylabs/orpheus-v1-english`) when available.
5. **Tools the Voice Agent Executes on the User's Behalf:**
   When you talk to the bot, it doesn't just talk back — it **drives the UI and prepares actions for you**:
   - `check_policy_benefit({ member, treatmentOrCheckup })` → Checks the user's saved policy (e.g., *"Full body checkup for me"*, *"Cataract surgery for my mother"*, *"Can I take a Deluxe room?"*), speaks the answer out loud, and pops up the exact policy clause & booking rules on screen.
   - `recommend_or_compare_plans({ familyMembers, preExisting, compareIds })` → Recommends the best-fit plans for their family or compares two plans side-by-side on screen while explaining the 2 biggest differences out loud.
   - `manage_claim_clock({ action: "start" | "log_event" | "record_decision", insurerId, requestType, submittedAt, note })` → Starts the live hospital clock or logs a TPA query/call hands-free from voice!
   - `audit_bill_deductions({ lines })` → Runs the deduction classifier on spoken or uploaded bill cuts and reads out which ones are challengeable.
   - `draft_and_queue_action({ letterKind, targetInsurer })` → Generates the complete, pre-filled email/letter (with the user's saved Name, Policy No., Claim No., and Verified GRO Email), reads a 1-sentence confirmation out loud, and displays a big **"Tap to Send Email / WhatsApp"** button on screen.
   - `save_user_policy({ ... })`, `check_renewal({ policyId })` (§6.1), `track_reimbursement({ claimId })` (§6.2).

---

## 3. How Users Add Their Policies (Dynamic + Static Options)

To make adding a policy effortless for any Indian user:

1. **Select Insurer + Plan Name (Catalog Match — 20 seconds):**
   - Pick Insurer → Pick Plan from `data/plans.json` (top 25 Indian retail health, term, and motor plans) → Enter Policy Number, Sum Insured, and Start Year. All plan rules (room rent cap, co-pay, free annual health checkup limit, waiting periods, consumables cover) load automatically.
2. **Upload Policy Schedule / CIS / e-Card PDF or Photo (On-Device Auto-Parser):**
   - Drop the Policy Schedule or Customer Information Sheet (CIS) PDF. Our on-device parser (`src/lib/policy-parser.ts`) extracts the Policy Number, Insurer, Plan Name, Insured Members, Sum Insured, Room Rent Rule, Co-pay, Waiting Periods, Free Health Checkup benefit, and Renewal Date, and saves it to the user's Vault.
3. **Talk to the Voice Bot ("Add my policy by voice"):**
   - The user can simply say: *"I have HDFC ERGO Optima Secure for me and my wife, 10 lakh cover, started in 2023"* — and the voice agent calls `save_user_policy` to add it to their Vault!
4. **Pluggable `PolicySourceAdapter` — what is real today vs. later:**
   - **DigiLocker (now):** many insurers are DigiLocker *issuers* (e.g., United India exposes Individual Health and Family Medicare policies by Policy Number + Effective Date + Customer ID). ClaimClock can onboard as a DigiLocker *Requester* via API Setu and pull the policy PDF with user consent, then parse it on-device. First adapter to build.
   - **e-Insurance Account / Insurance Repositories (now, user-mediated):** CAMSRep (46 insurers), NSDL NIR etc. The user downloads the e-policy from their eIA and drops it in; no API dependency.
   - **Account Aggregator (later, via partner):** `LIFE_INSURANCE` and `GENERAL_INSURANCE` FI types are live and all six standalone health insurers are live FIPs; FIPs must enable all FI types by 30 Nov 2026. But only RBI/SEBI/IRDAI/PFRDA-regulated entities can be FIUs. ClaimClock can act as a TSP for a regulated partner (e.g., an insurance broker that is already a live FIU) — not as an FIU itself. Design the adapter; sign the partner in Phase 3.
   - **Bima Sugam / PIR (later):** as of 30 Sep 2026 Bima Sugam is not open for public transactions (IRDAI chairman: "by November"; consultation paper: 4–6 months). No third-party API specification is published. The Public Insurance Registry is explicitly meant to support multiple customer-facing platforms — keep the adapter interface ready and apply when access opens.

---

## 4. "Is This Covered?" Simulator & Family Plan Recommender

### 4.1 "Is This Covered?" Everyday Benefit Simulator (`/check-coverage/`)
Answers everyday questions against the user's saved policy (or any plan in `data/plans.json`):
- **Annual Full-Body Health Checkup:**
  - Shows whether it's covered, the exact rupee cap (e.g., ₹5,000 per policy year or 1% of Sum Insured), whether all insured adults can share the limit, and **how to claim it** (cashless booking via insurer app vs. diagnostic receipt reimbursement) so the user doesn't get rejected for booking it the wrong way!
- **OPD Consultations, Blood Tests & MRI/CT Scans:**
  - Explains whether their plan covers standalone OPD, or if diagnostic tests are only payable within the **Pre/Post-Hospitalisation window** (30–60 days before and 60–180 days after an inpatient admission for the same condition).
- **Room Upgrade Calculator ("What happens if I take a Deluxe Room?"):**
  - Shows in rupees how a room above their policy's eligible category affects their bill (direct room difference vs. 30–40% proportionate deduction on Surgeon, Anaesthetist, and OT charges).
- **Specific Surgeries & Waiting Periods (Cataract, Knee Replacement, Maternity, Robotic):**
  - Checks their policy's inception date + ported years against the plan's waiting period and sub-limits, and shows whether the **60-Month Moratorium (Chapter I 13)** is active.

### 4.2 Family Plan Recommender & Side-by-Side Comparison (`/compare/`)
- **Family Structure Advisor:**
  - Takes the user's family members (Self, Spouse, Kids, Senior Parents) and gives neutral structural advice first — e.g., **splitting 60+ parents into a separate policy** instead of one combined floater, and choosing a base cover + super top-up vs. a single large base policy.
- **Side-by-Side Comparison on 7 Real Metrics (No Sales Fluff):**
  1. **Real Cashless Discharge Speed** (from our verified 30-insurer IRDAI NL-48 dataset).
  2. **Room Rent & Proportionate Deduction Rule** (Any room vs. Single Private AC vs. 1% SI cap).
  3. **Co-payment & Zone Capping** (0% vs. mandatory 10–20%).
  4. **Consumables / Non-Medical Items Coverage** (In-built vs. Rider vs. Excluded).
  5. **Pre-existing Disease (PED) & Specific Waiting Periods** (12 / 24 / 36 months).
  6. **Annual Full-Body Health Checkup & Restoration Rules.**
  7. **Disease Sub-limits** (Cataract, Joint Replacement, Modern/Robotic Treatments).
- **Regulatory guardrail for this page:** IRDAI's web-aggregator rules require that comparisons never display price alone and always show features, terms, exclusions and benefits. We adopt that standard voluntarily, show **no premiums and no quotes**, and link to the insurer's official CIS. No "buy" or "get quote" action exists anywhere on the site (§11.1).

---

## 5. Phased Expansion to Life Insurance & Motor Insurance

Using the same statutory-clock + deduction-audit + voice-copilot engine:

### 5.1 Life Insurance Module (`/life/` — Term & Savings Policies)
- **Statutory Settlement Clock (IRDAI PPHI Master Circular, 5 Sept 2024):**
  - **15 Days** from claim intimation for death claims not warranting investigation.
  - **45 Days** from claim intimation where investigation is warranted (all queries must be raised in one go within 15 days).
  - **Automatic Penal Interest Calculator:** Computes **Bank Rate + 2% penal interest** owed *suo-moto* by the insurer for every day of delay beyond the statutory deadline.
- **Section 45 Three-Year Indisputability Shield:**
  - Under **Section 45 of the Insurance Act, 1938**, **no life insurance policy can be called into question on any ground whatsoever after 3 years (36 months)** from policy issuance, commencement of risk, revival, or rider addition.
  - Generates nominee-ready GRO & Ombudsman representations citing Section 45 and blocks insurers from demanding police FIRs/post-mortem reports for natural deaths.

### 5.2 Motor Insurance Module (`/motor/` — Car & Two-Wheeler Policies)
- **3-Stage Motor Statutory Clock (IRDAI PPHI Master Circular, 5 Sept 2024):**
  - **24 Hours:** Insurer must appoint a registered surveyor within 24 hours of claim intimation.
  - **48 Hours / 15 Days:** Surveyor must start inspection within 48 hours and submit the final report within 15 days.
  - **7 Days:** Insurer must decide and settle the claim within 7 days of receiving the survey report.
- **Motor Garage Bill & Surveyor Deduction Auditor:**
  - Flags unlawful plastic/rubber/metal depreciation cuts when the user's policy has a **Zero-Depreciation (Bumper-to-Bumper)** add-on, audits **Consumables add-on** cuts, and challenges arbitrary **IDV (Insured Declared Value)** reductions on total-loss or theft claims.

---

## 6. New Product Pillars From Market Research

Each pillar lists the evidence, what gets built, the rules to add to `data/rules.json` (with primary source), and the business hook.

### 6.1 Renewal Guardian — the annual re-engagement engine (`/renewal/`, `src/lib/renewal.ts`)
**Evidence.** ~27% of policyholders do not renew the same product (FY26 NL-47); brokers report renewal hikes of 25–41% in 2026 despite 0% GST since 22 Sep 2025; seniors drove a 61% jump in porting; portability is mis-sold (commissions paid on ported policies; fresh policies sold as "porting"); the 45-day porting window is missed and the policy lapses.

**Build.**
- Vault stores renewal date; reminders at T-60 / T-45 / T-30 / T-7 (push via PWA; email; WhatsApp utility on the paid tier).
- **Premium-hike analyser:** user enters old vs. new premium. If insured is 60+, and the hike exceeds 10%/yr, generate a cited complaint to the insurer's GRO and a Bima Bharosa draft (IRDAI circular, 30 Jan 2025). Explain GST removal (−15.25% of the earlier bill, not −18%) so users can separate tax effect from repricing.
- **Porting readiness checklist:** apply ≥45 days before renewal; request routed via IIB; prior insurer shares records within 72 h; new insurer decides within 5 days; written confirmation of credits transferred (NCB, waiting periods served, moratorium months); warning on fresh disclosure. "Should I port?" compares *structural rules* (room rent, co-pay, consumables, PED wait, restoration) — never premiums or named recommendations.
- **Migration helper:** same-insurer migration (apply ≥30 days before renewal, credits carry over); group → individual migration right when leaving a job or when the group policy is modified/withdrawn (subject to underwriting; insurer decides within 15 days).
- **Free-Look Rescue:** for any *new* policy, a 30-day window tracker from receipt of the policy document; upload it and we diff the schedule against what the user says the agent promised (sum insured, room rent, co-pay, PED wait, riders). If it does not match, generate the free-look cancellation request (refund due within 7 days). This is the only consumer-side mis-selling detector in the market.
- **Grace-period alarm:** 15 days (monthly premium) / 30 days (quarterly, half-yearly, annual) with credits protected if renewed within grace.

**Rules to add.** `senior-premium-cap-10pct` (IRDAI 30 Jan 2025), `free-look-30-days`, `free-look-refund-7-days`, `porting-45-days` / `porting-records-72h` / `porting-decision-5-days`, `migration-30-days`, `group-to-individual-migration`, `grace-period-15-30-days`, `gst-exempt-individual-health-2025-09-22`.

**Business hook.** Renewal is where every user comes back once a year. It is also the natural moment for the Plus subscription (§10.2) and the employer module (§6.4).

### 6.2 Reimbursement Tracker — the forgotten 30% (`/reimbursement/`, `src/lib/reimbursement.ts`)
**Evidence.** ~29% of claim payouts are reimbursements; ~60% of claimants choose reimbursement because they fear discharge delays; 76% borrowed money or sold investments to pay the hospital; reimbursement satisfaction scores 73.7 vs. 86.7 for cashless (Policybazaar 2.0). The PPHI Master Circular (5 Sep 2024) requires non-cashless health claims to be **settled within 15 days of submission**, with **interest at Bank Rate + 2%** from the date of intimation, paid *suo moto*; documents must be called **at one go**, not piecemeal; and the insurer/TPA must collect documents from the hospital (Health MC Ch. I 17c).

**Build.**
- A second clock: submission date → 15-day deadline → penal-interest counter (Bank Rate fixed by RBI at the start of the financial year, from `data/rules.json`, updated yearly).
- Query log: each insurer query is time-stamped; a second query triggers the "piecemeal documents" objection letter.
- 7-document checklist (already in `toolkits.ts`) becomes a tracked list with photo capture and a "Claim-Ready Pack" PDF.
- Settlement audit: if the settlement letter lacks the interest line item, generate the written demand.
- Hooks into Two-Policies coordination (Ch. I 18a) when the first insurer pays partially.

**Rules to add.** `reimbursement-15-days`, `penal-interest-bank-rate-plus-2`, `documents-at-one-go`, `bank-rate-fy` (value + RBI source, reviewed every April).

### 6.3 Claim Buddy (delegated mode) and Elder mode
**Evidence.** The patient is not the claimant in practice; the spouse or adult child is. Seniors are the most penalised segment (co-pays, loadings, hikes) and the least able to operate a phone under stress. LASI: 75% of seniors have chronic illness.

**Build.**
- Vault sharing with roles (`owner`, `buddy`) and time-boxed grants; a buddy can start/log the clock, upload bills and send letters in the patient's name, with every action attributed in the Evidence Locker (§6.6).
- Elder mode: larger type, Hindi default, voice-first (§2), one-screen clock, "call my buddy" button.
- Shareable status card ("⏱ 2h 47m waiting for discharge approval — [Insurer], [Hospital]") for family WhatsApp groups — the viral artefact (§9.2).

### 6.4 Group-policy (employee) module (`/group/`, `src/lib/group.ts`)
**Evidence.** Group health runs at a 92% incurred-claims ratio (retail 78%) — insurers manage group losses hard at claim time; 32% of consumers hold a retail top-up to cover employer gaps; SME HR has no bandwidth and no escalation path; employees "don't know whom to contact" is a top survey answer. Plum (6,000 companies, ₹120 Cr FY26 revenue target) and Loop sell the broker-plus-app bundle to larger firms; the long tail of SMEs has nothing.

**Build.**
- Parse TPA e-cards; store corporate policy alongside retail policy in the vault; auto-apply Two-Policies coordination.
- HR escalation letters (to the master policyholder's HR/broker and to the TPA) with the same statutory citations; "whom to contact" card per TPA from `data/contacts.json`.
- Exit workflow: group → individual migration letter with the 15-day decision rule; reminder to apply before the last working day.
- Parents' cover gap finder: shows what the group policy excludes for parents vs. a separate senior policy (structural, no plan recommendation).

**Business hook.** This is the B2B2C product (§10.4): the same screens, sold to employers with an aggregated, anonymised HR dashboard.

### 6.5 Fair-Bill Benchmark (`src/lib/fair-bill.ts`, `data/cghs-rates.json`)
**Evidence.** The Parliamentary Standing Committee notes the same procedure is billed at steeply different rates across hospitals; the IRDAI health sub-committee (28 Aug 2026) wants standard treatment guidelines and package rates published; CGHS package rates were revised on 13 Oct 2025 (first revision in 15 years) and are the benchmark insurers use to negotiate; Clinical Establishments Rule 9(i) requires hospitals (in the 19 adopting states/UTs) to display rates, and the Health Ministry re-issued that instruction to all states on 12 Oct 2026. Rule 9(ii) rate *ranges* remain unfixed and are before the Supreme Court — so benchmarks are indicative, not caps.

**Build.**
- Load a curated subset of CGHS 2025 package rates (top ~150 procedures) with the tier rules (Tier-II −10%, Tier-III −20%, non-NABH −15%, super-speciality +15%, ward ±5%).
- Deduction auditor gains a "reference range" column: hospital line item vs. CGHS-derived range for the city tier. Items far above the range get a "ask for the displayed rate card and the package breakdown" prompt (Rule 9(i)).
- Clear disclaimer: reference only; private tariffs are lawful; use it to ask questions, not to refuse payment.

**Business hook.** Hospitals that bill fairly will want to show it (ClaimClock Desk, §10.5); users get a defensible basis to question outliers.

### 6.6 Evidence Locker + Consumer-Court filing kit (`src/lib/evidence.ts`, `/consumer-court/`)
**Evidence.** Ombudsman and consumer commissions decide on timelines and paper. e-Jagriti (live since 1 Jan 2025; 2.29 lakh cases filed; 90.75% disposal) accepts online filing with virtual hearings; District Commission handles consideration ≤₹50 lakh, State ≤₹2 Cr, National above; no fee up to ₹5 lakh; 2-year limitation. Example outcome: Ahmedabad DCDRC ordered a ₹16,224 mediclaim deduction refunded with 7% interest within 27 days.

**Build.**
- Hash-chained, time-stamped event log (calls, emails, TPA queries, letters sent) per case; export as a PDF annexure with an index.
- Filing kit: jurisdiction picker, fee slab, limitation check (from GRO rejection / one month of silence for the Ombudsman; 2 years for consumer commissions), templates for index, memo of parties, affidavit, synopsis; checklist of annexures.
- Decision helper: Ombudsman (≤₹50 lakh, free, ~79% disposed in 3 months, 56% awards for policyholders) vs. consumer commission (any amount, small fees, longer).

### 6.7 Cashless-network & suspension checker
**Evidence.** AHPI (15,000–20,000 hospitals) threatened to suspend cashless for Bajaj Allianz and Care (Sep 2025) and did suspend for Star until 10 Oct 2025; Ahmedabad hospitals suspended Star and Tata AIG cashless for a month in Apr 2025. Patients discovered this at admission.

**Build.**
- `data/network-alerts.json`: curated, dated, sourced alerts (insurer × hospital group × city × status), maintained by the same weekly source-check workflow used for contacts.
- Pre-admission check: "Is cashless currently working for [Insurer] at [Hospital]?" → if not, open the Reimbursement Tracker with the insurer's own public commitment quoted (e.g., Bajaj: "money in the customer's account before they pay the hospital").
- Later: GIC common-empanelment registry adapter when published.

### 6.8 ClaimClock Index v2 — the public "Claim Weather" (`/index/` extension, `/s/...` pages)
**Evidence.** The only public data is insurer self-reported NL-48/NL-47; IRDAI does not publish porting or ported-claim outcomes (Mint); ORF calls for a "customer-facing analytics layer"; journalists cover this beat monthly. Resolver (UK) built a business on exactly this: free complaints tool, revenue from benchmarking data and complaint-handling software sold to businesses and regulators.

**Build.**
- Opt-in outcome reports (already in `/api/reports`) gain fields: hospital (optional), TPA, pre-auth minutes, discharge minutes, deduction categories, reversal outcome, GRO response days, Ombudsman result.
- Weekly aggregates by insurer × TPA × city × month with k-anonymity (publish a cell only when n ≥ 20), suppression rules already in `worker/aggregate.sql`.
- Programmatic pages: `/s/<insurer>/<city>/`, `/s/<insurer>/<tpa>/`, `/plans/<plan>/room-rent/` etc., bilingual, with methodology and a right-of-reply address for insurers.
- Monthly "Claim Weather" post auto-drafted for `docs/launch-posts.md` → press list.

**Business hook.** Distribution (SEO + press), the data moat, and the §10.6 benchmark product.

### 6.9 Open Rules API + MCP server (`/api/rules`, `/mcp`)
**Evidence.** Fight Health Insurance (US) exposes its rules to ChatGPT/Claude via MCP ("your AI can talk to our AI"); people already ask general chatbots about claims and get stale 2016/2017 timelines (e.g., "30 days" instead of 15).

**Build.** Read-only, rate-limited endpoints and an MCP server serving `rules.json`, `contacts.json`, NL-48 aggregates and letter templates under CC BY 4.0 with mandatory attribution. Every AI assistant that cites us is a distribution channel and reinforces authority.

### 6.10 PM-JAY / state-scheme module (later, grant-funded)
**Evidence.** 58.2 Cr covered lives include government schemes; empanelled hospitals cannot deny PM-JAY treatment; grievances go to CGRMS or 14555; SOS grievances during hospitalisation must be acted on within 6 working hours; unresolved cases auto-escalate after 15 days.

**Build.** A separate 6-hour SOS clock, CGRMS draft, 14555 script, and hospital-finder link. Not monetisable directly; fits CSR/grant funding (§10.7) and the mission.

---

## 7. Market Map — Where Others Stop, Where We Start

| Player | Model | Where they stop | Where ClaimClock starts |
|---|---|---|---|
| **Insurance Samadhan** (Noida; ~150 staff; ~$5M raised, last round May 2025) | Human-led grievance resolution: ₹999 registration after case acceptance, **20% + GST success fee** (22% at legal stage), 10–15% withdrawal fees | Post-rejection, high-touch, expensive for ₹20k–₹2L claims | Pre-rejection, real-time, free; flat-fee escalation partner for complex cases (§10.3) |
| **ClaimBuddy** (Gurugram; FY25 revenue ₹14.6 Cr, PAT ₹46 L; $5M Series A Apr 2024) | B2B: hospitals subscribe, staff at TPA desks, patients free | Only at ~450 partner hospitals; patient has no independent view | Patient-owned record at any hospital; lightweight Desk for hospitals that cannot afford embedded staff (§10.5) |
| **Plum** (6,000+ firms; FY25 revenue ₹67 Cr; ₹193 Cr Series B Mar 2026) / **Loop** / **Onsurity** (from ₹145/employee/month) | Licensed brokers; earn on group premium; claims experience as marketing (Plum: 88% of disputed claims paid, ₹10 Cr recovered) | Only their own corporate clients; incentive to keep the insurer relationship | Independent of broker and insurer; covers the employee's retail policy and parents too; SMEs without a benefits platform (§10.4) |
| **Ditto** (corporate agent CA0738; 7 health insurer partners) / **Beshak** (unregulated advice; platform fee from advisors; CARES only for Beshak-bought policies) | Advice at purchase, commission-funded (Ditto) or advisor-fee-funded (Beshak) | Beshak itself says it "intends to launch a paid service for policies bought outside Beshak" — the gap is acknowledged | Claim support for **any** policy regardless of where it was bought; zero commission |
| **Policybazaar / PB Fintech** | Web aggregator; claim-assistance as a retention feature | Conflict: largest distributor of the policies being disputed | Neutral |
| **Medi Assist MAtrix, Vitraya, Qoris** | Insurer/TPA-side adjudication AI (~90% of claims decided in <1 min) | Serve the payer | Serve the payee; same regulations, opposite side |
| **Claimable** (US; $39.95/appeal; 80% success; pivoting to drugmaker and hospital-system deals) | AI appeals | US-only; investors say D2C alone does not scale — enterprise channel does | Confirms our B2B2C sequencing (§10) |
| **Counterforce Health** (US; free; NIH/UPenn grants; copies state regulators on every appeal) | Non-profit AI appeals | US-only | Confirms grant funding and the "copy the regulator" tactic (Bima Bharosa draft is already our equivalent) |
| **Fight Health Insurance** (US; free/pay-what-you-can; open source; MCP integration) | Open-source appeals | US-only | Confirms open-rules + MCP distribution (§6.9) |
| **Resolver** (UK; free for consumers and businesses; revenue from benchmarking data and complaint software used by regulators and ombudsmen) | Complaints utility | UK | The monetisation template for §10.6 |
| **DoNotPay** (US; FTC final order Feb 2025: $193k, banned from unsubstantiated "AI lawyer" claims) | Subscription "robot lawyer" | Cautionary | Never market outcomes we cannot substantiate (§11.3) |

Nobody in India combines: consumer-owned, zero-commission, real-time statutory enforcement at the bedside, plus a renewal-season habit, plus policyholder-side outcome data.

---

## 8. Defensibility — Six Moats, in Order of Strength

1. **Policyholder-side outcome dataset.** Real pre-auth and discharge durations, deduction reversal rates, GRO response times and Ombudsman results by insurer × TPA × hospital × city. Insurers self-report NL-48; the regulator does not publish porting or claim-dispute outcomes. Each report compounds. (§6.8)
2. **Regulation-as-code.** `data/rules.json` with clause-level citations, bilingual plain-language text, snapshot tests, and a source-change workflow that updates within 48 hours of an IRDAI circular. Replicating the data is easy; replicating the maintenance discipline and trust is not.
3. **Policy-wording corpus.** `data/plans.json` evolves into a clause graph (every trap clause tagged by type) across the top retail plans, verified against CIS and wordings.
4. **Distribution at the moment of pain.** Offline PWA, hospital TPA-desk posters with QR, letters that carry the brand to the insurer's GRO inbox, shareable timers in family WhatsApp groups. Incumbents acquire users at purchase; we acquire them at the claim and keep them at renewal.
5. **Trust brand.** No commissions, no leads, no ads, open rules, published methodology, right of reply for insurers. The Sept 2026 IRDAI consultation paper on commission caps and disclosure makes commission-funded "advice" less credible every quarter.
6. **Family network effects.** One vault covers self, spouse, children and parents across insurers; a buddy grant pulls the next generation in; a parent's claim teaches the whole family the product.

---

## 9. Growth Loops and Distribution

### 9.1 Loops
| Loop | Mechanism | Cost |
|---|---|---|
| **Bedside letter loop** | Every Clock-Lock / follow-up letter reaches the hospital TPA desk and the insurer's GRO with a one-line footer. TPA desks see it daily; hospitals want faster discharge too (frees beds). | ₹0 |
| **TPA-desk poster** | A4 bilingual "Your 1-hour / 3-hour rights" poster with QR, downloadable from `/about/`; offered to hospital insurance desks and patient-rights boards. | Print cost borne by hospital |
| **Shareable timer** | "⏱ 2h 47m waiting — [Insurer] at [Hospital]" card for WhatsApp family groups; opens the public clock. | ₹0 |
| **Claim Weather** | Weekly/monthly public league tables + methodology → journalists (this beat is covered monthly by Mint, ET, Business Standard, Moneycontrol) → SEO → regulator attention → users. | ₹0 |
| **Renewal loop** | T-45 reminder → premium-hike check → porting checklist → the user returns every year, hospitalised or not. | PWA push ₹0; WhatsApp utility ₹0.115 + GST per message |
| **Employer loop** | HR shares the Teams link at policy renewal; employees add dependents and parents' retail policies. | Sales time |
| **Doctor loop** | The doctor's medical-necessity note template is signed by treating doctors, who then recommend it. | ₹0 |
| **Programmatic SEO** | `/s/<insurer>/<city>/`, `/plans/<plan>/<rule>/`, Hindi mirrors; each page cites sources and shows aggregates. | Build once |
| **AI-assistant loop** | MCP/rules API cited by ChatGPT/Claude/Gemini answers. | ₹0 |
| **Community** | r/IndiaInvestments, r/personalfinanceindia, LocalCircles, RWAs, senior-citizen associations, Facebook claim-help groups; "Ombudsman win" stories with permission. | Founder time |

### 9.2 Distribution economics to plan with (India, Oct 2026)
- WhatsApp Business Platform: utility / authentication / service ₹0.115 (+18% GST ≈ ₹0.136) per delivered message after 1,000 free service replies per number per month; marketing ₹0.8631 (≈ ₹1.018). Use utility templates only; never marketing templates.
- SMS is avoided entirely (DLT registration, per-message cost, OTP fraud surface).
- Paid acquisition is not in the plan before product-led loops saturate; if used, click-to-WhatsApp ads open a free 72-hour window.

---

## 10. Monetisation — Sequenced, Zero Commission

| # | Product | Who pays | Price hypothesis | When |
|---|---|---|---|---|
| 10.1 | **Free core** — emergency clock, deduction auditor, grievance kit, Ombudsman draft, Index | Nobody | Free forever (mission + distribution) | Live |
| 10.2 | **ClaimClock Plus** (B2C) — cross-device encrypted vault sync, unlimited voice minutes, policy ingestion, Renewal Guardian alerts on WhatsApp, Claim-Ready Pack PDFs, priority human review of a letter | Families | ₹999/year per family (benchmarks: Insurance Samadhan ₹999 registration; Claimable $39.95 per appeal) | Phase 2 |
| 10.3 | **Expert Escalation** — vetted partners (claim consultants, consumer lawyers, ex-TPA ops) for rejected/partial claims; encrypted case bundle hand-off (reuses `transfer-crypto.ts`); disclosed flat referral fee or a flat in-house drafting fee with human review | Users with claims > ₹50k | Flat ₹1,999–₹4,999 per case; **never a % of the claim** on our side (vs. 20–22% + GST in the market) | Phase 3 |
| 10.4 | **ClaimClock for Teams** (B2B2C) — employer account, invite links, employee + dependent vaults, TPA escalation templates, anonymised HR dashboard (friction stats, TPA scorecard for renewal negotiation) | SMEs (20–500 staff) without Plum/Loop; brokers as resellers | ₹15–₹30 per employee per month (insurance itself costs from ₹145/employee/month at Onsurity) | Phase 3 — first revenue |
| 10.5 | **ClaimClock Desk** (B2B) — hospital account; live board of all clocks in the hospital; Clock-Lock letters on hospital letterhead; discharge-delay evidence export for the hospital's own disputes with insurers (AHPI's listed grievances: delays, unilateral deductions, slow pre-auth/discharge); NHCX adapter | 50–200-bed hospitals that cannot afford embedded claim staff (ClaimBuddy's segment is larger chains) | Per bed per month; pilot free | Phase 4 |
| 10.6 | **ClaimClock Index benchmarks** — anonymised, k-anonymised insurer × TPA × city friction data; API and reports | Brokers (renewal negotiations), hospital groups, researchers, media; insurers only for self-benchmarking under published terms | Annual licence; free public tier always | Phase 4 |
| 10.7 | **Grants / CSR** — insurance literacy is a recognised CSR area; PM-JAY module; Hindi/regional expansion | Foundations, CSR budgets, Startup India seed fund | Non-dilutive | Any time |

**Licensing note.** The code is AGPL-3.0-only. Hosted SaaS for Teams and Desk is compatible (source stays available). Dual licensing would require owning all contributed copyright (CLA) — decide before accepting outside contributions. Data (`rules.json`, `contacts.json`, aggregates) is released CC BY 4.0.

**What we will never do.** Insurer commissions; selling leads to insurers, agents or brokers; affiliate links; advertising; selling or sharing identifiable user data; percentage-of-claim fees.

---

## 11. Regulatory, Legal and Compliance Architecture

### 11.1 IRDAI boundary
- Permitted without registration: rights information, document preparation, publishing public disclosures, structural comparison of published terms without solicitation.
- Not permitted without registration: soliciting or procuring insurance, quoting premiums, passing leads to insurers, "buy here". Unregistered intermediation attracts Section 102 penalties.
- If the company ever chooses regulated revenue (not recommended — it ends the zero-commission moat), current thresholds are: Insurance Marketing Firm ₹5 lakh net worth (one branch) / ₹10 lakh (multiple); Web Aggregator ₹25 lakh capital; Corporate Agent ₹50 lakh; Direct Broker ₹75 lakh capital and ₹50 lakh net worth. The 23 Sep 2026 consultation paper proposes a unified "Insurance Distribution Entity" class with ₹10,000 registration fee and lower capital — a proposal, not law. Track it; do not act on it.
- Bima Sugam / PIR access for third-party platforms: apply when a public specification exists.

### 11.2 DPDP Act 2023 + Rules 2025 (notified 13 Nov 2025)
| Date | Obligation | ClaimClock action |
|---|---|---|
| 13 Nov 2025 | Definitions; Data Protection Board set-up | None |
| 13 Nov 2026 | Consent-manager registration opens (₹2 Cr net worth, India-incorporated) | Not applicable — we are a Data Fiduciary, not a Consent Manager |
| **13 May 2027** | Notice, security safeguards, **breach notice to the Board within 72 h** and to affected users, retention/erasure timelines, processing logs ≥ 1 year, children's data, Data Principal rights, grievance contact | Ship `docs/dpdp-compliance.md`, itemised consent notices (English + Hindi), erasure SLAs, breach runbook, log retention, verifiable-consent flow for any minor added to a vault, grievance officer contact |

Client-side encryption means D1 holds ciphertext for vault records; document this in the notice. Run a voluntary DPIA before Teams/Desk launch.

### 11.3 Consumer-protection and advertising guardrails
- Never claim to be a lawyer, to guarantee outcomes, or to "get claims approved". Publish an Outcomes & Limitations page with measured, substantiated figures only (e.g., "x% of reporting users were discharged within 3 h after sending the Clock-Lock letter").
- Templates are marked as templates; paid tiers include human review by a named professional (lawyer for legal drafts, doctor for clinical templates).
- Public league tables: published methodology, k ≥ 20 suppression, dated sources, right of reply for every named insurer/TPA/hospital, no adjectives — this is the defence against defamation claims.
- If user-generated content is ever displayed, comply with IT Rules intermediary due diligence (grievance officer, takedown timelines).

### 11.4 Professional boundaries
- Letters and filings are the user's own; the user sends them. We do not represent anyone before the Ombudsman or a commission (self-representation is allowed at both).
- The doctor's justification note is a template for the treating doctor to complete and sign; we never state a diagnosis.

### 11.5 Company set-up checklist
Private limited company; DPIIT Startup India recognition (Section 80-IAC, fast-track trademark); trademark "ClaimClock" in Classes 36, 42, 45; `claimclock.in` and Hindi brand; founders' IP assignment; AGPL + CC BY notices; privacy and grievance officer named on `/privacy/`.

---

## 12. Metrics and Unit Economics

**North star:** rupees recovered or protected for users (deductions reversed + interest obtained + hours of discharge delay avoided × documented cost), measured via opt-in reports.

| Stage | Metric | Target (18 months) |
|---|---|---|
| Acquisition | Clocks started / week; share of visits from `/s/` pages and press | 10,000 clocks total |
| Activation | Clock → letter sent within 10 min | ≥ 60% |
| Outcome | Discharge ≤ 3 h after letter; deduction lines reversed; GRO reply ≤ 14 days; Ombudsman award rate vs. 56% baseline | Reported and published |
| Retention | Vault MAU; renewal-season return rate | ≥ 50% return at renewal |
| Data | Opt-in reports; published cells (n ≥ 20) | 2,500 reports |
| Revenue | Teams lives; Desk beds; Plus families; escalation cases | First ₹ by month 9 |

**Cost phasing — what is allowed when.**

| Phase | Monthly cost | Allowed services | Unlock condition |
|---|---|---|---|
| **Phase 1–2 (M20–M28): rollout** | **₹0** | Cloudflare Workers Free, D1 Free, static assets, Turnstile Free, Groq Free tier (no card), browser Web Speech / Web Audio, PWA push, email sent by the user's own client, DigiLocker Requester (free onboarding), GitHub Actions free minutes | None — this is the starting state |
| **Phase 3 (M29–M31): first revenue** | First paid items only | Workers Paid ($5/month) if free limits are hit; WhatsApp utility templates (₹0.115 + GST) **only for Plus/Teams users**; Razorpay/UPI fees on actual payments | A paying Plus family or Teams pilot exists; the cost is covered by that revenue |
| **Phase 4 (M23–M24, M32–M36): expansion** | Scales with revenue | Paid Groq / Workers AI tiers behind Plus; D1 overages; partner (AA FIU) fees; professional review fees | Gross margin stays > 80% per paying unit |

**Infra cost curve (published prices, Oct 2026).**
- Workers Free: 100k requests/day, D1 5M reads / 100k writes per day — sufficient to ~5,000 DAU.
- Workers Paid: $5/month includes 10M requests and 30M CPU-ms; $0.30 per extra million requests; D1 includes 25B reads and 50M writes per month, then $1 per million writes and $0.75/GB-month; Workers AI $0.011 per 1,000 neurons after 10k/day free.
- Speech/LLM: Groq free tier for the voice agent until ~2,000 transcriptions/day; move paid tiers behind Plus. Keep the deterministic rules engine primary so the LLM is optional.
- Messaging: WhatsApp utility ≈ ₹0.136 per message; a Plus family with 8 renewal and claim messages a year costs ≈ ₹1.1.
- Implication: a ₹999/year Plus family carries > 95% gross margin; Teams at ₹20/employee/month is pure margin on infra; costs are people (rules curation, human review, sales), not servers.

---

## 13. Milestone Execution Sequence for the Coding Agent

Execute in this order, committing and updating `RESUME.md` at the end of each milestone. Milestone numbers are stable; the order below is the recommended business sequence (retention and revenue before new insurance lines). Each milestone adds rules to `data/rules.json` with `source_url`, `paragraph`, `quote`, `plain_en`, `plain_hi`, and snapshot tests, following the existing pattern.

**Cost rule for the agent (revised 17 Oct 2026).** Default to free or very-low-cost services and keep the code open source. A paid service may be added only where the free path clearly compromises the result (for example natural Hindi speech), and always behind an operator flag with a per-day spend cap, a browser/deterministic fallback and a note in `RESUME.md`; the free-tier path must keep working when the paid one is off. Phases 1–2 shipped on ₹0 apart from this optional premium voice.

### Phase 1 — Core account and intelligence (M20–M22)
- [x] **M20 — User Login, Profile & Family Policy Vault** (shipped 16 Oct 2026; see `RESUME.md` for scope notes — the cross-device pairing code became a recovery link + PRF unlock, and the DigiLocker adapter is a stub awaiting API Setu partner credentials):
  - Add `migrations/0004_user_vaults.sql` (WebAuthn Passkeys + encrypted Vault sync in D1 + short cross-device pairing code + buddy grants table).
  - Create `data/plans.json` (curated retail health plans across major insurers with verified CIS rules: room cap, co-pay, PED wait, consumables, annual health checkup limit & booking mode, renewal month).
  - Create `src/lib/policy-parser.ts` (on-device PDF/CIS parser) + `src/pages/vault.astro` (My Profile, Family Members, My Policies) + DigiLocker Requester adapter behind `PolicySourceAdapter`.
  - Wire logged-in user profile + selected policy into `/`, `/deductions/`, and `/rejected/` so letters auto-fill `[Your name]`, `[Policy number]`, and `[Claim number]` from the user's saved vault.
- [x] **M21 — "Is This Covered?" Simulator & Family Plan Comparison** (shipped 16 Oct 2026; see `RESUME.md` for scope notes — OPD/diagnostics is answered as the pre-/post-hospitalisation window rather than a standalone OPD calculator, and the "recommender" gives structural family advice, never a plan pick):
  - Build `src/pages/check-coverage.astro` + `src/lib/coverage-simulator.ts` (Full-Body Checkup, OPD/Diagnostics, Room Upgrade impact calculator, Surgery sub-limits, Waiting Period & 60-Month Moratorium tracker).
  - Build `src/pages/compare.astro` + `src/lib/plan-compare.ts` (Family profile recommender + side-by-side plan comparison combining CIS trap rules with the NL-48 discharge-speed dataset; no premiums, no quotes, CIS links).
- [x] **M22 — Grok-Style Interactive Live Voice Agent ("ClaimClock Voice", now named Saathi)** (shipped 17 Oct 2026; revised the same day as M22.1 — streamed sentence-by-sentence replies, a redesigned bottom-sheet UI with suggestion chips, Hindi replies to Hindi questions, and an optional **premium voice** route (`/api/voice/speak`, Sarvam Bulbul or OpenAI gpt-4o-mini-tts) behind an explicit paid flag, the first deliberate exception to the ₹0 rule: paid only where it clearly improves the result; and M22.2 the same day — one-tap start/send with Stop, keep-listening as an opt-in, chats saved on the device with a chat list, quality-first browser voice choice, an Azure free-tier voice adapter, and the Saathi eval harness that scores the live model (72% → 100% on the 18-scenario set after fixes it surfaced). See `RESUME.md` for scope notes; `track_reimbursement` answers honestly that the tracker arrives with M26):
  - Update `public/_headers` to `Permissions-Policy: camera=(), microphone=(self), geolocation=()`.
  - Add `/api/voice/transcribe` (`whisper-large-v3-turbo` on Groq Free Tier) and `/api/copilot` (`openai/gpt-oss-120b` with tool-calling) in `worker/app.ts`, protected by Turnstile + D1 quotas.
  - Build `src/components/VoiceCopilot.astro` + `src/lib/voice-agent.ts` with hands-free VAD, live voice orb/waveform, instant barge-in interruption, `en-IN`/`hi-IN` spoken output, and the client-side executable tools (`check_policy_benefit`, `recommend_or_compare_plans`, `manage_claim_clock`, `audit_bill_deductions`, `draft_and_queue_action`, `save_user_policy`, `check_renewal`, `track_reimbursement`).

### Phase 2 — Retention and money recovery (M25–M28)
- [x] **M25 — Renewal Guardian (§6.1)** (shipped 18 October 2026; see `RESUME.md` for scope notes — **source correction:** the current PPHI Master Circular (Sec. 2 Ch. VI 24.2) sets the porting window at **30 to 60 days** before renewal with insurer discretion to 15 days, so the planned `porting-45-days` rule became `porting-window-30-60-days` and T-45 is kept only as a planning checkpoint; the 15 rules also include `renewal-not-denied-for-claims`, `renewal-loading-portfolio-only`, `porting-credits-no-charges`, `migration-credits-36-months` and `proposal-decision-7-days`; reminders ship as a `.ics` file with same-day alarms plus in-app countdowns rather than Web Push, which would need VAPID secrets and server-side dates): `src/pages/renewal.astro`, `src/lib/renewal.ts`; rules `senior-premium-cap-10pct`, `free-look-30-days`, `free-look-refund-7-days`, `porting-window-30-60-days`, `porting-records-72h`, `porting-decision-5-days`, `migration-30-days`, `group-to-individual-migration`, `grace-period-15-30-days`, `gst-exempt-individual-health-2025-09-22`; calendar reminders; premium-hike complaint letter and Bima draft; Free-Look Rescue diff and cancellation letter; porting checklist with a porting-delay letter; migration helper with a migration-request letter.
- [ ] **M26 — Reimbursement Tracker + Fair-Bill Benchmark (§6.2, §6.5):** `src/pages/reimbursement.astro`, `src/lib/reimbursement.ts`, `src/lib/fair-bill.ts`, `data/cghs-rates.json` (curated subset with tier rules and source OM dates); rules `reimbursement-15-days`, `penal-interest-bank-rate-plus-2`, `documents-at-one-go`, `bank-rate-fy`; interest calculator; piecemeal-query objection letter; settlement-interest demand; rate-card prompt (Rule 9(i)).
- [ ] **M27 — Claim Buddy, Elder mode, Group-policy module (§6.3, §6.4):** buddy grants UI; elder layout and voice-first entry; `src/pages/group.astro`, `src/lib/group.ts`; TPA e-card parsing; HR/TPA escalation letters; exit-migration letter; parents' gap finder; shareable status card.
- [ ] **M28 — Evidence Locker + Consumer-Court kit (§6.6):** `src/lib/evidence.ts` (hash-chained timeline, PDF annexure export); `src/pages/consumer-court.astro` (jurisdiction, fee slab, limitation, templates); rules `consumer-commission-jurisdiction-2021-rules`, `consumer-fee-nil-upto-5-lakh`, `limitation-2-years-s69`.

### Phase 3 — Data moat and first revenue (M29–M31)
- [ ] **M29 — ClaimClock Index v2 / Claim Weather (§6.8):** extend report schema (`migrations/0005_report_outcomes.sql`), aggregates by insurer × TPA × city × month with n ≥ 20 suppression, programmatic `/s/` and `/plans/` pages, methodology and right-of-reply page, monthly auto-drafted post.
- [ ] **M30 — Cashless-network & suspension checker (§6.7):** `data/network-alerts.json` + weekly source-check workflow; pre-admission check flow linking to Reimbursement Tracker.
- [ ] **M31 — ClaimClock for Teams (§10.4):** `migrations/0006_orgs.sql` (orgs, memberships, invites); org admin pages; anonymised HR dashboard (aggregates only, n ≥ 10); Razorpay/UPI billing; per-org TPA scorecard. **Gate:** 5 signed SME pilots before build starts.

### Phase 4 — Expansion (M23–M24, M32–M36)
- [ ] **M23 — Life Insurance Module (`/life/`):** PPHI life rules (15d / 45d + Bank Rate + 2%) and Insurance Act Section 45 in `data/rules.json`; `src/pages/life.astro` + `src/lib/life.ts`; register Life policies in the Vault and Voice Agent.
- [ ] **M24 — Motor Insurance Module (`/motor/`):** PPHI motor rules (24h surveyor / 48h inspection / 15d report / 7d settlement); `src/pages/motor.astro` + `src/lib/motor.ts` (3-stage surveyor clock + Zero-Dep / Consumables / IDV auditor); Vault and Voice Agent registration.
- [ ] **M32 — ClaimClock Desk (§10.5):** hospital accounts, live clock board, letterhead letters, delay-evidence export, NHCX adapter stub (FHIR claim-status read). **Gate:** 3 hospital LOIs.
- [ ] **M33 — Expert Escalation marketplace (§10.3):** partner directory, consented encrypted case hand-off, flat fees, outcome tracking, disclosures.
- [ ] **M34 — DPDP compliance pack (§11.2):** `docs/dpdp-compliance.md`, itemised bilingual consent notices, erasure SLAs, breach runbook, log retention, minors' consent flow, grievance officer. **Deadline: before 13 May 2027.**
- [ ] **M35 — Open Rules API + MCP server (§6.9):** `/api/rules`, `/mcp`, CC BY 4.0 notices, rate limits, attribution requirement.
- [ ] **M36 — PM-JAY / state-scheme module (§6.10):** 6-hour SOS clock, CGRMS draft, 14555 script. Grant-funded.

---

## 14. Founder Operating Plan (Non-Code)

**Next 90 days — validate before building Phase 3.**
1. Talk to 30 recent claimants (LocalCircles, Reddit, RWAs, hospital waiting areas). Confirm willingness to pay ₹999/year for Plus and what they would pay for flat-fee escalation.
2. Visit 10 hospitals' TPA desks with the poster and the Desk mock-up; collect 3 LOIs for a free pilot.
3. Pitch 10 SME founders/HR heads on Teams; collect 5 pilot sign-ups at ₹0 for 6 months in exchange for data and testimonials.
4. Recruit an advisory board of four: an insurance lawyer, a former Ombudsman office official or TPA operations head, a hospital administrator, and a practising physician. Equity advisory grants, not cash.
5. Incorporate; file trademark; apply for DPIIT recognition; open the Startup India seed-fund application.
6. Publish the first "Claim Weather" post from existing opt-in data (even if n is small, publish methodology and gaps honestly).
7. Write the Outcomes & Limitations page before any paid tier launches.

**Fundraising narrative (if pursued).** Consumer insur-tech in India raised on distribution; ClaimClock raises on the claim moment and the data nobody else has. Comparable signals: Insurance Samadhan (~$5M, contingency fees), ClaimBuddy (profitable at ₹14.6 Cr), Plum (Series B on claims NPS). Non-dilutive first: Startup India seed fund, CSR for insurance literacy, foundation grants for consumer protection.

**Honest risks and mitigations.**
- *Regulation fixes the problem.* Grievances rose 41% a year after the 2024 circulars; enforcement, not rules, is the gap. NHCX and PIR make our adapters more valuable, not less.
- *Insurer pushback on public tables.* Methodology, suppression, right of reply, primary-source citations.
- *AI errors in letters.* Deterministic templates from `rules.json`; the LLM only phrases; human review on paid tiers.
- *Free-tier dependence.* Rules engine works with the LLM disabled (already true); paid Groq/Workers AI behind Plus.
- *Founder bandwidth.* Phase gates (LOIs, pilots) before each B2B build; no Life/Motor before Phase 2 ships.

---

## Appendix A — Primary Sources Used (accessed 14 Oct 2026)

**Regulation**
- IRDAI Master Circular on Health Insurance Business, 29 May 2024 — https://irdai.gov.in (Ch. I 13, 15, 16, 17, 18; Ch. II migration/portability)
- IRDAI Master Circular on Protection of Policyholders' Interests, 5 Sep 2024 — 15-day non-cashless settlement; Bank Rate + 2% interest suo moto; documents at one go; life 15/45 days; motor 24h/48h/15d/7d; Ombudsman award 30 days / ₹5,000 per day — https://www.caalley.com/irdai_mc/MC_Protection_of_Policyholders_interests_2024.pdf
- IRDAI PPHI Regulations 2024 — 30-day free look; refund within 7 days; "Bank Rate" definition — https://irdai.gov.in
- IRDAI circular on senior-citizen premium revision (≤10%/yr), 30 Jan 2025 — https://irdai.gov.in/en/document-detail?documentId=6639156
- IRDAI Guidelines on Migration and Portability (group→individual; 30-day application; 15-day underwriting decision) — https://irdai.gov.in/en/document-detail?documentId=393128
- IRDAI public disclosure formats NL-48 (cashless TAT buckets) — https://irdai.gov.in/en/document-detail?documentId=394636
- IRDAI Web Aggregator Regulations 2017 (consolidated 2020); Corporate Agent Regulations 2015; ISNP FAQs — https://irdai.gov.in
- IRDAI Public Consultation Paper "Recalibrating Economics of Insurance Distribution", 23 Sep 2026 — https://www.caalley.com/exp_drafts/irdai_draft_0923.pdf
- Sabka Bima Sabki Raksha (Amendment of Insurance Laws) Act, 2025 — PIB, 17 Dec 2025; in force 5 Feb 2026 — https://www.pib.gov.in/PressReleasePage.aspx?PRID=2206011
- DPDP Rules 2025, G.S.R. 846(E), 13 Nov 2025; MeitY explanatory note and enforcement timeline — https://www.meity.gov.in
- Clinical Establishments (Central Government) Rules 2012, Rule 9; Centre's affidavit in All India Ophthalmological Society v. Union of India; Health Ministry letter on rate display, Oct 2026 — Bar & Bench, LiveLaw
- CGHS revised package rates OM, 3 Oct 2025 (effective 13 Oct 2025) — https://cghs.mohfw.gov.in
- NHA PM-JAY grievance guidelines (CGRMS, 14555, SOS 6 working hours) — https://nha.gov.in
- Consumer Protection (Jurisdiction) Rules 2021; e-Jagriti filing guide and PIB release — https://e-jagriti.gov.in

**Data**
- IRDAI Annual Report 2024-25 and Handbook on Indian Insurance Statistics 2024-25 (Tables 53, 56, 57, 58, 62) — https://irdai.gov.in
- Lok Sabha replies (Dept. of Financial Services) on Bima Bharosa complaints FY24–FY26 — https://sansad.in
- PIB: claims paid ratio 85.66% / 82.46% / 87.50%; 1 h / 3 h cashless timelines — https://www.pib.gov.in/PressReleasePage.aspx?PRID=2245575
- LocalCircles health insurance claim survey 2026 — https://www.localcircles.com/a/press/page/health-insurance-claim-survey
- Policybazaar "Is India Happy with Health Insurance Claims? 2.0" — Business Line, Times of India
- Hansa Research Health Insurance CuES 2026 — Moneylife
- Mint analyses of NL-47 retention and portability (2026); Moneycontrol on renewal hikes one year after GST removal (6 Oct 2026)
- NHCX adoption figures (Sep 2026) — Healthcare Pulse Edition 76; CNBC-TV18; NHA payer implementation guide 2026
- Bima Sugam status (27–30 Sep 2026) — The Insurance Reporter; Polisync; Moneycontrol
- Sahamati: FI types, FIP/FIU eligibility, TSP role, circular on enabling all FI types (deadline 30 Nov 2026) — https://sahamati.org.in
- DigiLocker issuer example (United India health policies); API Setu Requester specification — https://uiic.co.in; https://apisetu.gov.in/digilocker
- Meta WhatsApp Business Platform India rate card effective 1 Oct 2026 — Moneycontrol; VartaAPI
- Cloudflare Workers, D1 and Workers AI pricing — https://developers.cloudflare.com

**Companies**
- Insurance Samadhan pricing and funding — https://www.insurancesamadhan.com; Inc42; PitchBook; Tracxn
- ClaimBuddy FY25 financials and Series A — Inc42; YourStory; https://claimbuddy.in
- Plum Series B (26 Mar 2026), FY25 financials — Plum Newsroom; Times of India; UnpopularVoice
- Onsurity and Loop public pages; Ditto "Ditto's Cut"; Beshak CARES FAQ
- Medi Assist FY26 investor update (11 May 2026); Vitraya product pages
- Claimable, Counterforce Health, Fight Health Insurance — company sites; NBC News; PYMNTS (Apr 2026)
- Resolver UK business model — https://www.resolver.co.uk; TechCrunch
- FTC v. DoNotPay final order, 11 Feb 2025 — https://www.ftc.gov
