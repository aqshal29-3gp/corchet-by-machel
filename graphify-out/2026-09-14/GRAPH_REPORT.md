# Graph Report - machel-rebuild  (2026-09-13)

## Corpus Check
- 15 files · ~416,154 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 86 nodes · 72 edges · 14 communities (10 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8e6c4763`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- galeri-custom.test.cjs
- why-berrygirl-before-after.test.cjs
- README.md
- social-feed.test.cjs
- og-image.test.cjs
- product-card.test.cjs
- product-card-overflow.test.cjs
- og-cache-bust.test.cjs
- gallery.test.cjs
- hero-marquee.test.cjs
- review-chat.test.cjs

## God Nodes (most connected - your core abstractions)
1. `DCLogic` - 2 edges
2. `DCLogic` - 2 edges
3. `test` - 1 edges
4. `assert` - 1 edges
5. `fs` - 1 edges
6. `path` - 1 edges
7. `html` - 1 edges
8. `m` - 1 edges
9. `tmpl` - 1 edges
10. `test` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "galeri-custom.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, html, m, path, test, tmpl

### Community 1 - "why-berrygirl-before-after.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, html, match, path, test, tmpl

### Community 3 - "social-feed.test.cjs"
Cohesion: 0.17
Nodes (10): app, assert, Component, DCLogic, fs, html, React, result (+2 more)

### Community 4 - "og-image.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, height, path, png, test, width

### Community 5 - "product-card.test.cjs"
Cohesion: 0.29
Nodes (6): assert, bundle, fs, html, match, test

### Community 6 - "product-card-overflow.test.cjs"
Cohesion: 0.25
Nodes (7): assert, bundle, fs, html, match, path, test

### Community 7 - "og-cache-bust.test.cjs"
Cohesion: 0.33
Nodes (5): assert, fs, index, path, test

### Community 8 - "gallery.test.cjs"
Cohesion: 0.22
Nodes (7): assert, DCLogic, fs, html, path, templateMatch, test

### Community 9 - "hero-marquee.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, html, m, path, test, tmpl

### Community 10 - "review-chat.test.cjs"
Cohesion: 0.29
Nodes (6): assert, fs, html, m, test, tmpl

## Knowledge Gaps
- **68 isolated node(s):** `test`, `assert`, `fs`, `path`, `html` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 74 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `test`, `assert`, `fs` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._