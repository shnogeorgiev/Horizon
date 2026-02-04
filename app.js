const canvas   = document.getElementById("canvas");
const viewport = document.getElementById("viewport");
const drawLayer = document.getElementById("draw-layer");

// ---------- STATE ----------
let zoom = 1, panX = 0, panY = 0;
let shiftDown = false, ctrlDown = false;
let interactionMode = "normal"; // "normal" | "draw" | "text"

let selectedIds = new Set();
let focusedId   = null;

// main persisted state
let state = {
  nodes: [],
  edges: [],
  drawings: [],
  textDrawings: []  // ✅ text notes rendered on drawLayer
};

// helper / runtime-only
let clipboard  = null;
let activeDraw = null;
let drawColor  = "#ff3b3b";
let drawSize   = 2;

// text draw state
let textColor = "#ffd54f";
let textSize  = 16;

let drawUndo = [];
let drawRedo = [];
let nodeUndo = [];
let nodeRedo = [];

let selecting   = false;
let selectStart = null;
let selectBoxEl = null;

// ---------- AUTOSAVE ----------
const STORAGE_KEY = "attack-canvas-autosave-v1";
let isDirty = false;
let saveTimer = null;

function scheduleSave() {
  isDirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = {
      nodes: state.nodes,
      edges: state.edges,
      drawings: state.drawings,
      textDrawings: state.textDrawings,
      meta: { zoom, panX, panY }
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Autosave failed", e);
    }
    isDirty = false;
    saveTimer = null;
  }, 300);
}

