/*  Dilettante eScentials — Fragrance Finder (PWA)
    app.js — FULL REPLACEMENT (stable + smart human intent search)

    Fix in this version:
    - Synonyms/intent expansions are treated as OR within each word-group.
      Example: "sandalo" will match items containing "sandalo" OR "sandalwood" OR "santal"...
    - Multiple words still behave as AND across groups (expected search behavior).
    - Shows a banner when expansions were used so you know it was "similar terms."
*/

let DATA = [];
let PRIVATE_MODE = false;
const PRIVATE_CODE = "DE-2026";

const els = {
  q: document.getElementById("q"),
  results: document.getElementById("results"),
  status: document.getElementById("status"),
  clearBtn: document.getElementById("clearBtn"),
  onlyOwned: document.getElementById("onlyOwned"),
  onlyDupes: document.getElementById("onlyDupes"),
  privateBtn: document.getElementById("privateBtn"),
  privateLabel: document.getElementById("privateLabel"),
  privateHint: document.getElementById("privateHint"),
};

/* -------------------- helpers -------------------- */

function normalize(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, terms) {
  let out = escapeHtml(text ?? "");
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp("(" + escapeRegExp(t) + ")", "ig");
    out = out.replace(re, '<span class="hl">$1</span>');
  }
  return out;
}

function toText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") return Object.values(v).map(toText).filter(Boolean).join(", ");
  return String(v);
}

function badgeText(item) {
  if (item.isHouseOriginal) return "House Original";
  if (item.isDupe) return "Inspired Expression";
  return "Original";
}
function notesToArray(item) {
  // Returns notes as an array of original strings, deduped, from any supported format.
  // This is for DISPLAY and match-metadata, not for filtering.
  const n = extractNotes(item);

  // If the item has a simple notes array, prefer it.
  const direct = Array.isArray(item.notes) ? item.notes : null;

  const fromPyramid = []
    .concat((n.top ? n.top.split(",") : []))
    .concat((n.heart ? n.heart.split(",") : []))
    .concat((n.base ? n.base.split(",") : []))
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);

  const fromAll = (n.all ? n.all.split(",") : [])
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);

  const raw = (direct ?? []).concat(fromPyramid).concat(fromAll);

  // Deduplicate by normalized form, preserve first seen casing
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const key = normalize(r);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function computeMatchedNotes(item, groups) {
  // groups: array of alternatives per typed term (OR within, AND across)
  // We return notes that matched at least one group alternative.
  const notesArr = notesToArray(item);
  if (!notesArr.length || !groups.length) return [];

  const notesNorm = notesArr.map((x) => normalize(x));
  const matched = [];

  for (const alts of groups) {
    // Find notes that satisfy this group
    for (let i = 0; i < notesNorm.length; i++) {
      const nn = notesNorm[i];
      const hit = alts.some((alt) => nn.includes(alt));
      if (hit) matched.push(notesArr[i]);
    }
  }

  // Deduplicate again, keep order, and cap for clean UI
  const seen = new Set();
  const out = [];
  for (const m of matched) {
    const k = normalize(m);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(m);
    if (out.length >= 8) break;
  }
  return out;
}


/* -------------------- data extraction (all formats) -------------------- */

function extractField(item, candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "function") {
      const v = c(item);
      if (v != null && toText(v).trim() !== "") return v;
    } else if (typeof c === "string") {
      if (item[c] != null && toText(item[c]).trim() !== "") return item[c];
    }
  }
  return "";
}

function extractNotes(item) {
  const notesObj = item.notes && typeof item.notes === "object" && !Array.isArray(item.notes) ? item.notes : null;

  const top = extractField(item, [
    "notesTop", "Top Notes", "topNotes", "top_notes",
    () => notesObj?.top,
  ]);
  const heart = extractField(item, [
    "notesHeart", "Heart Notes", "middleNotes", "middle_notes", "heartNotes",
    () => notesObj?.heart,
    () => notesObj?.middle,
  ]);
  const base = extractField(item, [
    "notesBase", "Base Notes", "Bottom Notes", "baseNotes", "base_notes",
    () => notesObj?.base,
  ]);

  const allNotes = extractField(item, [
    "notesText", "Notes", "All Notes",
    (it) => (Array.isArray(it.notes) ? it.notes : ""),
  ]);

  return {
    top: toText(top).trim(),
    heart: toText(heart).trim(),
    base: toText(base).trim(),
    all: toText(allNotes).trim(),
    hasPyramid: !!(toText(top).trim() || toText(heart).trim() || toText(base).trim()),
  };
}

