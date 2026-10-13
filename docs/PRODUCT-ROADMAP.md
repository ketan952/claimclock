# ClaimClock Product Evolution Roadmap & Agent Implementation Blueprint

**Last updated:** 14 October 2026  
**Repository:** `ketan952/claimclock`  
**Live URL:** https://claimclock.ketan952.workers.dev/  
**Core invariants to preserve across all phases:**
- **₹0/month recurring infrastructure cost:** Cloudflare Workers Free plan + D1 + static assets + free-tier OpenAI-compatible LLM (`openai/gpt-oss-120b` on Groq/Cerebras).
- **Emergency flows never blocked by login:** A stressed family in a hospital corridor must always be able to start the cashless clock in 60 seconds without creating an account. Login/Sync is **progressive and optional** — built for year-round policy storage, family coverage checks, and multi-device access.
- **Privacy & DPDP-first:** Raw medical/policy PDFs are parsed on-device (`pdfjs-dist` + `tesseract.js`). When a user enables cloud sync for their Policy Vault, the vault is **client-side encrypted (WebCrypto AES-GCM)** before touching Cloudflare D1, or stores only structured non-medical policy metadata with explicit consent.
- **Regulatory boundary (IRDAI):** ClaimClock is an informational consumer-rights & policy-literacy tool, **not** an insurance broker, corporate agent, or web aggregator. Plan comparisons use public Customer Information Sheets (CIS), official policy wordings, and IRDAI NL-48 claim-speed disclosures, with zero commissions, zero affiliate links, and an explicit educational notice.

---

## Why This Evolution Matters (From "Emergency Clock" to "Full-Lifecycle Insurance Companion")

Right now, ClaimClock only meets the user **when something has already gone wrong** (at the hospital discharge desk or after a claim cut/rejection).  
To stand out in the market and become a product families keep on their phones year-round, ClaimClock should cover the **entire lifecycle**:

1. **Before Buying (Plan Discovery & Family Comparison):** *"Which health/term/motor policy has the fewest hidden traps and fastest real discharge speed for my family?"*
2. **After Buying (My Policy Vault & Login):** *"Keep my family's policies in one place — uploaded from my PDF/e-card or selected from the catalog — synced safely across our phones."*
3. **Everyday Use ("Is This Covered?" Simulator):** *"If I go for an annual full-body checkup, OPD test, cataract surgery, or robotic procedure today, will my policy pay for it, how much, and how do I claim it?"*
4. **During a Claim (Live Statutory Clock + Deduction Audit + Escalation):** *(Already live for Health; extend to Life & Motor statutory clocks).*
5. **Grok-Style Agentic Copilot ("ClaimClock Sahayak"):** A conversational AI agent that knows the user's saved policies and active claims, answers coverage questions in plain English/Hindi, and **executes actions inside the app on the user's behalf** via tool calling.

---

## Technical Reality Check: Dynamic Policy Fetch vs. Static/Smart Upload in India (Oct 2026)

How can a user add their insurance policy to ClaimClock?

| Method | How it works | Legal / Cost Reality in Oct 2026 | Phase to Support |
|---|---|---|---|
| **1. Smart On-Device Policy PDF / CIS / e-Card Upload** | User drops their Policy Schedule or Customer Information Sheet (CIS) PDF/photo. On-device parser extracts Insurer, Plan Name, Sum Insured, Room Rent Cap, Co-pay %, Waiting Periods, Free Health Checkup limit, Consumables Rider, and Renewal Date. | **100% Free, works today for all 32 insurers**, zero third-party API dependency, zero PII leaked. | **Phase 1 (Immediate)** |
| **2. Pick Insurer + Plan from Curated Catalog** | User selects their Insurer + Plan Name (e.g., *HDFC ERGO Optima Secure*, *Niva Bupa ReAssure 2.0*, *Star Comprehensive*, *Care Supreme*, *ICICI Lombard Elevate*) + enters Sum Insured & Policy Start Year. App loads the verified CIS rules for that plan. | **100% Free, works today**, instant even if the user doesn't have the PDF on their phone. | **Phase 1 (Immediate)** |
| **3. DigiLocker / e-Insurance Account (eIA) Import** | User exports their policy PDF/XML from DigiLocker or NSDL NIR / CDSL CAMSRep eIA and imports it into ClaimClock. | **100% Free** (user-mediated file import). Direct DigiLocker Partner API requires government/regulated entity onboarding. | **Phase 2** |
| **4. Mobile-Number Auto-Fetch (Bima Sugam / Account Aggregator)** | IRDAI's **Bima Sugam** (Public Insurance Registry + *Bima Pehchaan* ID) is slated for phased public rollout starting late 2026, and RBI/IRDAI's **Account Aggregator (Sahamati)** allows regulated FIUs to fetch policy records via mobile OTP + Aadhaar/PAN e-KYC. | Requires a licensed regulated entity (Broker/FIU) and paid OTP/AA gateway fees; **not available to an unlicensed ₹0 open-source app**. Build a pluggable `PolicySourceAdapter` interface now so Bima Sugam / AA can be plugged in if an institutional partner or license is added later. | **Adapter in Phase 1; Live API only if licensed later** |