function rectIntersects(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function rectContains(outer, inner) {
  return (
    inner.left   >= outer.left &&
    inner.right  <= outer.right &&
    inner.top    >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    state.nodes        = parsed.nodes        || [];
    state.edges        = parsed.edges        || [];
    state.drawings     = parsed.drawings     || [];
    state.textDrawings = parsed.textDrawings || [];

    if (parsed.meta) {
      if (typeof parsed.meta.zoom === "number") zoom  = parsed.meta.zoom;
      if (typeof parsed.meta.panX === "number") panX  = parsed.meta.panX;
      if (typeof parsed.meta.panY === "number") panY  = parsed.meta.panY;
    }
  } catch (e) {
    console.warn("Failed to load autosave", e);
  }
}

window.addEventListener("beforeunload", e => {
  if (!isDirty) return;
  e.preventDefault();
  e.returnValue = "";
});

// ================================
// ---------- PRIMITIVES ----------
// LOWERCASE KEYS (runtime-safe)
// UPPERCASE LABELS (visual only)
// NO ENUMS
// ================================

// ---------- PRIMITIVE CATEGORIES ----------
const PRIMITIVE_CATEGORY = {
  // INFRASTRUCTURE (blue)
  zone: "infra",
  host: "infra",
  webapp: "infra",
  database: "infra",
  domain_controller: "infra",
  service: "infra",

  // OBJECT (red)
  vuln: "object",
  artifact: "object",
  note: "object",

  // SECRET (yellow)
  credential: "secret",
  hash: "secret",
  flag: "secret",
  secret: "secret"
};

// ---------- PRIMITIVE OBJECTS ----------
const primitives = {

  zone: {
    label: "ZONE",
    fields: {
      title: {},
      subnet: { type: "textarea" },
      notes: { type: "textarea" }
    }
  },

  host: {
    label: "HOST",
    fields: {
      hostname: {},
      os: {},
      network: { type: "textarea" },
      protections: { type: "textarea" },
      shares: { type: "textarea" },
      ports: { type: "textarea" },
      tech: { type: "textarea" },
      notes: { type: "textarea" }, 
    }
  },

  vuln: {
    label: "VULN",
    fields: {
      type: {},
      severity: {},
      cwe: {},
      cve: {},
      cvss: {},
      evidence: {},
      affected: { type: "textarea" },
      description: { type: "textarea" },
      impact: { type: "textarea" },
      exploit: { type: "textarea" },
      remediation: { type: "textarea" }
    }
  },

  credential: {
    label: "CREDENTIAL",
    fields: {
      privilege: {},
      username: {},
      password: {},
      target: {},
      source: {},
      notes: { type: "textarea" }
    }
  },
  
  hash: {
    label: "HASH",
    fields: {
      type: {},
      algorithm: {},
      value: {},
      password: {},
      target: {},
      source: {},
      notes: { type: "textarea" }
    }
  },
  
  flag: {
    label: "FLAG",
    fields: {
      value: {},
      source: {},
      time: {}
    }
  },
  
  secret: {
    label: "SECRET",
    fields: {
      type: {},
      target: {},
      source: {},
      value: { type: "textarea" }
    }
  },

  webapp: {
    label: "WEB",
    fields: {
      url: {},
      hostname: {},
      type: {},
      ip: {},
      port: {},
      tech: { type: "textarea" },
      auth: { type: "textarea" },
      notes: { type: "textarea" }
    }
  },

  database: {
    label: "SQL",
    fields: {
      type: {},
      hostname: {},
      ip: {},
      port: {},
      creds: { type: "textarea" },
      notes: { type: "textarea" }
    }
  },

  domain_controller: {
    label: "DOMAIN CONTROLLER",
    fields: {
      hostname: {},
      os: {},
      forest: {},
      domain: {},
      ip: { type: "textarea" },
      services: { type: "textarea" },
      nearby_infra: { type: "textarea" },
      notes: { type: "textarea" }
    }
  },

  service: {
    label: "SERVICE",
    fields: {
      type: {},                   // ldap, kerberos, adcs, smb, winrm, mssql, http-auth, etc.
      host: {},                   // where it runs (hostname / DC / server)
      account: {},                // service account / SYSTEM / gMSA
      notes: { type: "textarea" } // abuse ideas, misconfigs, observations
    }
  },

  note: {
    label: "NOTE",
    fields: {
      text: { type: "textarea" }
    }
  },

  artifact: {
    label: "ARTIFACT",
    fields: {
      type: { type: "textarea" },
      location: { type: "textarea" },
      purpose: { type: "textarea" },
      cleanup: { type: "textarea" },
      notes: { type: "textarea" },
      evidence: {},
      created_by: {}
    }
  }

};


// ---------- KEYBOARD ----------
window.addEventListener("keydown", e => {
  if (e.key === "Shift")   shiftDown = true;
  if (e.key === "Control") ctrlDown  = true;

  // DELETE KEY — delete focused or selected group
  if (e.key === "Delete") {
    let idsToDelete = [];

    if (selectedIds.size > 0) {
      idsToDelete = [...selectedIds];
    } else if (focusedId) {
      idsToDelete = [focusedId];
    } else {
      return; // nothing to delete
    }

    const count = idsToDelete.length;
    if (!confirm(`Do you really want to delete ${count} object${count > 1 ? "s" : ""}?`)) {
      return;
    }

    const deletedNodes = state.nodes.filter(n => idsToDelete.includes(n.id));
    nodeUndo.push(deletedNodes);
    nodeRedo.length = 0;

    state.nodes = state.nodes.filter(n => !idsToDelete.includes(n.id));
    selectedIds.clear();
    focusedId = null;

    render();
    scheduleSave();
  }

  // NODE DELETE UNDO (CTRL + Z) — only in NORMAL mode
  if (interactionMode === "normal" && ctrlDown && e.key.toLowerCase() === "z") {
    const last = nodeUndo.pop();
    if (!last) return;
    state.nodes.push(...last);
    nodeRedo.push(last);
    render();
    scheduleSave();
    return;
  }

  // NODE DELETE REDO (CTRL + Y) — only in NORMAL mode
  if (interactionMode === "normal" && ctrlDown && e.key.toLowerCase() === "y") {
    const last = nodeRedo.pop();
    if (!last) return;
    const ids = last.map(n => n.id);
    state.nodes = state.nodes.filter(n => !ids.includes(n.id));
    nodeUndo.push(last);
    render();
    scheduleSave();
    return;
  }

  // ESC: unfocus + clear selection
  if (e.key === "Escape") {
    focusedId = null;
    selectedIds.clear();
    render();
    return;
  }

  // DRAW UNDO / REDO (strokes only)
  if (interactionMode === "draw" && ctrlDown && e.key.toLowerCase() === "z") {
    const last = state.drawings.pop();
    if (last) drawRedo.push(last);
    renderDrawings();
    scheduleSave();
    return;
  }

  if (interactionMode === "draw" && ctrlDown && e.key.toLowerCase() === "y") {
    const redo = drawRedo.pop();
    if (redo) state.drawings.push(redo);
    renderDrawings();
    scheduleSave();
    return;
  }

// COPY / PASTE (NORMAL MODE — CTRL + SHIFT)
if (interactionMode === "normal") {

  // CTRL + SHIFT + C
  if (ctrlDown && e.altKey && e.key.toLowerCase() === "c") {
    if (selectedIds.size >= 1) {
      const nodesToCopy = state.nodes.filter(n => selectedIds.has(n.id));
      clipboard = {
        type: "multi",
        nodes: JSON.parse(JSON.stringify(nodesToCopy))
      };
    } else if (focusedId) {
      const n = state.nodes.find(n => n.id === focusedId);
      if (n) {
        clipboard = {
          type: "single",
          node: JSON.parse(JSON.stringify(n))
        };
      }
    }
  }

  // CTRL + SHIFT + V
  if (ctrlDown && e.altKey && e.key.toLowerCase() === "v" && clipboard) {
    selectedIds.clear();

    if (clipboard.type === "single" && clipboard.node) {
      const clone = JSON.parse(JSON.stringify(clipboard.node));
      clone.id = crypto.randomUUID();
      clone.x += 40;
      clone.y += 40;
      state.nodes.push(clone);
      focusedId = clone.id;
      selectedIds.add(clone.id);
    }

    if (clipboard.type === "multi" && Array.isArray(clipboard.nodes)) {
      const clones = clipboard.nodes.map(n => {
        const clone = JSON.parse(JSON.stringify(n));
        clone.id = crypto.randomUUID();
        clone.x += 40;
        clone.y += 40;
        return clone;
      });
      state.nodes.push(...clones);
      if (clones.length > 0) {
        focusedId = clones[0].id;
        clones.forEach(c => selectedIds.add(c.id));
      }
    }

    render();
    scheduleSave();
  }
}

});

window.addEventListener("keyup", e => {
  if (e.key === "Shift")   shiftDown = false;
  if (e.key === "Control") ctrlDown  = false;
});

// ---------- ZOOM & PAN ----------
viewport.addEventListener("wheel", e => {
  if (!e.shiftKey) {
    return; // allow normal scrolling (inputs, textareas)
  }

  e.preventDefault();

  const delta   = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = Math.min(2, Math.max(0.1, zoom + delta));

  const rect = viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const wx = (mx - panX) / zoom;
  const wy = (my - panY) / zoom;

  zoom = newZoom;

  panX = mx - wx * zoom;
  panY = my - wy * zoom;

  applyTransform();
  scheduleSave();
});

function applyTransform() {
  const tr = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  canvas.style.transform    = tr;
  drawLayer.style.transform = tr;
}

let panning  = false;
let panStart = { x: 0, y: 0 };

viewport.addEventListener("mousedown", e => {
  if (e.button !== 0) return;

  // TEXT interactions are handled on drawLayer, not viewport
  if (interactionMode !== "normal") {
    return;
  }

  // SHIFT = pan
  if (shiftDown) {
    panning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
    return;
  }

  // CTRL = selection box
  if (ctrlDown) {
    selecting   = true;
    selectStart = { x: e.clientX, y: e.clientY };

    selectBoxEl = document.createElement("div");
    selectBoxEl.className = "select-box";
    document.body.appendChild(selectBoxEl);
    selectBoxEl.style.left   = selectStart.x + "px";
    selectBoxEl.style.top    = selectStart.y + "px";
    selectBoxEl.style.width  = "0px";
    selectBoxEl.style.height = "0px";

    const move = ev => {
      if (!selecting) return;
      const x1 = selectStart.x;
      const y1 = selectStart.y;
      const x2 = ev.clientX;
      const y2 = ev.clientY;

      const left  = Math.min(x1, x2);
      const top   = Math.min(y1, y2);
      const w     = Math.abs(x2 - x1);
      const h     = Math.abs(y2 - y1);

      selectBoxEl.style.left   = left + "px";
      selectBoxEl.style.top    = top  + "px";
      selectBoxEl.style.width  = w    + "px";
      selectBoxEl.style.height = h    + "px";
    };

    const up = ev => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);

      if (!selecting) return;
      selecting = false;

      const x1 = selectStart.x;
      const y1 = selectStart.y;
      const x2 = ev.clientX;
      const y2 = ev.clientY;

      const left   = Math.min(x1, x2);
      const top    = Math.min(y1, y2);
      const right  = Math.max(x1, x2);
      const bottom = Math.max(y1, y2);

      if (selectBoxEl) {
        document.body.removeChild(selectBoxEl);
        selectBoxEl = null;
      }

      selectedIds.clear();
      selectedIds.clear();

      const nodes = Array.from(document.querySelectorAll(".node"))
        .map(el => ({
          el,
          id: el.dataset.id,
          rect: el.getBoundingClientRect(),
          isZone: el.classList.contains("zone")
        }))
        .filter(n => n.id);
      
      // split zones / non-zones
      const zones = nodes.filter(n => n.isZone);
      const others = nodes.filter(n => !n.isZone);
      
      const sel = { left, top, right, bottom };

      // rebuild selection from scratch
      selectedIds.clear();
    
      // A zone becomes "active" if the selection box touches it AND:
      //   - partial escape: overlap BUT neither contains the other
      //   - OR full zone selection: selection fully contains the zone
      const activeZones = zones.filter(z => {
        const intersects          = rectIntersects(z.rect, sel);
        const selectionInsideZone = rectContains(z.rect, sel);   // selection fully inside zone
        const zoneInsideSelection = rectContains(sel, z.rect);   // zone fully inside selection
    
        const partialEscape = intersects && !selectionInsideZone && !zoneInsideSelection;
    
        return partialEscape || zoneInsideSelection;
      });
    
      // If a zone is active -> select the zone + EVERYTHING inside it (even if box didn't touch them)
      if (activeZones.length > 0) {
        activeZones.forEach(z => {
          selectedIds.add(z.id); // include the zone itself
    
          others.forEach(n => {
            if (rectContains(z.rect, n.rect)) {
              selectedIds.add(n.id);
            }
          });
        });
      }
    
      // Normal selection for non-zones ALWAYS happens,
      // but it will NOT cause "select all in zone" when selection is fully inside zone anymore.
      others.forEach(n => {
        if (rectIntersects(n.rect, sel)) {
          selectedIds.add(n.id);
        }
      });
    
      // NOTE:
      // We DO NOT separately select zones just because the box intersects them.
      // Zones are selected only via "activeZones" above (partial escape or fully covering zone).
      focusedId = null; // important: selection-box never sets focus
      
      render();
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return;
  }
});

