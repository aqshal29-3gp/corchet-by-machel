# Graph Report - machel-rebuild  (2026-09-11)

## Corpus Check
- 8 files · ~257,476 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 58 nodes · 50 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70015304`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Product
- Homepage rebuild
- README.md
- social-feed.test.cjs
- og-image.test.cjs
- product-card.test.cjs
- product-card-overflow.test.cjs
- og-cache-bust.test.cjs

## God Nodes (most connected - your core abstractions)
1. `Product` - 11 edges
2. `DCLogic` - 2 edges
3. `Homepage rebuild` - 2 edges
4. `test` - 1 edges
5. `assert` - 1 edges
6. `fs` - 1 edges
7. `path` - 1 edges
8. `index` - 1 edges
9. `test` - 1 edges
10. `assert` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 2 thin omitted)

### Community 0 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

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

## Knowledge Gaps
- **46 isolated node(s):** `test`, `assert`, `fs`, `path`, `index` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 50 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `test`, `assert`, `fs` to the rest of the system?**
  _46 weakly-connected nodes found - possible documentation gaps or missing edges._