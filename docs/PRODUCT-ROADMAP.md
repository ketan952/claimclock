# ClaimClock Product Evolution Roadmap & Agent Implementation Blueprint

**Last updated:** 14 October 2026  
**Repository:** `ketan952/claimclock`  
**Live URL:** https://claimclock.ketan952.workers.dev/  
**Core invariants to preserve across all phases:**
- **₹0/month recurring infrastructure cost:** Cloudflare Workers Free plan + D1 + static assets + free-tier OpenAI-compatible LLM & Speech APIs (`openai/gpt-oss-120b` + `whisper-large-v3-turbo` on Groq/Cerebras + Web Speech / Web Audio APIs).
- **User-specific login + emergency guest access:** Provide a full **logged-in, user-specific experience** (Profile, Family Members, Policy Vault, Saved Claims, Voice Agent Memory, and zero `[placeholder]` letters), while still allowing an unauthenticated visitor in a hospital emergency to run the quick clock on-device and save it to their account with one tap later.
- **Privacy & DPDP-first:** Raw medical/policy PDFs are parsed on-device (`pdfjs-dist` + `tesseract.js`). User vault records stored in D1 are protected with client-side encryption (WebCrypto `AES-GCM`) and explicit user consent, with one-click account & data erasure.
- **Regulatory boundary (IRDAI):** ClaimClock is an informational consumer-rights & policy-literacy platform, **not** an insurance broker, corporate agent, or web aggregator. Plan comparisons use public Customer Information Sheets (CIS), official policy wordings, and IRDAI NL-48 claim-speed disclosures, with zero commissions and zero affiliate links.

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

### How Login Works at ₹0/Month (No Paid SMS Gateways)
- **Primary Login — WebAuthn Passkeys (`navigator.credentials`):** One-tap biometric sign-in (FaceID / TouchID / Android fingerprint / Windows Hello) stored in Cloudflare D1 (`users` & `passkey_credentials` tables). Zero passwords to forget, zero SMS DLT cost.
- **Secondary Login / Cross-Device Link — Account Code + Recovery Key / QR:** A 1-tap QR or 12-word/short recovery key so the user can log into their laptop from their phone or share their Family Vault with their spouse in 5 seconds.

---

## 2. Grok-Style Interactive Live Voice Agent ("ClaimClock Voice")

The user should not just type in a chat box — they should be able to **talk live, back-and-forth** with an interactive voice agent (like **Grok Voice Mode**), in **English, Hindi, or Hinglish**, while the agent both **answers out loud** and **executes actions on screen on their behalf**.

### 2.1 How the Live Voice Loop Works (Hands-Free, Real-Time, ₹0 Cost)
1. **Hands-Free Voice Activity Detection (VAD) & Barge-In (`src/lib/voice-agent.ts`):**
   - Uses the browser's `navigator.mediaDevices.getUserMedia({ audio: true })` + Web Audio API `AnalyserNode` to render a live, pulsing **Voice Orb / Waveform** on screen.
   - **Automatic Turn-Taking:** Detects when the user starts speaking and when they pause (~700ms silence threshold), automatically sending the utterance without requiring the user to hold a button.
   - **Instant Barge-In (Interruption):** If the user speaks while the bot is talking, the bot immediately stops speaking (`speechSynthesis.cancel()` / audio buffer stop) and listens to the user — just like Grok Voice Mode.
   - **Important Header Change Required in M20:** Update `public/_headers` from `Permissions-Policy: camera=(), microphone=(), geolocation=()` to `Permissions-Policy: camera=(), microphone=(self), geolocation=()` so microphone access is permitted on `claimclock.ketan952.workers.dev`.
2. **Dual-Engine Speech-to-Text (STT):**
   - **Fast Streaming Path (0ms network cost):** Browser `SpeechRecognition` / `webkitSpeechRecognition` (`lang: 'en-IN'` or `'hi-IN'`) shows live interim words on screen as the user speaks.
   - **High-Accuracy Multilingual Path (Groq Free Tier):** Sends recorded speech chunks (WebM/Opus, capped at 25 seconds) to `/api/voice/transcribe` → Groq `whisper-large-v3-turbo` (free tier: 20 RPM, 2,000 requests/day), which handles Indian accents, medical/insurance terms, and mixed Hindi-English (*Hinglish*) accurately.
3. **Agentic Brain with Live Tool Execution (`/api/copilot` on `openai/gpt-oss-120b`):**
   - System prompt instructs the model to speak in **short, natural, conversational spoken sentences** (2–4 sentences max, no markdown bullet dumps in spoken audio) while returning structured `tool_calls` for visual cards and actions.
   - Grounded in:
     - The logged-in user's **Profile, Family Members, Saved Policies, and Active Claims**.
     - Our verified `data/rules.json`, `data/contacts.json`, `data/plans.json`, and `data/nl48.json`.
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

---