window.addEventListener("mousemove", e => {
  if (!panning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  applyTransform();
  scheduleSave();
});

window.addEventListener("mouseup", () => {
  panning = false;
  if (activeDraw) {
    activeDraw = null;
  }
  scheduleSave();
});

// ---------- COORD HELPERS ----------
function screenToWorld(e) {
  const r = viewport.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - panX) / zoom,
    y: (e.clientY - r.top  - panY) / zoom
  };
}
// ---------- DRAW / TEXT MODE ----------
drawLayer.addEventListener("mousedown", e => {
  if (e.button !== 0) return;

  // FREEHAND DRAW
  if (interactionMode === "draw") {
    const { x, y } = screenToWorld(e);
    activeDraw = {
      id: crypto.randomUUID(),
      color: drawColor,
      size: drawSize,
      points: [{ x, y }]
    };
    state.drawings.push(activeDraw);
    drawUndo.push(activeDraw);
    drawRedo.length = 0;
    return;
  }

// ✅ TEXT DRAW: click → live input → drag → ENTER to lock
if (interactionMode === "text") {
  const { x, y } = screenToWorld(e);

  const t = {
    id: crypto.randomUUID(),
    x,
    y,
    text: "",
    size: textSize,
    color: textColor
  };

  state.textDrawings.push(t);
  renderDrawings();
  renderText();
  scheduleSave();

  // create live input overlay
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type text…";
  input.style.position = "absolute";
  input.style.left = t.x + "px";
  input.style.top = t.y + "px";
  input.style.fontSize = t.size + "px";
  input.style.color = t.color;
  input.style.background = "rgba(0,0,0,0.6)";
  input.style.border = "1px solid #555";
  input.style.padding = "2px 4px";
  input.style.zIndex = 10000;
  input.style.pointerEvents = "auto";

  drawLayer.appendChild(input);

  // force focus AFTER DOM paint
  setTimeout(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, 0);
  

  let dragging = true;

  const move = ev => {
    if (!dragging) return;
    const p = screenToWorld(ev);
    t.x = p.x;
    t.y = p.y;
    input.style.left = t.x + "px";
    input.style.top = t.y + "px";
  };

  const cleanup = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("keydown", keyHandler);
    input.remove();
  
    renderDrawings();   
    renderText();       
    scheduleSave();
  };

  const keyHandler = ev => {
    if (ev.key === "Enter") {
      t.text = input.value.trim();
      if (!t.text) {
        state.textDrawings = state.textDrawings.filter(x => x.id !== t.id);
      }
      cleanup();
    }

    if (ev.key === "Escape") {
      state.textDrawings = state.textDrawings.filter(x => x.id !== t.id);
      cleanup();
    }
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("keydown", keyHandler);
  return;
}

});


