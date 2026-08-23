# M7.2 Translation History Performance Characterization

Date: 2026-08-22

Harness: `node scripts/characterize-history.mjs` (Node.js 24.18.0, Windows)

Runs: five per operation and tier; values below are median / worst in milliseconds.

The deterministic synthetic fixture contains 10 items per response, 0–2 reviews per response, annotations, whole-item marks, corrections, and retry/remediation lineage. Every tier asserts entry count, unique response IDs, needs-work derivation, and retry/remediation presence. Serialized size is measured from the complete fixture. Heap is an observational process snapshot, not a stable budget.

## User-visible budget and decision

For the locked 2,500-response tier, core History derivation should remain below 100 ms on this reference environment and index + filter/sort + list projection should remain below 150 ms. This leaves browser layout/paint headroom for a user-visible interaction around one second without introducing pagination or virtualization.

The initial baseline index took 173.47 / 181.46 ms at 2,500 responses and scaled superlinearly (26.12 ms at 1,000). That demonstrated the repeated full-collection scan bottleneck and justified the bounded optimization allowed by M7.2. A complete reproducibility run against the exact baseline module then captured every operation shown below; timing variation between the two baseline runs does not change the decision.

## Before optimization

| Responses | Reviews | Serialized MiB | Heap MiB | Index | Filter/sort | Detail | List projection |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 99 | 0.31 | 6.23 | 0.76 / 0.84 | 0.01 / 0.09 | 0.01 / 0.04 | 0.01 / 0.04 |
| 500 | 499 | 1.55 | 9.53 | 7.64 / 9.13 | 0.03 / 0.05 | 0.02 / 0.02 | 0.05 / 0.28 |
| 1,000 | 999 | 3.09 | 18.96 | 26.49 / 28.33 | 0.06 / 0.07 | 0.02 / 0.04 | 0.10 / 0.13 |
| 2,500 | 2,499 | 7.78 | 21.59 | 136.24 / 138.58 | 0.15 / 0.21 | 0.06 / 0.23 | 0.60 / 0.72 |

## After bounded optimization

| Responses | Reviews | Serialized MiB | Heap MiB | Index | Filter/sort | Detail | List projection |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 99 | 0.31 | 6.17 | 0.38 / 0.58 | 0.01 / 0.01 | 0.01 / 0.02 | 0.02 / 0.03 |
| 500 | 499 | 1.55 | 9.86 | 1.08 / 1.59 | 0.04 / 0.05 | 0.02 / 0.02 | 0.05 / 0.06 |
| 1,000 | 999 | 3.09 | 18.37 | 2.34 / 3.18 | 0.05 / 0.07 | 0.02 / 0.03 | 0.10 / 0.13 |
| 2,500 | 2,499 | 7.78 | 19.28 | 6.05 / 6.39 | 0.16 / 0.20 | 0.08 / 0.09 | 0.43 / 0.50 |

Technique: `buildHistoryIndex` constructs per-response Teacher Review and descendant-response maps once, then reuses them while deriving entries. No persistent cache, schema change, pagination, virtualization, navigation change, or rendering framework entered the branch. The public entry and History semantics remain unchanged. A deterministic collection-read budget regression guards linear source traversal without asserting machine-specific elapsed time.

“List projection” measures construction of representative list strings in Node; it is not browser layout/paint. Genuine browser list rendering was not claimed. The 2,500 tier completed without exceptions or evidence corruption, and all correctness assertions passed.