function buildHaystack(item) {
  const family = extractField(item, ["family", "Scent Family", "Olfactive Family", "scentFamily", "olfactiveFamily"]);
  const ref = extractField(item, ["inspiredBy", "Inspired By", "reference", "Reference"]);
  const tags = extractField(item, ["tags", "Tags"]);
  const size = extractField(item, ["size", "Size", "Size (ml)"]);
  const notes = extractNotes(item);

  const builtFrom = extractField(item, [
    (it) => it.private?.builtFrom,
    "Built From",
    "builtFrom",
    "Components",
    "components",
  ]);

  return [
    item.id,
    item.name,
    item.brand,
    item.house,
    family,
    ref,
    item.gender,
    item.concentration,
    size,
    tags,

    // notes in all formats:
    item.notes,
    notes.top,
    notes.heart,
    notes.base,
    notes.all,

    // private is searchable even when hidden
    builtFrom,
  ]
    .map(toText)
    .filter(Boolean)
    .map(normalize)
    .join(" | ");
}

/* -------------------- smart expansions (synonyms + intent) -------------------- */

/*
  For a given typed term, we create a GROUP of acceptable alternatives.
  Matching behavior:
  - For each typed term/group: ANY alternative can match (OR).
  - Across multiple typed terms/groups: ALL groups must match (AND).
*/

