# Quiz Studio V2 — UI Architecture Freeze

**Status:** FROZEN
**Recorded:** 2026-10-01
**Gate:** Human Design Gate — **PASSED** (per `V2_PRODUCT_SCOPE_FREEZE.md` §22 and §25)
**Scope baseline:** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1

This is a short pointer-and-constraints record. It is **not** a UI specification and must not grow into one; the approved artifacts below are the reference.

## 1. Approved artifacts (the reference)

| Artifact | Path | Role |
|---|---|---|
| Interactive V2 UI prototype | `docs/design-inputs/Design model/quiz-studio-v2-ui-prototype.html` | Approved UI architecture sample (synthetic data, no storage) |
| UI inspiration report | `docs/design-inputs/Design model/V2_UI_INSPIRATION_BROWSING_REPORT.md` | Rationale and sources for the visual direction |
| Color starting point | `docs/design-inputs/typing-practice-demo.html` | Warm-paper palette origin (Scope §22.1) |

Note: these are design inputs, not implementation. Production code is written to the approved architecture; it does not copy prototype code.

## 2. What is frozen

1. **Visual direction: "Warm Paper · Living Ink"** (report §3). Warm paper surfaces, ink text, restrained interaction color, motion as accent rather than lead.
2. **Information architecture is the prototype's:** Today, **Calendar**, Library, History, Review/Correction, Exchange, **Settings**, plus the Focused Practice surface. **Calendar and Settings are already included** in the approved scope (Scope Freeze Revision 1, §3.6/§7).
3. **No second UI architecture.** Formal implementation must not re-explore or substitute a different UI architecture (navigation model, view set, shell/layout hierarchy). Implementation detail within the approved architecture (components, framework, exact tokens, spacing) is ordinary engineering and design-lane refinement.
4. **Offline build must not depend on CDN fonts.** The prototype references hosted fonts for convenience; the product must have **no CDN and no network font dependency**. This is a hard constraint from Scope §5.1 (offline core) and ADR 0001 §10. *(Narrowed by the Human Gate amendment in §4: system font stacks are accepted; bundling a CJK font is no longer required.)*

## 3. Reopening rule

The architecture may be reopened **only** on **material evidence** of a usability, accessibility, or architecture problem (for example: an accessibility requirement the approved structure cannot meet; a frozen product workflow the structure cannot host; a runtime constraint proven by the Desktop spike). Preference, novelty, or a competitor example is not sufficient. A reopening names the specific evidence and affects only the specific decision, consistent with the Scope Change Rule (Scope Freeze §26).

## 4. Out of scope here

Final color values, typography scale, motion specifics, component library, and any framework choice. These remain with the Design Lane under the Human Design Gate (Scope Freeze §22).

## 4. Human Gate amendment (2026-10-03) — fonts, icon, version

Narrow amendment recorded at the Whole Product Feature Gate; it changes nothing else in this freeze.

- **System font stacks are formally accepted.** The frozen invariant is: **offline, no CDN, no network font dependency.** A bundled CJK font is **no longer required**.
- The **final application icon** and the **release version** move to **RC acceptance items**.
- This amendment adds **no** font asset, signing or auto-update, and does not reopen the UI architecture (§3).