## 3. How Users Add Their Policies (Dynamic + Static Options)

To make adding a policy effortless for any Indian user:

1. **Select Insurer + Plan Name (Catalog Match — 20 seconds):**
   - Pick Insurer → Pick Plan from `data/plans.json` (top 25 Indian retail health, term, and motor plans) → Enter Policy Number, Sum Insured, and Start Year. All plan rules (room rent cap, co-pay, free annual health checkup limit, waiting periods, consumables cover) load automatically.
2. **Upload Policy Schedule / CIS / e-Card PDF or Photo (On-Device Auto-Parser):**
   - Drop the Policy Schedule or Customer Information Sheet (CIS) PDF. Our on-device parser (`src/lib/policy-parser.ts`) extracts the Policy Number, Insurer, Plan Name, Insured Members, Sum Insured, Room Rent Rule, Co-pay, Waiting Periods, Free Health Checkup benefit, and Renewal Date, and saves it to the user's Vault.
3. **Talk to the Voice Bot ("Add my policy by voice"):**
   - The user can simply say: *"I have HDFC ERGO Optima Secure for me and my wife, 10 lakh cover, started in 2023"* — and the voice agent calls `save_user_policy` to add it to their Vault!
4. **Pluggable `PolicySourceAdapter` for DigiLocker / eIA / Bima Sugam:**
   - Includes user-mediated DigiLocker / e-Insurance Account (NSDL NIR / CAMSRep) file import today, and a clean adapter interface ready for IRDAI's **Bima Sugam** (*Bima Pehchaan* mobile-number lookup) once public APIs open to third-party apps.

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

## 6. Milestone Execution Sequence for the Coding Agent

Execute in this exact order, committing and updating `RESUME.md` at the end of each milestone:

- [ ] **M20 — User Login, Profile & Family Policy Vault (`Phase 1`):**
  - Add `migrations/0004_user_vaults.sql` (WebAuthn Passkeys + encrypted Vault sync in D1 + short cross-device pairing code).
  - Create `data/plans.json` (curated retail health plans across major insurers with verified CIS rules: room cap, co-pay, PED wait, consumables, annual health checkup limit & booking mode).
  - Create `src/lib/policy-parser.ts` (on-device PDF/CIS parser) + `src/pages/vault.astro` (My Profile, Family Members, My Policies).
  - Wire logged-in user profile + selected policy into `/`, `/deductions/`, and `/rejected/` so letters auto-fill `[Your name]`, `[Policy number]`, and `[Claim number]` from the user's saved vault!
- [ ] **M21 — "Is This Covered?" Checkup/Treatment Simulator & Family Plan Comparison (`Phase 2`):**
  - Build `src/pages/check-coverage.astro` + `src/lib/coverage-simulator.ts` (Full-Body Checkup, OPD/Diagnostics, Room Upgrade impact calculator, Surgery sub-limits, Waiting Period & 60-Month Moratorium tracker).
  - Build `src/pages/compare.astro` + `src/lib/plan-compare.ts` (Family profile recommender + side-by-side plan comparison combining CIS trap rules with our live IRDAI NL-48 discharge-speed dataset).
- [ ] **M22 — Grok-Style Interactive Live Voice Agent ("ClaimClock Voice") (`Phase 3`):**
  - Update `public/_headers` to `Permissions-Policy: camera=(), microphone=(self), geolocation=()`.
  - Add `/api/voice/transcribe` (`whisper-large-v3-turbo` on Groq Free Tier) and `/api/copilot` (`openai/gpt-oss-120b` with tool-calling) in `worker/app.ts`, protected by Turnstile + D1 quotas.
  - Build `src/components/VoiceCopilot.astro` + `src/lib/voice-agent.ts` with hands-free VAD, live voice orb/waveform, instant barge-in interruption, `en-IN`/`hi-IN` spoken output, and the 5 client-side executable tools (`check_policy_benefit`, `recommend_or_compare_plans`, `manage_claim_clock`, `audit_bill_deductions`, `draft_and_queue_action`, plus `save_user_policy`).
- [ ] **M23 — Life Insurance Module (`/life/`) (`Phase 4A`):**
  - Add verified Life Insurance PPHI rules (15d / 45d TAT + Bank Rate + 2% penal interest) and Insurance Act Section 45 (3-year indisputability) to `data/rules.json`.
  - Build `src/pages/life.astro` + `src/lib/life.ts` and register Life policies in the Policy Vault and Voice Agent.
- [ ] **M24 — Motor Insurance Module (`/motor/`) (`Phase 4B`):**
  - Add verified Motor Insurance PPHI rules (24h surveyor appointment / 15d survey report / 7d settlement) to `data/rules.json`.
  - Build `src/pages/motor.astro` + `src/lib/motor.ts` (3-stage surveyor clock + Zero-Dep / Consumables / IDV deduction auditor) and register Motor policies in the Policy Vault and Voice Agent.