drawLayer.addEventListener("mousemove", e => {
  if (!activeDraw) return;
  if (interactionMode !== "draw") return;
  const { x, y } = screenToWorld(e);
  activeDraw.points.push({ x, y });
  renderDrawings();
});

drawLayer.addEventListener("contextmenu", e => {
  if (interactionMode !== "draw") return;
  e.preventDefault();
  const { x, y } = screenToWorld(e);
  let hit = null;
  for (const d of state.drawings) {
    if (d.points.some(p => Math.hypot(p.x - x, p.y - y) < 8)) {
      hit = d;
      break;
    }
  }
  if (hit && confirm("Delete this drawing?")) {
    state.drawings = state.drawings.filter(d => d !== hit);
    renderDrawings();
    scheduleSave();
  }
});

// ---------- RENDER DRAW + TEXT ----------
function renderDrawings() {
  drawLayer.innerHTML = "";

  // ---- STROKES (SVG) ----
  const SIZE = 40000;
  const HALF = SIZE / 2;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", SIZE);
  svg.setAttribute("height", SIZE);

  state.drawings.forEach(d => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", d.color);

    const oddSize = ((d.size || 2) % 2 === 0) ? (d.size + 1) : d.size;
    p.setAttribute("stroke-width", oddSize);
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");

    const shiftedPoints = d.points.map(pt =>
      `${pt.x + HALF},${pt.y + HALF}`
    ).join(" ");

    p.setAttribute("points", shiftedPoints);
    svg.appendChild(p);
  });

  svg.style.position = "absolute";
  svg.style.left = (-HALF) + "px";
  svg.style.top  = (-HALF) + "px";
  drawLayer.appendChild(svg);

  // ✅ ✅ ✅ CRITICAL FIX: RE-DRAW TEXT AFTER CLEAR ✅ ✅ ✅
  renderText();
}

