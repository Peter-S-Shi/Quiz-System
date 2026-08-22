# Quiz Studio Design System & UI Specification

## 1. Product Identity & Design Philosophy

- **Product Positioning**: Personal Learning Workspace / Balanced Study Studio.
- **Tone & Archetype**: A focused, distraction-free environment for adult, deliberate self-study and mastery.
- **Design Metaphor**: **Layered Paper Study Desk**
  - **Desk**: Tactile physical background environment (natural wood/stone desk in light mode, midnight slate desk in dark mode).
  - **Paper Sheet**: Single continuous laid paper surface floating above the desk, establishing the primary study plane.
  - **Natural Ink**: Learner submissions, handwritten markings, and teacher reviews rendered as physical inks on paper.

### Principles
1. **Continuous Paper Continuity**: The paper sheet is an organic, uninterrupted manuscript. Grouping is achieved through typography, generous whitespace, and hairline rules rather than heavy card containers.
2. **Spacious Density**: Generous line-height (1.65–1.85) and breathable margins prioritize cognitive comfort and reading continuity over dashboard packing.
3. **Ink-First Semantics**: Use fountain pen inks, teacher marking inks, and rubber stamp motifs to provide rich tactile feedback.
4. **Blue-First Interaction**: Academic Blue is reserved exclusively for interactive elements, focus states, and primary actions. Section headings and static chrome use neutral muted inks.
5. **Accessible & Ethical**: High-contrast ratios, complete keyboard accessibility, motion sensitivity, and zero-dependency offline audio synthesis.

---

## 2. Design Tokens

### Color Tokens