---

## Phased Rollout Plan (For Agent Implementation)

### Phase 1: Optional Passkey/Code Login + "My Family Policy Vault" + Smart Policy Parser
**Goal:** Let users save their family's policies across devices without breaking the zero-cost, privacy-first architecture, and keep the hospital clock 100% usable without login.

#### 1.1 Zero-Cost, Zero-SMS Authentication ("Vault Account")
Because SMS OTP in India requires DLT registration and per-SMS cost, use **two 100% free, passwordless methods** backed by Cloudflare D1:
- **Option A — WebAuthn Passkeys (Primary):** One-tap biometric login (FaceID / Android fingerprint) using the browser's native `navigator.credentials.create()` / `get()`. Free, phishing-resistant, no SMS or email server required.
- **Option B — Encrypted Vault Key + QR / Recovery Phrase (Fallback & Family Sharing):** Every user vault gets a client-side 256-bit master key. The user's policies and claim timelines are encrypted in the browser (`AES-GCM`) before syncing to D1 (`vaults` table). A husband and wife can share the same Family Vault on both phones by scanning a QR code — the server only ever sees ciphertext.

#### 1.2 How a User Adds Their Policy (`src/pages/vault.astro` + `src/lib/policy-parser.ts`)
Support **both** static catalog selection and dynamic PDF extraction:
1. **"Select My Insurer & Plan" (30 seconds):**
   - Pick Insurer → Pick Plan (from `data/plans.json`) → Enter Sum Insured (e.g. ₹10L), Policy Inception Year (to auto-compute Waiting Period completion and the 60-Month Moratorium!), and Covered Family Members (Self, Spouse, Kids, Parents + ages).
2. **"Upload Policy Schedule or CIS PDF" (On-device parser):**
   - Uses `extractFile()` (`src/lib/extract.ts`) + a deterministic parser `parsePolicySchedule(text)` that extracts:
     - `insurerId` and `planName`
     - `sumInsured`, `noClaimBonus`, `restorationBenefit`
     - `roomRentRule` (`no-cap` | `single-private-ac` | `1%-of-si` | `fixed-per-day`)
     - `coPayPercent` (0%, 10%, 20% age/zone based)
     - `waitingPeriods` (Initial 30d, Specific diseases 24m, Pre-existing diseases 12m/24m/36m)
     - `healthCheckupBenefit` (e.g., eligible every year, limit up to ₹5,000, cashless/reimbursement mode)
     - `opdLimit` (₹0 or specific rider limit)
     - `consumablesCovered` (`true` if Safeguard / Non-medical rider / Optima Secure in-built cover is present, else `false`)
     - `inceptionDate` and `renewalDate` (with downloadable `.ics` renewal & free-checkup reminders).

#### 1.3 Files to Create / Modify in Phase 1
- `migrations/0004_user_vaults.sql`: `vaults(id TEXT PRIMARY KEY, credential_id TEXT UNIQUE, public_key TEXT, ciphertext TEXT NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`.
- `data/plans.json`: Structured dataset of the top 25 Indian retail health insurance plans across Star, HDFC ERGO, Niva Bupa, Care, ICICI Lombard, Aditya Birla, Tata AIG, Bajaj, SBI General, New India, National, Oriental, United India, Go Digit, Acko, ManipalCigna, with source URLs to each plan's official Customer Information Sheet (CIS) / policy wording and verified date.
- `src/lib/policy-parser.ts`: Pure on-device extractor for Policy Schedule / CIS PDFs + unit tests in `tests/policy-parser.test.ts`.
- `src/pages/vault.astro` & `src/lib/vault-ui.ts`: Family Policy Vault UI (English + Hindi) that pre-fills the Hospital Clock, Deductions Audit, and Rejection flows automatically from the user's saved policy!