const EXPAND = {
  // Sandalwood cluster
  sandalwood: { add: ["santal", "sandalo", "santalum", "sandal"], label: "sandalwood ⇄ santal/sandalo" },
  santal: { add: ["sandalwood", "sandalo", "santalum", "sandal"], label: "santal ⇄ sandalwood/sandalo" },
  sandalo: { add: ["sandalwood", "santal", "santalum", "sandal"], label: "sandalo ⇄ sandalwood/santal" },
  santalum: { add: ["sandalwood", "santal", "sandalo", "sandal"], label: "santalum ⇄ sandalwood" },
  sandal: { add: ["sandalwood", "santal", "sandalo", "santalum"], label: "sandal ⇄ sandalwood/santal" },

  // Amber / woody amber
  ambroxan: { add: ["amberwood", "woody amber", "ambergris"], label: "ambroxan ⇄ amberwood/ambergris" },
  amberwood: { add: ["ambroxan", "woody amber"], label: "amberwood ⇄ ambroxan" },
  ambergris: { add: ["ambroxan", "marine amber", "salty amber"], label: "ambergris ⇄ marine/ambroxan" },
  amber: { add: ["ambery", "resinous"], label: "amber ⇄ ambery/resinous" },
  ambery: { add: ["amber", "resinous"], label: "ambery ⇄ amber/resinous" },

  // Incense
  incense: { add: ["olibanum", "frankincense", "smoky"], label: "incense ⇄ frankincense/olibanum" },
  frankincense: { add: ["incense", "olibanum"], label: "frankincense ⇄ incense/olibanum" },
  olibanum: { add: ["incense", "frankincense"], label: "olibanum ⇄ incense/frankincense" },

  // Oud
  oud: { add: ["agarwood"], label: "oud ⇄ agarwood" },
  agarwood: { add: ["oud"], label: "agarwood ⇄ oud" },

  // Iris / powder
  iris: { add: ["orris", "powdery"], label: "iris ⇄ orris/powdery" },
  orris: { add: ["iris", "powdery"], label: "orris ⇄ iris/powdery" },
  powdery: { add: ["iris", "orris"], label: "powdery ⇄ iris/orris" },

  // Tonka
  tonka: { add: ["coumarin"], label: "tonka ⇄ coumarin" },
  coumarin: { add: ["tonka"], label: "coumarin ⇄ tonka" },

  // Citrus bundle
  citrus: { add: ["bergamot", "grapefruit", "lemon", "lime", "orange", "bright"], label: "citrus ⇄ common citruses" },
  bergamot: { add: ["citrus", "bright"], label: "bergamot ⇄ citrus/bright" },
  grapefruit: { add: ["citrus", "bright"], label: "grapefruit ⇄ citrus/bright" },
  lemon: { add: ["citrus", "bright"], label: "lemon ⇄ citrus/bright" },
  lime: { add: ["citrus", "bright"], label: "lime ⇄ citrus/bright" },
  orange: { add: ["citrus", "bright"], label: "orange ⇄ citrus/bright" },

  // Vanilla
  vanilla: { add: ["vanille", "creamy", "sweet"], label: "vanilla ⇄ creamy/sweet" },
  vanille: { add: ["vanilla", "creamy", "sweet"], label: "vanille ⇄ vanilla" },

  // Musk / skin
  musk: { add: ["musky", "skin scent"], label: "musk ⇄ musky/skin scent" },
  musky: { add: ["musk", "skin scent"], label: "musky ⇄ musk/skin scent" },

  // Human intent terms
  fresh: { add: ["clean", "airy", "citrus", "green"], label: "fresh ⇄ clean/airy/citrus/green" },
  clean: { add: ["fresh", "airy"], label: "clean ⇄ fresh/airy" },
  airy: { add: ["fresh", "clean"], label: "airy ⇄ fresh/clean" },

  blue: { add: ["aquatic", "marine", "ozonic", "fresh"], label: "blue ⇄ aquatic/marine/ozonic" },
  aquatic: { add: ["blue", "marine", "ozonic"], label: "aquatic ⇄ marine/ozonic" },
  marine: { add: ["blue", "aquatic", "salty"], label: "marine ⇄ aquatic/salty" },
  ozonic: { add: ["blue", "aquatic", "airy"], label: "ozonic ⇄ blue/airy" },

  green: { add: ["herbal", "leafy", "fresh"], label: "green ⇄ herbal/leafy/fresh" },
  herbal: { add: ["green", "leafy"], label: "herbal ⇄ green/leafy" },
  leafy: { add: ["green", "herbal"], label: "leafy ⇄ green/herbal" },

  sweet: { add: ["vanilla", "gourmand", "sugary"], label: "sweet ⇄ vanilla/gourmand" },
  gourmand: { add: ["sweet", "dessert", "edible"], label: "gourmand ⇄ dessert-like" },

  spicy: { add: ["warm spicy", "pepper", "cardamom"], label: "spicy ⇄ warm spice/pepper" },
  smoky: { add: ["incense", "dark"], label: "smoky ⇄ incense/dark" },
  dark: { add: ["night", "smoky", "amber"], label: "dark ⇄ night/smoky/amber" },

  office: { add: ["clean", "fresh", "light"], label: "office ⇄ clean/fresh/light" },
  summer: { add: ["fresh", "citrus", "blue"], label: "summer ⇄ fresh/citrus/blue" },
  winter: { add: ["amber", "spicy", "vanilla"], label: "winter ⇄ amber/spice/vanilla" },
  night: { add: ["dark", "amber", "spicy"], label: "night ⇄ dark/amber/spice" },
  sexy: { add: ["amber", "musk", "vanilla"], label: "sexy ⇄ amber/musk/vanilla" },
};

function buildGroupsFromTerms(typedTerms) {
  const groups = [];
  const usedLabels = new Set();

  for (const raw of typedTerms) {
    const t = normalize(raw);
    if (!t) continue;

    // Start the group with the typed term itself
    const group = new Set([t]);

    // Exact expansion by key
    const ex = EXPAND[t];
    if (ex) {
      ex.add.forEach((a) => group.add(normalize(a)));
      usedLabels.add(ex.label);
    }

    // Lightweight partial inference (helps users type partials)
    if (t.includes("santal") || t.includes("sandalo") || t.includes("sandal")) {
      ["sandalwood", "santal", "sandalo", "santalum", "sandal"].forEach((a) => group.add(a));
      usedLabels.add("sandalwood family terms");
    }
    if (t.includes("ambrox")) {
      ["ambroxan", "amberwood", "woody amber", "ambergris"].forEach((a) => group.add(a));
      usedLabels.add("ambroxan family terms");
    }

    groups.push([...group].filter(Boolean));
  }

  return { groups, appliedLabels: [...usedLabels] };
}

