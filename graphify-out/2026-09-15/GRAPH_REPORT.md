# Graph Report - machel-rebuild  (2026-09-14)

## Corpus Check
- 31 files · ~445,620 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .gs 1, .snapshot 1)

## Summary
- 203 nodes · 185 edges · 27 communities (22 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f24c3683`
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
- SyncContentTest
- payment-boundary.test.cjs
- ui-interactions.test.cjs
- google-ads-tracking.test.cjs
- static-content-sources.test.cjs
- international-mvp.test.cjs
- shipping-copy.test.cjs
- currencies-static.test.cjs
- sync-content.py
- bundler-template-integrity.test.cjs
- customer-name-privacy.test.cjs
- cron-sync-currencies.sh
- sync-currencies.py

## God Nodes (most connected - your core abstractions)
1. `SyncContentTest` - 9 edges
2. `Service` - 7 edges
3. `Values` - 4 edges
4. `publish()` - 3 edges
5. `main()` - 3 edges
6. `Response` - 3 edges
7. `cron-sync-currencies.sh script` - 2 edges
8. `log()` - 2 edges
9. `items()` - 2 edges
10. `num()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (27 total, 2 thin omitted)

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

### Community 14 - "SyncContentTest"
Cohesion: 0.10
Nodes (4): Response, Service, SyncContentTest, Values

### Community 15 - "payment-boundary.test.cjs"
Cohesion: 0.12
Nodes (6): assert, fs, html, path, source, test

### Community 16 - "ui-interactions.test.cjs"
Cohesion: 0.17
Nodes (11): assert, FIXTURES, fs, html, loadCartFns(), makeCtx(), path, script (+3 more)

### Community 17 - "google-ads-tracking.test.cjs"
Cohesion: 0.22
Nodes (8): assert, fs, html, match, path, sitemap, template, test

### Community 18 - "static-content-sources.test.cjs"
Cohesion: 0.22
Nodes (8): assert, fs, html, m, path, ROOT, test, tmpl

### Community 19 - "international-mvp.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, html, m, path, t, test

### Community 20 - "shipping-copy.test.cjs"
Cohesion: 0.25
Nodes (7): assert, fs, html, m, path, test, tmpl

### Community 21 - "currencies-static.test.cjs"
Cohesion: 0.29
Nodes (6): assert, fs, html, path, ROOT, test

### Community 22 - "sync-content.py"
Cohesion: 0.47
Nodes (5): items(), main(), publish(), Sync GaleriCustom + ReviewChat sheets -> static JSON (no Apps Script…, Publish all outputs as one recoverable, single-run transaction.

### Community 23 - "bundler-template-integrity.test.cjs"
Cohesion: 0.40
Nodes (4): assert, fs, path, test

### Community 24 - "customer-name-privacy.test.cjs"
Cohesion: 0.40
Nodes (4): assert, fs, path, test

### Community 26 - "sync-currencies.py"
Cohesion: 0.67
Nodes (3): main(), num(), Sync MataUang sheet -> currencies.json (static, no Apps Script deploy needed).…

## Knowledge Gaps
- **126 isolated node(s):** `test`, `assert`, `fs`, `path`, `test` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 157 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `test`, `assert`, `fs` to the rest of the system?**
  _126 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SyncContentTest` be split into smaller, more focused modules?**
  _Cohesion score 0.10276679841897234 - nodes in this community are weakly interconnected._
- **Should `payment-boundary.test.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._