---

### Phase 2: "Is This Covered?" Benefit & Checkup Simulator + Family Plan Recommender & Comparison
**Goal:** Answer the two everyday questions users ask *before* a hospital admission:
1. *"I have Plan X — if I go for a full-body checkup / OPD test / cataract surgery, is it covered?"*
2. *"I want to buy or port health insurance for my family (or parents) — which plan should I look at, and how do Plan A and Plan B compare?"*

#### 2.1 "Is This Covered?" Simulator (`src/pages/check-coverage.astro` + `src/lib/coverage-simulator.ts`)
Using the user's saved policy from their Vault (or a quick selected plan + uploaded CIS PDF), let the user pick or search a scenario:
- **Preventive / Full-Body Health Checkup:**
  - Shows whether their plan includes an annual health checkup (e.g., *"Covered once every policy year up to ₹5,000 for 2 adults; available from Year 1/Renewal; does not reduce No-Claim Bonus"*).
  - Crucial warning for users: **How to book it** — many insurers only pay for annual health checkups if booked cashless through the insurer's app at a diagnostic center, while others allow reimbursement with a receipt. Shows the exact rule for their plan!
- **OPD Consultation, Blood Tests, or MRI without 24-hour Admission:**
  - Warns clearly: unless the policy has an OPD rider (or the test is within the Pre-Hospitalisation window — typically 30–60 days *before* an inpatient admission for the *same* illness), standalone OPD/diagnostic tests are rejected under "primarily for investigation/evaluation".
- **Day-Care Procedures (<24 hours, e.g., Cataract, Dialysis, Chemo, Angiography):**
  - Checks day-care coverage + checks if a procedure sub-limit (e.g. cataract per-eye cap) applies.
- **Room Category Check ("Can I take a Single Private AC / Deluxe Room?"):**
  - Compares the hospital room they plan to take against their policy's `roomRentRule` and warns *before admission* if taking a Deluxe room will trigger a 30–40% proportionate cut on Surgeon & OT fees!
- **Waiting Period & 60-Month Moratorium Check:**
  - Uses their policy start year (including ported years) to show which waiting periods are already over and whether the **60-month Moratorium rule (Chapter I 13)** now protects them.

#### 2.2 Family Plan Recommender & Side-by-Side Comparison (`src/pages/compare.astro` + `src/lib/plan-compare.ts`)
- **Family Profile Intake (On-device):**
  - Who are you covering? *(Self & Spouse / Young Kids / Senior Citizen Parents 60+)*
  - Tip #1 shown automatically: **Never put 60+ senior parents in the same floater as a 30-year-old couple** (premiums are priced on the oldest member's age, and a parent's co-pay or frequent claims affect the whole floater).
  - Pre-existing conditions? *(Diabetes / Hypertension / None)*
  - City tier & target hospital room *(Single Private Room, no room-rent cap)*.
- **Neutral, Commission-Free Filter & Side-by-Side Comparison (2 or 3 plans):**
  Compares plans across **7 trap-free dimensions** (never sales brochures):
  1. **Real Discharge Speed (from our IRDAI NL-48 dataset):** % of individual cashless discharges under 1 hour vs. 2–6 hours.
  2. **Room Rent Rule:** "Any Room / Single Private AC" (Good) vs. "1% of Sum Insured per day + Proportionate Deduction" (Trap).
  3. **Co-payment:** 0% vs. mandatory 10–20% zonal or age co-pay.
  4. **Consumables / Non-Medical Items:** In-built / Rider available vs. excluded.
  5. **Pre-existing Disease (PED) Waiting Period:** 12 / 24 / 36 months.
  6. **Annual Full-Body Health Checkup & OPD benefit:** Annual limit & cashless vs. reimbursement rules.
  7. **Disease Sub-limits:** None vs. caps on cataract, joint replacement, robotic/modern treatments.

