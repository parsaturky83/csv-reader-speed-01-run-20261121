# Faster csv-reader

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/parsaturky83/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/parsaturky83/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for [csv-reader 1.0.0](https://make.fun/bounty/csv-reader-speed-01-run-20261121),
make.fun's own CSV reader. For every case's input `{text, header}` it returns
exactly csv-reader's answer `{columns, rows, errors}` — the same reading of
broken CSV (stray CRs, unterminated quotes, quote junk, short and long rows,
blank lines, BOM, CRLF and LF line breaks) — only faster.

## Layout

- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each with `run` from `solve.js`, and writes
  `/output/answers.json`.
- `solve.js` — the fast reader. It slices fields instead of building them a
  character at a time (unquoted fields are found with a hand loop over
  `charCodeAt`, quoted fields with `indexOf` jumps; the common quoted case,
  no escapes and no line breaks inside the quotes, is a single slice), and
  returns no per-field objects. Deterministic, no network, no model calls,
  JavaScript only, nothing installed.

## Results on the practice set

- Correctness: 6 of 6 cases identical to csv-reader 1.0.0
  (`makefun grade-local` on the kit: `passed: 1`, `cases_passed: 6/6`).
- Speed (this machine, whole `main.ts` run incl. JSON in/out): about 0.9–1.1 s
  of CPU against the house baseline's about 2.1–2.3 s — roughly 2.1–2.3x
  faster overall; the parser alone is about 3–4x faster than csv-reader.

## License

MIT. See [LICENSE](LICENSE).