| Token | Light Mode (`Strong Paper`) | Dark Mode (`Soft Near-Black`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--desk-bg` | `#ece5d8` | `#101419` | Outer workspace desk surface |
| `--paper-sheet` | `#fbf9f4` | `#181d24` | Primary continuous paper sheet |
| `--paper-sheet-under` | `#f1ebde` | `#13171d` | Underlying sheet edge (physical depth) |
| `--paper-sheet-subtle` | `#f4efe4` | `#1e252e` | Recessed paper areas (tool trays, inputs) |
| `--paper-line` | `#e6dfd1` | `#27303c` | Hairline ruler dividers |
| `--paper-line-strong` | `#c8bfae` | `#3c4856` | Prominent structural borders |
| `--paper-text-main` | `#24201c` | `#edf2f7` | Primary manuscript carbon ink / silver text |
| `--paper-text-muted` | `#736b5e` | `#94a3b8` | Neutral stone ink (section labels, meta text) |
| `--paper-text-faint` | `#a09787` | `#64748b` | Watermark / tertiary captions |
| `--brand-blue` | `#1d5bd8` | `#3b82f6` | Interactive focus & primary action |
| `--brand-blue-hover` | `#1545ad` | `#60a5fa` | Hover state for interactive blue |
| `--brand-blue-soft` | `#edf3fd` | `#1e2e4a` | Subtle blue tint for active controls |

### Semantic Marking Inks

| Ink Name | Light Tone | Dark Tone | Usage |
| :--- | :--- | :--- | :--- |
| **Learner Ink (Oxford Blue)** | `#1b3864` | `#93c5fd` | Learner answer submissions |
| **Vermilion Ink (朱红)** | `#b91c1c` | `#f87171` | Deletions, replacements, needs-work, errors |
| **Scholar Green (松柏绿)** | `#15803d` | `#4ade80` | Correct answers, passed judgments |
| **Amber Ochre (琥珀黄)** | `#b45309` | `#fbbf24` | Uncertain / partial warnings, highlights |
| **Violet Ink (紫藤)** | `#6d28d9` | `#a78bfa` | Teacher style notes, suggestions, annotations |

### Typography Scale

- **Serif Font Stack** (Manuscript & Answers): `"Charter", "Georgia", "Songti SC", "SimSun", serif`
- **Sans-Serif Font Stack** (Interface & Controls): `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- **Monospace Font Stack** (IDs & Technical Proof): `"SF Mono", "Fira Code", Consolas, monospace`

| Scale | Size / Line-Height | Weight | Applied Context |
| :--- | :--- | :--- | :--- |
| **Display Title** | 22px / 1.35 | 700 Sans | Workspace document headers |
| **Source / Question Text** | 19px / 1.7 | 400 Serif | Reading prompt & translation source text |
| **Learner Answer** | 18px / 1.85 | 400 Serif | Student handwritten submission |
| **Section Label** | 13px / 1.4 | 600 Sans | Neutral muted section headings (`--paper-text-muted`) |
| **Body / Control Text** | 14px / 1.5 | 500 Sans | Standard buttons, inputs, options |
| **Caption / Badge** | 11px–12px | 700 Sans | Metadata pills, operation badges |

### Physical Depth & Shadow Tokens

- **Sheet Elevation**: `box-shadow: 0 14px 40px rgba(50, 38, 20, 0.11), 0 2px 6px rgba(50, 38, 20, 0.04);` (Dark: `0 16px 45px rgba(0, 0, 0, 0.55)`)
- **Floating Palette**: `box-shadow: 0 8px 24px rgba(40, 30, 15, 0.12);` (Dark: `0 10px 30px rgba(0, 0, 0, 0.6)`)
- **Radii Scale**: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`.

---

## 3. Motion & Micro-Interaction System

1. **Page-Turn Transition**:
   - **Trigger**: Previous / Next item navigation in Quiz and Translation practice.
   - **Motion**: Gentle 3D perspective slide (`translateX(35px) rotateY(6deg)` with ease-out cubic bezier `cubic-bezier(0.16, 1, 0.3, 1)` over 380ms).
   - **Reduced Motion**: Graceful 120ms opacity fade.

2. **Hand-Drawn Ink Selection (MCQ / Fill-in)**:
   - **Trigger**: Selecting an answer option.
   - **Motion**: SVG `stroke-dashoffset` path drawing animation (260ms) simulating an ink pen checkmark (✓) or cross (✕).

3. **Rubber Stamp Press (Judgment & Save)**:
   - **Trigger**: Finalizing a review, saving a grade, or changing judgment.
   - **Motion**: Tactile stamp landing with slight scale and rotation rebound (`scale(1.35) rotate(-6deg)` &rarr; `scale(0.94)` &rarr; `scale(1) rotate(-1.5deg)` over 280ms).

---

## 4. Synthesized Audio Engine

All sound effects are synthesized dynamically via the Web Audio API with zero external audio assets:
- **Paper Rustle**: Filtered brown/white noise through an exponential bandpass sweep (800Hz &rarr; 350Hz) over 180ms.
- **Pencil / Ink Scratch**: High-Q bandpass noise burst (2.8kHz &rarr; 3.6kHz) over 90ms.
- **Rubber Stamp Thud**: Low-frequency resonant sine oscillator (140Hz &rarr; 45Hz) combined with a short impact transient click (750Hz) over 120ms.

### Sound Preferences
- **Default State**: Enabled (`soundEnabled = true`).
- **Persistence**: Persisted in `localStorage` (`quiz_studio_ui_preferences`, with backward-compatible synchronization to `quiz_studio_sound_enabled` and `quiz-studio-theme`).
- **Accessibility**: Toggleable via global header audio button, completely silent when disabled with no effect on business logic.

---

## 5. Surface Architecture

### 1. Application Shell & Tool Launcher
- Top bar acts as the studio mantelpiece: brand mark, active workflow indicator, language toggle, theme toggle, and audio switch.
- Home screen serves as a clean **Tool Launcher** providing instant entry into Quiz Practice, Translation Studio, and History without dashboard clutter.

### 2. Practice Workspaces (Objective Quiz & Translation)
- Central continuous Paper Sheet resting on the study desk.
- Topline metadata (document title, item index, progress, language pair).
- Continuous manuscript text, responsive answer canvas, and clear action row at the sheet bottom.

### 3. Correction Workspace (Teacher Marking Desk)
- Single continuous paper sheet displaying source text, reference translation, and learner answer in deep Oxford Blue.
- Marking pen tray for style corrections, ink colors, insertions, and replacements (matching actual M6 core operations).
- Live projection area with inline strikes, insertions, and underlines.
- Tactile rubber stamp and feedback textareas for item comment and suggested revision.

### 4. History, Lineage & Utility Surfaces
- Coherent typography, surface palette, and paper accents aligned with the study desk language.
- Clear data tables and lineage chains without theatrical clutter.