function matchGroupsAND(hay, groups) {
  // AND across groups, OR within group
  return groups.every((alts) => alts.some((alt) => hay.includes(alt)));
}

function setExpansionNotice(appliedLabels) {
  if (!appliedLabels || appliedLabels.length === 0) return "";
  const safe = appliedLabels.slice(0, 4).map((x) => escapeHtml(x)).join(" · ");
  return ` <span style="opacity:.85">• matched using similar terms: ${safe}</span>`;
}

/* -------------------- cards -------------------- */

function cardHtml(item, terms, meta) {
  const badge = badgeText(item);
  const owned = item.owned ? "Owned" : "Not owned";
  const cardId = "c_" + (item.id ?? normalize(item.name ?? "").replace(/\s+/g, "_"));

  const family = toText(extractField(item, ["family", "Olfactive Family", "Scent Family"])).trim();
  const gender = toText(extractField(item, ["gender"])).trim();
  const reference = toText(extractField(item, ["inspiredBy", "Inspired By", "reference", "Reference"])).trim();

  const notes = extractNotes(item);
  const matchedNotes = (meta?.matchedNotes ?? []).slice(0, 8);

  let privateHtml = "";
  if (PRIVATE_MODE && item.private?.builtFrom) {
    privateHtml =
      '<div class="kv" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.10); padding-top:10px;">' +
      "<div><b>Private:</b> Built from " + escapeHtml(toText(item.private.builtFrom)) + "</div>" +
      "</div>";
  }

  const inspiredLine = reference
    ? '<div class="subLine"><span class="metaLabel">Inspired by</span> ' + highlight(reference, terms) + "</div>"
    : "";

  const matchedNotesLine = matchedNotes.length
    ? '<div class="subLine"><span class="metaLabel">Matched notes</span> ' +
        matchedNotes.map((n) => '<span class="chip">' + escapeHtml(n) + "</span>").join(" ") +
      "</div>"
    : "";

  return (
    '<article class="card">' +
      '<div class="cardTop">' +
        '<div class="title">' + highlight(item.name ?? "", terms) + "</div>" +
        '<div class="badge">' + badge + " · " + owned + "</div>" +
      "</div>" +

      inspiredLine +
      matchedNotesLine +

      '<div class="metaRow">' +
        '<div class="metaItem"><span class="metaLabel">House</span> ' + highlight(toText(item.brand ?? item.house ?? ""), terms) + "</div>" +
        '<div class="metaItem"><span class="metaLabel">Family</span> ' + highlight(family || "—", terms) + "</div>" +
        (gender ? '<div class="metaItem"><span class="metaLabel">Gender</span> ' + highlight(gender, terms) + "</div>" : "") +
      "</div>" +

      '<button class="detailsBtn" type="button" data-target="' + cardId + '">Details</button>' +
      '<div class="details" id="' + cardId + '" hidden>' +

        '<div class="kv">' +
          // Keep notes details here for full breakdown
          (notes.top ? "<div><b>Top:</b> " + highlight(notes.top, terms) + "</div>" : "") +
          (notes.heart ? "<div><b>Heart:</b> " + highlight(notes.heart, terms) + "</div>" : "") +
          (notes.base ? "<div><b>Base:</b> " + highlight(notes.base, terms) + "</div>" : "") +
          ((!notes.hasPyramid && notes.all) ? "<div><b>Notes:</b> " + highlight(notes.all, terms) + "</div>" : "") +
        "</div>" +

        privateHtml +

      "</div>" +
    "</article>"
  );
}

function render(list, terms, metasById) {
  if (list.length === 0) {
    els.results.innerHTML = '<div class="card"><div class="meta">No matches.</div></div>';
    return;
  }

  els.results.innerHTML = list
    .map((item) => {
      const key = item.id ?? normalize(item.name ?? "");
      const meta = metasById?.get(key) ?? null;
      return cardHtml(item, terms, meta);
    })
    .join("");

  els.results.querySelectorAll(".detailsBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-target");
      const panel = document.getElementById(id);
      if (!panel) return;
      panel.hidden = !panel.hidden;
      btn.textContent = panel.hidden ? "Details" : "Hide";
    });
  });
}

