# Dependency-license assessment

Reviewed 10 October 2026 against the installed `package-lock.json`, package metadata, package license files, asset-copy scripts and generated service-worker source map. The technical findings below remain valid. The subsequent deployment approval is recorded separately; it does not broaden the strict audit allowlist or relicense upstream components.

**Current deployment decision:** the user explicitly authorized, “Allow the existing dependencies for this deployment”. [ClaimClock is live](https://claimclock.ketan952.workers.dev/). The [approval record](dependency-release-approval.json) pins `package-lock.json` SHA-256 `b591fe7a83e6af5e04508695f0f3cf85fc6d3157cbabc1269d48c1fa7a3faf1f`. `npm run licenses:release` accepts only that approved snapshot; any lockfile change fails until reviewed and explicitly approved. `npm run licenses` still exits with failure for the 101 strict-policy exceptions. A passing release gate is not a passing strict-license audit.

**Distribution notices added:** [28 source-exact notice files](../third-party-notices/provenance.json) cover identified native OCR components pinned to core v7.0.0 submodules, Emscripten 4.0.15 runtime libraries, PDF decoder/integration notices, and actual Workbox/idb runtime modules. The build verifies their SHA-256 values and publishes them at [/vendor/notices/NOTICE.txt](https://claimclock.ketan952.workers.dev/vendor/notices/NOTICE.txt), alongside the already copied package, worker and model notices. This improves the identified-component inventory; it is not an independently reproduced WASM build or complete linked-object attestation. Upstream license and notice obligations remain in force.

**The current dependency graph does not satisfy the user's MIT / Apache-2.0 / AGPL-3.0 allowlist. There is no small package removal or configuration change that makes the complete mandated stack satisfy it.** All direct packages declare an allowed license or an allowed alternative, but mandatory transitive dependencies and bundled third-party code use other licenses. Classifying a package as a build tool is useful for understanding distribution; the deployment exception comes from the explicit user authorization above, not from that classification.

## Installed graph: what the automated audit establishes

The existing [lockfile audit](dependency-license-audit.json) flags **101 lockfile package locations**, of which **79 have installed package metadata on this macOS machine** and **25 are marked optional**. Counts include nested versions and platform variants, so they are not 101 distinct libraries shipped to a browser. Optional and installed sets overlap. The lockfile records 33 ISC, 14 BSD-2-Clause, 12 BSD-3-Clause, 13 MPL-2.0, 10 BlueOak, 10 LGPL-only, 4 combined Apache/LGPL[/MIT], 3 CC0, 1 CC-BY and 1 0BSD entries outside the allowlist.

An `OR` expression with an allowed option can be satisfied by selecting that option; for example, `MIT OR Apache-2.0`. An `AND` expression including LGPL does not provide an MIT-only choice. Relabeling ClaimClock AGPL does not erase upstream license notices or change the upstream component inventory. The existing audit's treatment of `MIT OR CC0-1.0` uses its MIT alternative; it does not allow standalone CC0.

| Direct package and installed version | Declared license | Nonallowlisted reachable lockfile locations | Role |
|---|---|---:|---|
| Astro 7.3.8 | MIT | 52 | Static build/dev tooling; includes optional image pipeline |
| Drizzle ORM 0.45.4 | Apache-2.0 | 0 | Worker database code; optional database peers not installed by this graph |
| Hono 4.13.13 | MIT | 0 | Worker runtime |
| pdfjs-dist 6.4.299 | Apache-2.0 | 0 in npm metadata | Browser PDF code; separate bundled-asset licenses still matter |
| Tesseract.js 7.0.0 | Apache-2.0 | 1 in npm metadata | Browser OCR plus unused Node adapter; prebundled worker/core have additional components |
| Workbox-build 7.4.1 | MIT | 36 | Build generator and generated browser service worker |
| Wrangler 4.149.0 | MIT OR Apache-2.0 | 17 | Deployment/dev tooling and local Workers simulator |
| Lighthouse 13.5.0 | Apache-2.0 | 17 | QA tooling |
| Playwright Test 1.64.0 | Apache-2.0 | 0 | QA tooling; separately downloaded browser binaries are outside this npm metadata audit |
| TypeScript 7.0.2 | Apache-2.0 | 0 | Build/type checking |
| Workers types 5.20261010.1 | MIT OR Apache-2.0 | 0 | Type definitions |
| Node types 26.6.5 | MIT | 0 | Type definitions |

Reachability follows installed lockfile `dependencies` and `optionalDependencies`; counts overlap across roots and must not be added together. Zero means no conflict identified by package-level metadata, not a complete audit of embedded source or native binaries. Evidence is reproducible from `node_modules/<package>/package.json` and the corresponding lockfile entries.

## Mandatory paths that prevent a full pass

- **Astro → Vite 8.3.4 → lightningcss 1.33.0:** Vite lists Lightning CSS in ordinary dependencies, and `node_modules/lightningcss/LICENSE` is MPL-2.0. Its eleven platform bindings produce additional MPL lockfile entries. Astro also directly requires `github-slugger`, `piccolore` and `yargs-parser` (ISC), `diff` and `smol-toml` (BSD-3-Clause), `http-cache-semantics` (BSD-2-Clause), and `common-ancestor-path` (BlueOak-1.0.0). Omitting Sharp or switching CSS settings does not remove these graph requirements.
- **Wrangler → Miniflare → Sharp:** Miniflare 5.20261006.1-alpha has an ordinary dependency on Sharp 0.35.5. Sharp declares Apache-2.0, but its required `semver` is ISC and optional libvips/native packages include LGPL-3.0-or-later. Astro's separate Sharp edge is optional; Wrangler's simulator edge is not. Native local tooling is not deployed as Worker application code, but it remains in this development/deployment graph.
- **Workbox-build → build dependencies:** `glob` is BlueOak, `source-map` BSD-3-Clause and `stringify-object` BSD-2-Clause. Its Babel/browser-data tree brings ISC and CC-BY-4.0 entries. These are largely build-only; the generated runtime issue below is separate.
- **Tesseract.js → node-fetch → whatwg-url → webidl-conversions:** the last package is BSD-2-Clause. The browser adapter avoids this Node-fetch path, but the package manager still installs it as a regular dependency. It is not safe to remove an ordinary dependency from the lockfile by hand.

A blanket `--omit=optional` is not a complete remedy: it retains ordinary nonallowlisted dependencies, retains optional records in a normal lockfile, and can omit native bindings needed by the build. Merely moving Astro or other packages from `dependencies` to `devDependencies` also changes no license. An older version might change individual paths, but no older complete allowlisted stack was established; an unverified downgrade is not a proposed compliance fix.

## What reaches the browser

### Confirmed service-worker runtime conflict

`scripts/build-sw.mjs` configures `expiration: { maxEntries: 20 }` for vendor assets. `workbox-expiration/package.json` depends on `idb`, whose installed `node_modules/idb/LICENSE` text is ISC. The generated `dist/workbox-a9e21ce4.js.map` names `node_modules/idb/build/wrap-idb-value.js`, `node_modules/idb/build/index.js`, and Workbox expiration modules. This is direct artifact evidence that ISC code is shipped, despite its lockfile `dev: true` label.

Removing the Workbox expiration plugin removes this particular runtime path. A bounded vendor-file list could instead use native Cache API eviction, or the project could use only the MIT Workbox core/routing/precaching/strategy modules with an explicitly reviewed build path. This reduces exposure; keeping `workbox-build` retains its nonallowlisted build graph. Do not remove bounded caching without replacing its storage control.

### OCR code and model are separate license subjects

The copied `node_modules/tesseract.js/dist/worker.min.js` has a sibling `worker.min.js.LICENSE.txt` which explicitly names **BSD-3-Clause `ieee754`**, alongside MIT components. The package-level Apache label and the npm audit do not expose this prebundled dependency. The copy script initially copied the worker without that sibling notice; the current build copies it to `/vendor/tesseract/worker.min.js.LICENSE.txt`. Applicable notices remain required regardless of the allowlist decision.

`tesseract.js-core` declares Apache-2.0 and its installed README explains that the WASM builds include third-party C/C++ dependencies. The [v7.0.0 build script](https://github.com/naptha/tesseract.js-core/blob/v7.0.0/build.sh) builds Leptonica, zlib, libpng, libjpeg, libtiff, libwebp, giflib and openlibm before Tesseract. Its [Tesseract build configuration](https://github.com/naptha/tesseract.js-core/blob/v7.0.0/build-scripts/build-tesseract.sh) explicitly points at Leptonica. The installed WASM contains Leptonica/libpng/zlib identifiers. Leptonica's [upstream license](https://github.com/DanBloomberg/leptonica/blob/master/leptonica-license.txt) is BSD-2-Clause. The current notice inventory now includes the exact Leptonica and codec submodule revisions declared by core v7.0.0, together with its declared Emscripten runtime notices; independent binary provenance and a complete linked-object inventory remain unverified. The Apache package header cannot establish that every embedded component meets the three-license allowlist. Replacing Leptonica is a substantial OCR-engine change, not an ordinary package cleanup.

The **English trained model** can be obtained from the official Tesseract `tessdata_fast` project under [Apache-2.0](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE). The language model should be pinned by upstream revision and content hash, self-hosted, and shipped with its license/provenance. The later build now pins and SHA-256 verifies the English model through `data/ocr-assets.json`, copies it with its Apache license, and self-hosts it. This closes model provenance only; embedded OCR runtime conflicts above remain. A hosted API model's license does not establish the local OCR asset's license, and vice versa. The installed worker's default CDN paths are not permission to use third-party runtime scripts; the app already supplies local core/language paths.

### PDF assets hidden by one Apache package label

The installed `pdfjs-dist` has these independent license files:

| Asset family | Installed evidence | License outside allowlist? | Minimal treatment |
|---|---|---|---|
| OpenJPEG decoder and PDF.js OpenJPEG integration | `wasm/LICENSE_OPENJPEG`, `wasm/LICENSE_PDFJS_OPENJPEG` | BSD-2-Clause | Avoid shipping these optional files unless approved; JPEG2000 scans then need a documented fallback |
| JBIG2 decoder | `wasm/LICENSE_JBIG2` | BSD-3-Clause, alongside Apache integration code | Avoid optional decoder files unless approved; some monochrome scans will not render |
| Foxit/PDFium standard fonts | `standard_fonts/LICENSE_FOXIT` | BSD-3-Clause | Use system fonts / avoid copying standard-font assets |
| Liberation fonts | `standard_fonts/LICENSE_LIBERATION` | GPL-2.0 with its stated font exception | Avoid copying these assets; this is not AGPL-3.0 |
| Adobe CMaps | `cmaps/LICENSE` | BSD-style three-clause terms | Avoid unused files; some CJK/CID text extraction needs these maps |
| ICC profiles | `iccs/LICENSE` | CC0-1.0 | Avoid unused profile files |
| qcms code/integration | `wasm/LICENSE_QCMS`, `wasm/LICENSE_PDFJS_QCMS` | MIT; allowed | Still preserve required notices if shipped |

The initial copy script ships the PDF worker only, not these directories; `extract.ts` uses system fonts and disables font faces. However the worker itself contains generated OpenJPEG integration code, so an artifact-level source/notice review is needed before declaring the entire minified worker Apache-only. Omitting optional binary files cannot alone prove a clean main bundle. The optional Node canvas package is unnecessary for browser PDF extraction, but omitting it provides no demonstrated allowlist fix because its npm metadata is already allowed.

## Smallest practical changes and their limits

1. **Keep the audit blocked.** Do not add ISC/BSD/MPL/LGPL to the allowlist, hide packages, or claim that AGPL relicenses them. Keep separate graph and shipped-artifact inventories when reviewing future dependency changes; the current exception remains limited to its approved snapshot.
2. **Remove the avoidable runtime `idb` path** by replacing Workbox's expiration plugin with reviewed native caching bounds. Retain the requested Workbox PWA behavior.
3. **Copy only required PDF/OCR assets and their notices**, pin the English model and record its hash/license. Do not bulk-copy every codec/font directory. Explicitly test the reduced PDF formats and show manual-entry fallback. Full Tesseract OCR still has embedded nonallowlisted components.
4. **Lighthouse is the clearest removable project dependency:** its tree adds QA-only MPL (`axe-core`), BSD, ISC and 0BSD packages. Using an external QA installation or browser DevTools can reduce this repository's declared graph while preserving Lighthouse testing, but moving tools outside the project is not proof that the user's broad dependency requirement has been met. Playwright's npm graph has no identified allowlist exception; removing it does not fix the reported conflicts.
5. **An alternative Workbox build path can reduce build dependencies** by selecting only needed MIT modules and generating the precache manifest with project code. This needs testing and still leaves mandatory Astro/Vite and Wrangler/Miniflare conflicts.
6. **A complete strict fix would require a different or extensively maintained forked stack**, including replacements for mandatory build dependencies and bundled OCR components, or separately obtained upstream licensing rights. No such fully compliant, feature-complete path has been demonstrated within the mandated stack. Any further change to the allowed-license policy or mandated technologies is a user decision. The recorded current-snapshot deployment exception does not establish this strict fix or approve future changes.

This assessment identifies license-policy mismatches and distribution boundaries. It is not a conclusion that these common open-source licenses prohibit the project. The narrower allowlist mismatch remains visible, with a separately recorded user exception for this deployed snapshot. Identified shipped-component notices are now preserved, while the stated inventory and binary-provenance limitations remain.