---

### Phase 3: Grok-Style Agentic Copilot ("ClaimClock Sahayak") with Tool Calling
**Goal:** Give the user a fast, direct, bilingual chat interface (`/copilot/` + floating drawer on every page) powered by our free-tier LLM (`openai/gpt-oss-120b` on Groq/Cerebras) that **knows their saved policy and active claims** and can **take actions on their behalf** through deterministic client-side tools.

#### 3.1 How the Agentic Copilot Works Safely at ₹0 Cost
- **Context Grounding (Local-First):** The browser builds a compact, redacted context packet from the user's local Vault (Insurer, Plan Name, Sum Insured, Room Cap, Co-pay, Health Checkup limit, Policy Age, Active Clock state, Reviewed Deductions) and sends it with the user's question to `/api/copilot` (protected by Cloudflare Turnstile + existing D1 quotas).
- **Executable Tool Calls (The Bot Does the Work for the User):**
  Instead of just replying with text, the model returns structured tool calls that the browser executes immediately:
  1. `tool:check_benefit({ query: "full body checkup" | "cataract" | "deluxe room" })` → Runs the coverage simulator against the user's saved policy and renders an instant verdict card in chat.
  2. `tool:compare_plans({ planA, planB, familyProfile })` → Renders the side-by-side trap & NL-48 speed comparison table right in chat.
  3. `tool:start_or_update_clock({ insurerId, requestType, submittedAt, hospital, eventNote })` → Creates or updates the user's live hospital clock and opens the clock card.
  4. `tool:audit_deductions({ lines })` → Classifies deducted lines from the user's message or uploaded PDF and shows the challengeable vs. valid breakdown.
  5. `tool:prepare_and_send_action({ actionType: "lock" | "followup" | "gro" | "bima" | "ombudsman" | "doctor-note" | "reimbursement-desk" | "two-policies" })` → Generates the exact rule-cited letter, pre-fills the recipient (`mailto:` to the insurer's verified GRO/claims email, or WhatsApp share, or portal link), and presents a **one-tap "Confirm & Send" card** in the chat so the user approves the outbound action in one tap!
- **Graceful Zero-LLM Fallback:** If the daily free LLM quota is exhausted or the user is offline, `/copilot/` falls back to an on-device intent router that still runs all 5 tools deterministically!

---

### Phase 4: Multi-Insurance Expansion — Life Insurance (Term/Endowment) & Motor Insurance
**Goal:** Extend ClaimClock from Health Insurance into a complete **Indian Policyholder Rights & Claims Platform** covering **Life Insurance** and **Motor Insurance**, using the exact same statutory-clock + deduction-audit + escalation architecture.

#### 4.1 Life Insurance Module (`/life/` — Term & Savings/Endowment Claims)
Grounded in the **Insurance Act, 1938 (Section 45)** and **IRDAI Master Circular on Protection of Policyholders' Interests (5 September 2024)**:
1. **The Life Claim Statutory Clock:**
   - **15-Day Rule (No Investigation):** Death claim must be settled within **15 days** of claim intimation.
   - **45-Day Rule (With Investigation):** Where investigation is warranted, all queries must be raised in one go within 15 days and the claim must be settled within **45 days** of intimation.
   - **Penal Interest Calculator:** Any delay beyond the 15/45-day statutory window entitles the nominee to **Bank Rate + 2% penal interest** *suo-moto* from the date of intimation till payment!
2. **Section 45 Three-Year Indisputability Shield (The Strongest Law in Indian Insurance):**
   - Under **Section 45 of the Insurance Act, 1938**, **no policy of life insurance shall be called in question on any ground whatsoever after the expiry of 3 years (36 months)** from the date of issuance of the policy, date of commencement of risk, date of revival, or date of rider!
   - Even within 3 years, the insurer bears the burden of proving deliberate suppression of a material fact connected to the insured's expectancy of life.
   - Generates a nominee-ready **GRO Representation & Life Ombudsman Complaint** citing Section 45 and the 15/45-day PPHI turnaround rules.
3. **Nominee Document Checklist:** Death certificate, original policy bond / eIA statement, claimant statement, KYC & cancelled cheque, treating doctor / hospital last-attendance certificate, and FIR/post-mortem report (only for accidental/unnatural death — blocks insurers from demanding FIRs for natural deaths!).

#### 4.2 Motor Insurance Module (`/motor/` — Car & Two-Wheeler Claims)
Grounded in the **IRDAI PPHI Master Circular (5 September 2024 — Retail General Insurance TATs)**:
1. **The 3-Stage Motor Statutory Clock:**
   - **24 Hours:** Insurer must allocate a registered surveyor within **24 hours** of claim intimation (mandatory for motor claims ≥ ₹50,000).
   - **48 Hours / 15 Days:** Surveyor must start survey within 48 hours and submit the final survey report within **15 days** of allocation.
   - **7 Days:** Insurer must decide and settle the claim within **7 days** of receiving the survey report.
2. **Motor Deduction & Estimate Auditor:**
   - Audits garage bill vs. surveyor assessment for:
     - **Zero-Depreciation (Bumper-to-Bumper) add-on violations:** Flagging unlawful 30–50% plastic/rubber/metal/fibreglass depreciation cuts when the policy has a Zero-Dep add-on.
     - **Consumables add-on checks:** Engine oil, coolant, nuts/bolts, AC gas, brake oil.
     - **IDV (Insured Declared Value) Total Loss / Constructive Total Loss (>75% of IDV) disputes:** Citing the rule that on total loss/theft, the agreed IDV is binding and cannot be arbitrarily depreciated at claim time.
     - **Wrongful No-Claim Bonus (NCB) recovery or towing charge disallowance.**

---

## Milestone Checklist for the Implementing Agent

When an agent is asked to implement this roadmap, execute in the following strict milestone order, committing and updating `RESUME.md` after each milestone:

- [ ] **M20 (Phase 1A — Plan Catalog & On-Device Policy Schedule Parser):**
  - Create `data/plans.json` (top 25 retail health plans with verified CIS fields & source links).
  - Create `src/lib/policy-parser.ts` + `tests/policy-parser.test.ts` to extract structured benefits from uploaded Policy Schedule / CIS PDFs.
- [ ] **M21 (Phase 1B — Family Policy Vault & Optional Passkey/Encrypted Sync):**
  - Build `src/pages/vault.astro` + `src/lib/vault-ui.ts` (local IndexedDB/localStorage vault first, plus optional WebAuthn Passkey + AES-GCM encrypted D1 sync via `migrations/0004_user_vaults.sql`).
  - Auto-link saved policies into the Hospital Clock (`/`), Deductions (`/deductions/`), and Rejection (`/rejected/`) pages.
- [ ] **M22 (Phase 2A — "Is This Covered?" Checkup & Benefit Simulator):**
  - Build `src/pages/check-coverage.astro` + `src/lib/coverage-simulator.ts` covering Full-Body Checkups, OPD/Diagnostics, Day-Care/Cataract, Room Upgrades, and Waiting Period / 60-Month Moratorium status.
- [ ] **M23 (Phase 2B — Family Plan Recommender & Side-by-Side Comparison):**
  - Build `src/pages/compare.astro` + `src/lib/plan-compare.ts` combining family profile rules (separating 60+ parents from young floaters), policy trap checks, and our live IRDAI NL-48 discharge-speed data.
- [ ] **M24 (Phase 3 — Grok-Style Agentic Copilot with Tool Calling):**
  - Build `/api/copilot` in `worker/app.ts` + `src/components/CopilotDrawer.astro` + `src/lib/copilot.ts` with the 5 client-executable tools (`check_benefit`, `compare_plans`, `start_or_update_clock`, `audit_deductions`, `prepare_and_send_action`) and a deterministic offline fallback.
- [ ] **M25 (Phase 4A — Life Insurance Statutory Clock & Section 45 Shield):**
  - Add verified Life Insurance PPHI rules + Section 45 to `data/rules.json`, and build `src/pages/life.astro` + `src/lib/life.ts`.
- [ ] **M26 (Phase 4B — Motor Insurance Surveyor Clock & Zero-Dep/IDV Auditor):**
  - Add verified Motor Insurance PPHI rules (24h surveyor / 15d report / 7d settlement) to `data/rules.json`, and build `src/pages/motor.astro` + `src/lib/motor.ts`.