/* -------------------- private mode -------------------- */

function setPrivateMode(on) {
  PRIVATE_MODE = !!on;
  els.privateHint.hidden = !PRIVATE_MODE;
  els.privateLabel.textContent = PRIVATE_MODE ? "Private On" : "Private";
  els.privateBtn.textContent = PRIVATE_MODE ? "🔓 " : "🔒 ";
  els.privateBtn.appendChild(els.privateLabel);
  searchAndRender();
}

/* -------------------- smart search commands -------------------- */

function parseCommand(q) {
  const s = normalize(q);

  if (
    s === "house original" ||
    s === "house:original" ||
    s === "house originals" ||
    s === "house:originals" ||
    s === "my originals" ||
    s === "my original"
  ) {
    return { mode: "house_only", query: "" };
  }

  const dupePrefixes = ["dupes of ", "inspired by ", "clones of ", "dupe of ", "clone of "];
  for (const p of dupePrefixes) {
    if (s.startsWith(p)) return { mode: "dupes_of", query: s.slice(p.length).trim() };
  }

  const origPrefixes = ["original ", "og ", "real "];
  for (const p of origPrefixes) {
    if (s.startsWith(p)) return { mode: "original", query: s.slice(p.length).trim() };
  }

  return { mode: "all", query: s };
}

function searchAndRender() {
  const raw = (els.q.value ?? "").trim();
  const cmd = parseCommand(raw);

  const userTerms = normalize(raw).split(/\s+/).filter(Boolean);
  const queryTerms = (cmd.query || "").split(/\s+/).filter(Boolean);

  const typedTerms = queryTerms.length ? queryTerms : userTerms;
  const { groups, appliedLabels } = buildGroupsFromTerms(typedTerms);

  const filtered = DATA
    .filter((i) => (els.onlyOwned.checked ? !!i.owned : true))
    .filter((i) => (els.onlyDupes.checked ? !!i.isDupe : true))
    .filter((i) => {
      if (cmd.mode === "house_only") return !!i.isHouseOriginal;

      if (!groups.length) return true;

      if (cmd.mode === "dupes_of") {
        if (!i.isDupe) return false;
        const ref = normalize(toText(extractField(i, ["inspiredBy", "Inspired By", "reference", "Reference"])));
        return matchGroupsAND(ref, groups);
      }

      if (cmd.mode === "original") {
        if (i.isDupe) return false;
        const hay = buildHaystack(i);
        return matchGroupsAND(hay, groups);
      }
  const metasById = new Map();
  for (const item of filtered) {
    const key = item.id ?? normalize(item.name ?? "");
    metasById.set(key, {
      matchedNotes: computeMatchedNotes(item, groups),
    });
  }
      const hay = buildHaystack(i);
      return matchGroupsAND(hay, groups);
    })
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  const notice = setExpansionNotice(appliedLabels);
  els.status.innerHTML = `${filtered.length} match(es)` + (raw ? ` for "${escapeHtml(raw)}"` : "") + notice;

  // Highlight only what user typed, not expansions
    render(filtered, userTerms, metasById);
}

/* -------------------- init -------------------- */

async function init() {
  try {
    const res = await fetch("./fragrances.json", { cache: "no-store" });
    DATA = await res.json();
    searchAndRender();
  } catch (e) {
  console.error("INIT ERROR:", e);
  els.status.textContent = "Error happened. Open Console (F12) and look for INIT ERROR.";
}

  els.q.addEventListener("input", searchAndRender);
  els.onlyOwned.addEventListener("change", searchAndRender);
  els.onlyDupes.addEventListener("change", searchAndRender);

  els.clearBtn.addEventListener("click", () => {
    els.q.value = "";
    els.q.focus();
    searchAndRender();
  });

  els.privateBtn.addEventListener("click", () => {
    if (PRIVATE_MODE) {
      setPrivateMode(false);
      return;
    }
    const code = prompt("Enter Private Mode code:");
    if (code === PRIVATE_CODE) {
      setPrivateMode(true);
    } else if (code !== null) {
      alert("Incorrect code.");
    }
  });
}

init();