function renderText() {
  // remove old rendered text
  document.querySelectorAll(".text-overlay").forEach(el => el.remove());

  state.textDrawings.forEach(t => {
    const el = document.createElement("div");

    el.className = "text-overlay";
    el.textContent = t.text;

    el.style.position = "absolute";
    el.style.left = t.x + "px";
    el.style.top = t.y + "px";
    el.style.color = t.color;
    el.style.fontSize = t.size + "px";
    el.style.pointerEvents = "auto";
    el.style.whiteSpace = "pre";
    el.style.userSelect = "none";

    // ✅ Right-click delete (TEXT MODE ONLY)
    el.oncontextmenu = e => {
      e.preventDefault();
      if (interactionMode !== "text") return;

      if (!confirm("Delete this text?")) return;

      const idx = state.textDrawings.findIndex(x => x.id === t.id);
      if (idx !== -1) {
        state.textDrawings.splice(idx, 1);
      }

      renderText();
      scheduleSave();
    };

    drawLayer.appendChild(el);
  });
}


// ---------- SPAWN ----------
function spawn(type) {
  const r  = viewport.getBoundingClientRect();
  const cx = (r.width  / 2 - panX) / zoom;
  const cy = (r.height / 2 - panY) / zoom;

  const id   = crypto.randomUUID();
  const data = {};
  Object.keys(primitives[type].fields).forEach(k => data[k] = "");

  let w = 420, h = 300;
  
  // ---------- INFRASTRUCTURE ----------

  if (type === "host") {
    h = 680;
  }

  if (type === "zone") {
    w = 700;
    h = 450;
    data.title = "ZONE";
    data.color = "#2196f3";
  }

  if (type === "domain_controller") {
    h = 530;
  }

  if (type === "webapp") {
    w = 350;
    h = 580;
  }
    
  if (type === "database") {
    w = 350;
    h = 440;
  }

  if (type === "service") {
    w = 250;
    h = 290;
  }

  // ---------- OBJECT ----------
  if (type === "vuln") {
    w = 400;
    h = 830;
  }

  if (type === "note") {
    w = 200;
    h = 140;
  }
    
  if (type === "artifact"){
    h = 530;
  }

  // ---------- SECRET ----------
  if (type === "credential") {
    w = 300;
    h = 410;
  }

  if (type === "hash") {
    w = 300;
    h = 470;
  }

  if (type === "secret") {
    w = 300;
    h = 310;
  }

  if (type === "flag") {
    w = 210;
    h = 210;
  }

  state.nodes.push({ id, type, x: cx - w / 2, y: cy - h / 2, w, h, data });

  focusedId = id;
  selectedIds.clear();
  selectedIds.add(id);

  render();
  scheduleSave();
}

