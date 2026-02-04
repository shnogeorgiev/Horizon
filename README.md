# Horizon — Visual Pentest Mapping Tool

Horizon is a **lightweight, offline-first visual attack mapping tool**
designed for **penetration testers and certification exams**.

It runs entirely in the browser and is built with **vanilla HTML, CSS, and JavaScript**.

No backend.  
No frameworks.  
No telemetry.  

---------------------------------------------------------------------

## Purpose

Horizon exists to help operators **think clearly under pressure**.

It is not an automated attack planner.  
It does not enforce methodology.  
It does not hide mistakes.

It provides a **clean, deterministic canvas** where facts, relationships,
and attack paths can be mapped **explicitly and deliberately**.

The operator remains fully in control at all times.

---------------------------------------------------------------------

## Features

- Visual mapping of infrastructure, access, and attack paths
- Operator-defined structured primitives
- Hierarchical primitives menu (Infrastructure / Object / Secret)
- Freehand vector drawing (SVG-based)
- Floating text annotations (non-node)
- Mouse-relative zoom and pan
- Group selection and movement
- Deterministic node sizing and placement
- Full JSON import / export
- Offline autosave persistence

---------------------------------------------------------------------

## Supported Primitives

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

Primitives are intentionally minimal and unconstrained.  
**Absence of data is meaningful.**

---------------------------------------------------------------------

## Controls

### Navigation & Selection
- **SHIFT + Drag** → Pan  
- **CTRL + Drag** → Selection box  
- **CTRL + Click** → Toggle selection  
- **Double-click** → Focus node  
- **ESC** → Unfocus / cancel  
- **DEL** → Delete focused or selected nodes  
- **Mouse Wheel** → Zoom  

### Modes
- **DRAW mode** → Freehand vector drawing  
- **TEXT mode** → Floating text annotations  

Only one interaction mode is active at a time.

### Clipboard
- **CTRL + ALT + C** → Copy selected nodes  
- **CTRL + ALT + V** → Paste nodes  

Native browser copy/paste remains untouched.

---------------------------------------------------------------------

## How to Run

1. Download or clone the project
2. Extract the files
3. Open `index.html` in any modern browser

No server required.  
No internet required.  
Fully offline.

---------------------------------------------------------------------

## Design Goals

- Exam-safe behavior
- Deterministic interactions
- Zero hidden automation
- Zero dependencies
- Operator-first control
- Maximum clarity under pressure

---------------------------------------------------------------------

## Non-Goals

- No attack automation
- No methodology enforcement
- No backend integration
- No cloud features
- No telemetry or tracking

---------------------------------------------------------------------

## Appendix — Markdown Report Export (`horizon_md_report.py`)

Horizon includes an **optional companion Python script** that converts a
Horizon JSON export into a **structured Markdown penetration test report**.

The script is intentionally **external** to Horizon to preserve the tool’s
frontend-only, offline-first design.

### Purpose

The exporter is designed to:

- Reduce reporting boilerplate
- Preserve technical accuracy from the canvas
- Provide a clean report skeleton
- Keep analysis and conclusions **operator-driven**

Horizon captures **facts and relationships**.  
The Python script turns those facts into **readable documentation**.

### Usage Flow

1. Build your attack map in Horizon
2. Use **Export JSON**
3. Run the exporter:

   ```bash
   python horizon_md_report.py attack-canvas-state.json
   ```

4. A structured Markdown report is generated

### Output Characteristics

- Human-readable Markdown
- Sections grouped by primitive type
- No assumptions or inferred conclusions
- Kill chain narrative remains manual
- Designed for Obsidian, GitHub, or PDF pipelines

The exporter is a **helper**, not an analyst.

---------------------------------------------------------------------

## Version

**Horizon 1.0 — Stable**

Offline-safe • Exam-safe • Operator-first
