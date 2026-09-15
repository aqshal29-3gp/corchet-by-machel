# Graph Report - machel-rebuild  (2026-09-11)

## Corpus Check
- 8 files · ~284,748 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 60 nodes · 52 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d51cbf2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- README.md
- social-feed.test.cjs
- og-image.test.cjs
- product-card.test.cjs
- product-card-overflow.test.cjs
- og-cache-bust.test.cjs
- gallery.test.cjs
- hero-marquee.test.cjs

## God Nodes (most connected - your core abstractions)
1. `DCLogic` - 2 edges
2. `DCLogic` - 2 edges
3. `test` - 1 edges
4. `assert` - 1 edges
5. `fs` - 1 edges
6. `path` - 1 edges
7. `html` - 1 edges
8. `templateMatch` - 1 edges
9. `test` - 1 edges
10. `assert` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

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

## Knowledge Gaps
- **48 isolated node(s):** `test`, `assert`, `fs`, `path`, `html` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 51 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `test`, `assert`, `fs` to the rest of the system?**
  _48 weakly-connected nodes found - possible documentation gaps or missing edges._