// ---------- IMPORT / EXPORT ----------
function exportState() {
  const blob = new Blob(
    [JSON.stringify(state, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "attack-canvas-state.json";
  a.click();
}

function importState(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      state.nodes        = parsed.nodes        || [];
      state.edges        = parsed.edges        || [];
      state.drawings     = parsed.drawings     || [];
      state.textDrawings = parsed.textDrawings || [];
      focusedId = null;
      selectedIds.clear();
      render();
      renderDrawings();
      renderText();
      scheduleSave();
    } catch (err) {
      alert("Invalid state file");
    }
  };
  r.readAsText(file);
}

// ---------- RENDER NODES ----------
function render() {
  canvas.innerHTML = "";

  const order = [
    ...state.nodes.filter(n => n.type === "zone"),
    ...state.nodes.filter(n => n.type !== "zone")
  ];

  order.forEach(node => {
    const el = document.createElement("div");
    const category = PRIMITIVE_CATEGORY[node.type] || "object";
    el.className = `node ${node.type} category-${category}`;
    el.dataset.id = node.id;

    el.style.left   = node.x + "px";
    el.style.top    = node.y + "px";
    el.style.width  = node.w + "px";
    el.style.height = node.h + "px";

    if (selectedIds.has(node.id)) el.classList.add("selected");
    if (focusedId === node.id) {
      el.classList.add("focused");
      el.style.zIndex = 9999;
    } else {
      el.style.zIndex = "";
    }

    // focus by double-click
    el.addEventListener("dblclick", e => {
      if (shiftDown) return;
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (focusedId && focusedId !== node.id) return;
      focusedId = node.id;
      selectedIds.clear();
      selectedIds.add(node.id);
      render();
      e.stopPropagation();
    });

    if (node.type === "zone") {
      const color = node.data.color || "#2196f3";
      const title = node.data.title || "ZONE";
      el.style.borderColor = color;

      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='140'>
  <rect width='100%' height='100%' fill='none'/>
  <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
    fill='rgba(255,255,255,0.08)' font-size='28' font-weight='700' font-family='system-ui'>${title}</text>
</svg>`;
      const encoded = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
      el.style.backgroundImage = `url("${encoded}")`;
      el.style.backgroundRepeat = "repeat";
      el.style.backgroundColor  = color + "22";

      if (focusedId === node.id) {
        const t = document.createElement("input");
        t.value = title;
        t.oninput = () => {
          node.data.title = t.value;
          const svgNew = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='140'>
  <rect width='100%' height='100%' fill='none'/>
  <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
    fill='rgba(255,255,255,0.08)' font-size='28' font-weight='700' font-family='system-ui'>${t.value}</text>
</svg>`;
          const encNew = "data:image/svg+xml;utf8," + encodeURIComponent(svgNew);
          el.style.backgroundImage = `url("${encNew}")`;
          scheduleSave();
        };
        t.onmousedown = e => e.stopPropagation();
        el.appendChild(t);

        const c = document.createElement("input");
        c.type  = "color";
        c.value = color;
        c.oninput = () => {
          node.data.color = c.value;
          el.style.borderColor   = c.value;
          el.style.backgroundColor = c.value + "22";
          scheduleSave();
        };
        c.onmousedown = e => e.stopPropagation();
        el.appendChild(c);
      }
    } else {
      const header = document.createElement("div");
      header.className = "node-header";
      header.innerText = primitives[node.type].label;
      el.appendChild(header);

      Object.entries(primitives[node.type].fields).forEach(([k, f]) => {

        // ---- FIELD LABEL ----
        const lbl = document.createElement("div");
        lbl.className = "field-label";
        lbl.textContent = k.replace(/_/g, " ").toUpperCase();
        el.appendChild(lbl);
      
        // ---- FIELD INPUT ----
        const inp = f.type === "textarea"
          ? document.createElement("textarea")
          : document.createElement("input");
      
        inp.value = node.data[k] || "";
        inp.placeholder = ""; // placeholders no longer needed
        inp.oninput = () => {
          node.data[k] = inp.value;
          scheduleSave();
        };
        inp.onmousedown = e => e.stopPropagation();
      
        el.appendChild(inp);
      });
    }

    // MOVE (single or group)
    el.addEventListener("mousedown", e => {
      // --- GROUP MOVE OVERRIDES FOCUS ---
      if (selectedIds.size > 1 && selectedIds.has(node.id)) {
        focusedId = null;
      }
      if (interactionMode !== "normal" || e.button !== 0) return;
      if (shiftDown) return;
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (focusedId && focusedId !== node.id && !ctrlDown) return;

      // CTRL+CLICK toggles selection (no focus change)
      if (ctrlDown) {
        if (selectedIds.has(node.id)) {
          selectedIds.delete(node.id);
        } else {
          selectedIds.add(node.id);
        }
        render();
        return;
      }

      if (!selectedIds.has(node.id)) {
        selectedIds.clear();
        selectedIds.add(node.id);
        if (!focusedId) focusedId = node.id;
        render();
      }

      const sx = e.clientX;
      const sy = e.clientY;
      const starts = {};
      selectedIds.forEach(id => {
        const n = state.nodes.find(nn => nn.id === id);
        if (n) starts[id] = { x: n.x, y: n.y };
      });

      const move = ev => {
        const dx = (ev.clientX - sx) / zoom;
        const dy = (ev.clientY - sy) / zoom;
        selectedIds.forEach(id => {
          const n = state.nodes.find(nn => nn.id === id);
          if (!n) return;
          const s = starts[id];
          n.x = s.x + dx;
          n.y = s.y + dy;
        });
        render();
      };

      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        scheduleSave();
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    // RESIZE (FOCUSED ONLY)
    if (focusedId === node.id) {
      ["tl", "tr", "bl", "br"].forEach(pos => {
        const rh = document.createElement("div");
        rh.className = "resize-handle resize-" + pos;

        rh.onmousedown = e => {
          e.stopPropagation();
          const sx = e.clientX;
          const sy = e.clientY;
          const sw = node.w;
          const sh = node.h;
          const ox = node.x;
          const oy = node.y;

          const move = ev => {
            const dx = (ev.clientX - sx) / zoom;
            const dy = (ev.clientY - sy) / zoom;

            if (pos.includes("r")) node.w = Math.max(160, sw + dx);
            if (pos.includes("b")) node.h = Math.max(120, sh + dy);
            if (pos.includes("l")) {
              node.w = Math.max(160, sw - dx);
              node.x = ox + dx;
            }
            if (pos.includes("t")) {
              node.h = Math.max(120, sh - dy);
              node.y = oy + dy;
            }
            render();
          };

          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            scheduleSave();
          };

          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        };

        el.appendChild(rh);
      });
    }

    canvas.appendChild(el);
  });
}

