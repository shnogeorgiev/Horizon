# Horizon — Master Project Context (For Vergil)

Horizon is a **pure frontend, offline-first, operator-grade visual pentest
mapping tool** built using **vanilla HTML, CSS, and JavaScript**.

There is:
- No backend
- No frameworks
- No build system
- No telemetry
- Only deterministic behavior

Horizon is designed for:
- CPTS
- OSCP
- CRTO
- Real-world pentests

This file exists to **prevent regressions, architectural drift, and hidden assumptions**.  
Any change that violates this document is considered a **bug**.

---------------------------------------------------------------------

## Core Philosophy

1. Focus is sacred  
2. Editing is always intentional  
3. No implicit actions  
4. ESC is the only universal cancel  
5. State is always serializable  
6. All interactions are exam-safe and reproducible  

---------------------------------------------------------------------

## Interaction Modes

Horizon has exactly **three** interaction modes:

- `normal` → node control and navigation
- `draw`   → freehand vector drawing
- `text`   → floating text placement

Only **one mode** may be active at any time.  
Modes are mutually exclusive and explicit.

---------------------------------------------------------------------

## Focus System

- Focus is obtained **only via double-click**
- ESC is the **only** way to unfocus
- While a node is focused:
  - Move is allowed
  - Resize is allowed
  - Edit is allowed
  - Pan is allowed
- All other nodes are **hard-locked**

This prevents accidental edits and preserves operator intent.

---------------------------------------------------------------------

## Selection Model

- CTRL + drag → selection box
- CTRL + click → toggle selection
- Drag any selected node → moves the entire group

No hidden or implicit multi-select behavior exists.

---------------------------------------------------------------------

## Draw System

- Vector-based freehand drawing
- Persisted in `state.drawings`
- Rendered as SVG polylines
- Forced odd stroke widths for visual crispness
- Right-click deletes a drawing
- Draw undo / redo supported

Drawings are **not nodes** and never interact with nodes.

---------------------------------------------------------------------

## Text System

Text overlays are **not nodes**.

Flow:
1. Enter TEXT mode
2. Click → spawn live input
3. Type
4. Drag to reposition
5. Press ENTER → lock text
6. ESC → cancel

- Persisted in `state.textDrawings`
- Right-click deletion allowed **only in TEXT mode**
- Text is rendered on `drawLayer`

**Critical invariant:**  
`renderDrawings()` must always re-render text afterward.

---------------------------------------------------------------------

## Primitives (Data Model)

Primitives represent **facts**, not reasoning.

### Infrastructure
- Host
- Zone
- Domain Controller
- Web
- SQL
- Service

### Objects
- Vulnerability
- Artifact
- Note

### Secrets
- Credential
- Hash
- Flag
- Secret

Rules:
- Primitive keys and field keys are **lowercase** (runtime contract)
- Labels are cosmetic only
- No enums, no constraints, no validation
- Absence of data is meaningful

Zones use repeating SVG title backgrounds.  
All spawns occur at **viewport center**.

---------------------------------------------------------------------

## Clipboard Model

- Node copy / paste is explicit
- Uses **CTRL + ALT + C / CTRL + ALT + V**
- Native browser copy/paste is untouched
- Clipboard state is in-memory only

---------------------------------------------------------------------

## Autosave System

- Storage key: `attack-canvas-autosave-v1`
- Payload includes:
  - nodes
  - edges
  - drawings
  - textDrawings
  - zoom
  - panX
  - panY

Autosave is throttled and guarded on page unload.  
No silent state loss is permitted.

---------------------------------------------------------------------

## Import / Export

- JSON-based
- Single file
- Fully restores state
- No transformations or migrations

---------------------------------------------------------------------

## Absolute No-Regression Rules

- No hover editing
- No auto-unfocus
- No cursor-agnostic zoom
- No draw/text interference
- No silent state loss
- No backend assumptions
- No “helpful” automation

---------------------------------------------------------------------

## Current Release

**Horizon 1.0 — Stable**  
Offline-safe • Exam-safe • Operator-first • GitHub-ready
