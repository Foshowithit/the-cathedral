# The Cathedral — 150 Years of Stone

A real-time, fully explorable reconstruction of one French Gothic cathedral being built between **1200 and 1350** — foundations to flèche, one persistent building, 150 years on a single scrubber.

**Live:** https://foshowithit.github.io/the-cathedral/

[Watch the 39-second recorded tour](https://foshowithit.github.io/the-cathedral/demo.mp4)

## Walkthrough

The page opens at **year 1275** — the hero composition: the finished choir, the nave rising behind timber scaffolding, the treadwheel crane on the stockpiles, the west front barely started.

| Control | Action |
|---|---|
| Drag | Orbit the building (mouse or one finger) |
| Scroll / pinch | Zoom, 10–430 m from the crossing |
| Timeline (bottom) | Scrub freely 1200 → 1350, both directions |
| Space or ▶ | Play / pause the construction |
| ½× 1× 2× 4× | Playback speed |
| **R** / `VIEW` button | Return to the composed hero view |
| **M** / `MASONRY` button | Human-scale inspection view among the scaffold and dressed stone |

The timeline is **stateless and deterministic**: every architectural piece carries its own construction window and is derived purely from the selected year. Scrub backward to 1200 and the cathedral unbuilt itself exactly; scrub forward and the same stone returns. The camera holds its world-space position while years change, so 1200, 1275, and 1350 can be compared from the identical viewpoint.

### The eight campaigns

| Year | Campaign | What happens |
|---:|---|---|
| 1200 | Groundbreaking | Trenches are cut to bedrock; workshops, stockpiles and the first treadwheel crane arrive. |
| 1216 | The Choir Rises | Ambulatory and choir walls climb bay by bay behind timber scaffolding. |
| 1244 | Vaults over the Choir | Rib vaults close and the eastern end is roofed; masons dress stone for the nave. |
| 1252 | The Nave Advances | Piers march westward while the crossing and west-front footings are opened. |
| 1270 | Transept & West Front | The cross-arm walls climb and the great portals take shape under centering. |
| 1300 | The Western Façade | Nave roofed; the façade soars upward and the towers begin their long rise. |
| 1315 | Towers, Tracery & Flèche | Belfries, window tracery and the crossing spire complete the silhouette. |
| 1346 | The Cathedral Complete | Scaffolds are struck; a finished cathedral stands in an established town. |

Between campaigns the build interpolates continuously — walls rise course-band by course-band, window holes emerge as the masonry passes them, and scaffolding, centering, and the crane follow the active front and vanish when the work they serve is struck.

## Structure

```
index.html      shell, HUD, timeline, error sink
js/util.js      math/canvas helpers
js/textures.js  procedural limestone, timber, lead, ground (canvas PBR maps)
js/cathedral.js parametric architecture: walls, arches, vaults, buttresses, flèche, site
js/main.js      camera rig, timeline engine, phases, render loop
demo.mp4        39 s recorded tour
```

## Tech notes

- **Three.js r128** (UMD build from cdnjs) — no bundler, no build step; the site is plain static files and runs from any static host or straight off disk (network needed only for the Three.js CDN).
- **Component-level timeline**, not scale/reveal tricks: permanent architecture, temporary works (scaffold, centering, crane), and environment each resolve from the year with no accumulated mutations.
- **Procedural materials**: masonry joints aligned to geometry, per-block tone variation, timber grain — generated on canvas, no external texture assets to go missing.
- Daylight afternoon sun, stable shadows, restrained tone mapping — the architecture is meant to read under plain daylight, not effects.

*The cathedral is fictional; the chronology is a design fiction too — a plausible sequence, not a claim about any real building.*