// ---------- INIT TOOLBAR ----------
window.onload = () => {
  // CLEAR
  const clearBtn = document.getElementById("clear-all");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!confirm("Are you sure? This will clear the entire canvas.")) return;
      state.nodes        = [];
      state.edges        = [];
      state.drawings     = [];
      state.textDrawings = [];
      selectedIds.clear();
      focusedId = null;
      localStorage.removeItem(STORAGE_KEY);
      render();
      renderDrawings();
      renderText();
    };
  }

  // DROPDOWNS
  const groups = document.querySelectorAll(".group");
  let openDropdown = null;

  groups.forEach(g => {
    const btn = g.querySelector(".group-btn");
    const dd  = g.querySelector(".dropdown");
    if (!btn || !dd) return;

    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (openDropdown && openDropdown !== dd) openDropdown.style.display = "none";
      const isOpen = dd.style.display === "flex";
      dd.style.display = isOpen ? "none" : "flex";
      openDropdown = dd.style.display === "flex" ? dd : null;
    });
  });

  document.addEventListener("click", () => {
    // keep DRAW dropdown open while in draw mode (your previous rule)
    if (interactionMode === "draw") return;
    if (openDropdown) {
      openDropdown.style.display = "none";
      openDropdown = null;
    }
  });

  // PRIMITIVES
  const hostBtn = document.getElementById("spawn-host");
  if (hostBtn) hostBtn.onclick = () => spawn("host");

  const zoneBtn = document.getElementById("spawn-zone");
  if (zoneBtn) zoneBtn.onclick = () => spawn("zone");

  const vulnBtn = document.getElementById("spawn-vuln");
  if (vulnBtn) vulnBtn.onclick = () => spawn("vuln");

  const noteBtn = document.getElementById("spawn-note");
  if (noteBtn) noteBtn.onclick = () => spawn("note");

  const credBtn = document.getElementById("spawn-credential");
  if (credBtn) credBtn.onclick = () => spawn("credential");
  
  const hashBtn = document.getElementById("spawn-hash");
  if (hashBtn) hashBtn.onclick = () => spawn("hash");
  
  const flagBtn = document.getElementById("spawn-flag");
  if (flagBtn) flagBtn.onclick = () => spawn("flag");
  
  const secretBtn = document.getElementById("spawn-secret");
  if (secretBtn) secretBtn.onclick = () => spawn("secret");  

  const dcBtn = document.getElementById("spawn-dc");
  if (dcBtn) dcBtn.onclick = () => spawn("domain_controller");

  const svcBtn = document.getElementById("spawn-svc");
  if (svcBtn) svcBtn.onclick = () => spawn("service");

  const dbBtn = document.getElementById("spawn-db");
  if (dbBtn) dbBtn.onclick = () => spawn("database");

  const webappBtn = document.getElementById("spawn-webapp");
  if (webappBtn) webappBtn.onclick = () => spawn("webapp");

  const artifBtn = document.getElementById("spawn-artifact");
  if (artifBtn) artifBtn.onclick = () => spawn("artifact");

  // DRAW / TEXT TOGGLES
  const drawBtn = document.getElementById("draw-toggle");
  const textBtn = document.getElementById("text-toggle");

  if (drawBtn) {
    drawBtn.addEventListener("click", () => {
      interactionMode = (interactionMode === "draw") ? "normal" : "draw";
      drawBtn.classList.toggle("active", interactionMode === "draw");
      if (textBtn) textBtn.classList.remove("active");
      drawLayer.style.pointerEvents =
        (interactionMode === "draw" || interactionMode === "text") ? "auto" : "none";
    });
  }

  if (textBtn) {
    textBtn.addEventListener("click", () => {
      interactionMode = (interactionMode === "text") ? "normal" : "text";
      textBtn.classList.toggle("active", interactionMode === "text");
      if (drawBtn) drawBtn.classList.remove("active");
      drawLayer.style.pointerEvents =
        (interactionMode === "draw" || interactionMode === "text") ? "auto" : "none";
    });
  }

  // DRAW COLOR
  const drawColorInput = document.getElementById("draw-color");
  if (drawColorInput) {
    drawColorInput.oninput = e => {
      drawColor = e.target.value;
    };
  }

  // DRAW SIZE (odd-only)
  const sizeSlider = document.getElementById("draw-size");
  const sizeLabel  = document.getElementById("draw-size-label");
  const DRAW_SIZES = [1, 3, 5, 7, 9, 11, 13];

  if (sizeSlider) {
    let idx = Number(sizeSlider.value) || 0;
    drawSize = DRAW_SIZES[idx];

    if (sizeLabel) {
      sizeLabel.textContent = drawSize + "px";
    }

    sizeSlider.oninput = e => {
      idx = Number(e.target.value);
      drawSize = DRAW_SIZES[idx];
      if (sizeLabel) {
        sizeLabel.textContent = drawSize + "px";
      }
    };
  }

  // TEXT COLOR + SIZE (if TEXT dropdown exists)
  const textColorInput = document.getElementById("text-color");
  if (textColorInput) {
    textColorInput.oninput = e => {
      textColor = e.target.value;
    };
  }

  const textSizeSlider = document.getElementById("text-size");
  const textSizeLabel  = document.getElementById("text-size-label");
  const TEXT_SIZES     = [10, 12, 14, 16, 18, 20, 24];

  if (textSizeSlider) {
    let tidx = Number(textSizeSlider.value) || 3; // default -> 16
    textSize = TEXT_SIZES[tidx];
    if (textSizeLabel) {
      textSizeLabel.textContent = textSize + "px";
    }

    textSizeSlider.oninput = e => {
      tidx = Number(e.target.value);
      textSize = TEXT_SIZES[tidx];
      if (textSizeLabel) {
        textSizeLabel.textContent = textSize + "px";
      }
    };
  }

  drawLayer.style.pointerEvents = "none";

  // IO
  const exportBtn = document.getElementById("export-json");
  if (exportBtn) exportBtn.onclick = exportState;

  const importBtn = document.getElementById("import-btn");
  const importInput = document.getElementById("import-json");
  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = e => {
      if (e.target.files[0]) importState(e.target.files[0]);
    };
  }

  // LOAD + FIRST RENDER
  loadFromStorage();
  applyTransform();
  render();
  renderDrawings();
};
