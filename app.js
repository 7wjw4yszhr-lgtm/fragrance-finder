/*  Dilettante eScentials — Fragrance Finder (PWA)
    app.js — FULL REPLACEMENT (stable + smart human intent search)

    Features:
    - Works with many data formats (notes arrays, note pyramids, spreadsheet keys)
    - Smart commands:
        dupes of <x> / inspired by <x> / clones of <x>
        original <x> / og <x>
        house original / house:original / my originals
    - Human intent terms (fresh, blue, summer, sexy, office, etc.)
    - Synonyms / interchangeables (sandalo ⇄ sandalwood ⇄ santal)
    - Shows a small banner when synonyms/intent expansions were applied
      so the user knows results came from "similar terms", not exact literal text.
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

function matchesAllTerms(hay, terms) {
  return terms.every((t) => hay.includes(t));
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
    (it) => notesObj?.top,
  ]);
  const heart = extractField(item, [
    "notesHeart", "Heart Notes", "middleNotes", "middle_notes", "heartNotes",
    (it) => notesObj?.heart,
    (it) => notesObj?.middle,
  ]);
  const base = extractField(item, [
    "notesBase", "Base Notes", "Bottom Notes", "baseNotes", "base_notes",
    (it) => notesObj?.base,
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

/*  Each entry:
    key -> {
      add: [terms to add if key present],
      label: string shown to user as "matched via"
    }
*/
const EXPANSIONS = {
  // Sandalwood cluster
  sandalwood: { add: ["santal", "sandalo", "santalum", "sandal"], label: "sandalwood ⇄ santal/sandalo" },
  santal: { add: ["sandalwood", "sandalo", "santalum", "sandal"], label: "santal ⇄ sandalwood/sandalo" },
  sandalo: { add: ["sandalwood", "santal", "santalum", "sandal"], label: "sandalo ⇄ sandalwood/santal" },
  santalum: { add: ["sandalwood", "santal", "sandalo", "sandal"], label: "santalum ⇄ sandalwood" },
  sandal: { add: ["sandalwood", "santal", "sandalo", "santalum"], label: "sandal ⇄ sandalwood/santal" },

  // Amber / woody amber
  ambroxan: { add: ["amberwood", "woody amber", "ambergris"], label: "ambroxan ⇄ amberwood/ambergris" },
  amberwood: { add: ["ambroxan", "woody amber"], label: "amberwood ⇄ ambroxan" },
  ambergris: { add: ["ambroxan", "salty amber", "marine amber"], label: "ambergris ⇄ ambroxan/marine" },
  ambery: { add: ["amber", "resinous"], label: "am بیرry ⇄ amber/resinous" }, // harmless; note normalize keeps it safe

  // Incense
  incense: { add: ["olibanum", "frankincense", "smoky"], label: "incense ⇄ frankincense/olibanum" },
  frankincense: { add: ["incense", "olibanum"], label: "frankincense ⇄ incense/olibanum" },
  olibanum: { add: ["incense", "frankincense"], label: "olibanum ⇄ incense/frankincense" },

  // Oud
  oud: { add: ["agarwood"], label: "oud ⇄ agarwood" },
  agarwood: { add: ["oud"], label: "agarwood ⇄ oud" },

  // Iris
  iris: { add: ["orris", "powdery"], label: "iris ⇄ orris/powdery" },
  orris: { add: ["iris", "powdery"], label: "orris ⇄ iris/powdery" },

  // Tonka
  tonka: { add: ["coumarin", "sweet almond"], label: "tonka ⇄ coumarin" },
  coumarin: { add: ["tonka"], label: "coumarin ⇄ tonka" },

  // Citrus bundle
  citrus: { add: ["bergamot", "grapefruit", "lemon", "lime", "orange"], label: "citrus ⇄ bergamot/grapefruit/lemon/lime/orange" },
  bergamot: { add: ["citrus", "bright"], label: "bergamot ⇄ citrus/bright" },
  grapefruit: { add: ["citrus", "bright"], label: "grapefruit ⇄ citrus/bright" },
  lemon: { add: ["citrus", "bright"], label: "lemon ⇄ citrus/bright" },
  lime: { add: ["citrus", "bright"], label: "lime ⇄ citrus/bright" },
  orange: { add: ["citrus", "bright"], label: "orange ⇄ citrus/bright" },

  // Vanilla
  vanilla: { add: ["vanille", "creamy", "sweet"], label: "vanilla ⇄ creamy/sweet" },
  vanille: { add: ["vanilla", "creamy", "sweet"], label: "vanille ⇄ vanilla" },

  // Musks / clean
  musky: { add: ["musk", "skin scent"], label: "musky ⇄ musk/skin scent" },
  musk: { add: ["musky", "skin scent"], label: "musk ⇄ musky/skin scent" },
  clean: { add: ["fresh", "airy"], label: "clean ⇄ fresh/airy" },

  // Intent terms (human words)
  fresh: { add: ["clean", "airy", "citrus", "green"], label: "fresh ⇄ clean/airy/citrus/green" },
  blue: { add: ["aquatic", "marine", "ozonic", "fresh"], label: "blue ⇄ aquatic/marine/ozonic" },
  aquatic: { add: ["blue", "marine", "ozonic"], label: "aquatic ⇄ marine/ozonic" },
  marine: { add: ["blue", "aquatic", "salty"], label: "marine ⇄ aquatic/salty" },
  green: { add: ["herbal", "leafy", "fresh"], label: "green ⇄ herbal/leafy" },
  sweet: { add: ["vanilla", "gourmand", "sugary"], label: "sweet ⇄ vanilla/gourmand" },
  gourmand: { add: ["sweet", "dessert", "edible"], label: "gourmand ⇄ dessert-like" },
  spicy: { add: ["warm spicy", "pepper", "cardamom"], label: "spicy ⇄ warm spice/pepper" },
  smoky: { add: ["incense", "leather", "dark"], label: "smoky ⇄ incense/dark" },
  office: { add: ["clean", "fresh", "light"], label: "office ⇄ clean/fresh/light" },
  summer: { add: ["fresh", "citrus", "blue"], label: "summer ⇄ fresh/citrus/blue" },
  winter: { add: ["amber", "spicy", "vanilla"], label: "winter ⇄ amber/spice/vanilla" },
  night: { add: ["dark", "amber", "spicy"], label: "night ⇄ dark/amber/spice" },
  sexy: { add: ["amber", "musk", "vanilla"], label: "sexy ⇄ amber/musk/vanilla" },
};

function expandTerms(terms) {
  const base = terms.map(normalize).filter(Boolean);
  const out = [...base];
  const usedLabels = new Set();

  // exact-key expansions
  for (const t of base) {
    const e = EXPANSIONS[t];
    if (!e) continue;
    for (const add of e.add) out.push(normalize(add));
    usedLabels.add(e.label);
  }

  // lightweight partial inference (helps sandalo/santal variations)
  const joined = base.join(" ");
  if (joined.includes("santal") || joined.includes("sandalo") || joined.includes("sandal")) {
    out.push("sandalwood", "santal", "sandalo", "santalum", "sandal");
    usedLabels.add("sandalwood family terms");
  }
  if (joined.includes("ambrox")) {
    out.push("ambroxan", "amberwood", "woody amber");
    usedLabels.add("ambroxan family terms");
  }

  const final = [...new Set(out)].filter(Boolean);
  return {
    expanded: final,
    appliedLabels: [...usedLabels],
  };
}

/* -------------------- UI banner for expansions -------------------- */

function setExpansionNotice(appliedLabels) {
  // We inject a small banner into the status element.
  // If user did not trigger expansions, show normal status only.
  if (!appliedLabels || appliedLabels.length === 0) return "";

  const safe = appliedLabels
    .slice(0, 4)
    .map((x) => escapeHtml(x))
    .join(" · ");

  return ` <span style="opacity:.85">• matched using similar terms: ${safe}</span>`;
}

/* -------------------- cards -------------------- */

function cardHtml(item, terms) {
  const badge = badgeText(item);
  const owned = item.owned ? "Owned" : "Not owned";
  const cardId = "c_" + (item.id ?? normalize(item.name ?? "").replace(/\s+/g, "_"));

  const family = toText(extractField(item, ["family", "Olfactive Family", "Scent Family"])).trim();
  const gender = toText(extractField(item, ["gender"])).trim();
  const concentration = toText(extractField(item, ["concentration", "Concentration"])).trim();
  const reference = toText(extractField(item, ["inspiredBy", "Inspired By", "reference", "Reference"])).trim();

  const notes = extractNotes(item);

  let privateHtml = "";
  if (PRIVATE_MODE && item.private?.builtFrom) {
    privateHtml =
      '<div class="kv" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.10); padding-top:10px;">' +
      "<div><b>Private:</b> Built from " + escapeHtml(toText(item.private.builtFrom)) + "</div>" +
      "</div>";
  }

  return (
    '<article class="card">' +
      '<div class="cardTop">' +
        '<div class="title">' + highlight(item.name ?? "", terms) + "</div>" +
        '<div class="badge">' + badge + " · " + owned + "</div>" +
      "</div>" +

      '<div class="metaRow">' +
        '<div class="metaItem"><span class="metaLabel">House</span> ' + highlight(toText(item.brand ?? item.house ?? ""), terms) + "</div>" +
        '<div class="metaItem"><span class="metaLabel">Olfactive Family</span> ' + highlight(family || "—", terms) + "</div>" +
        (gender ? '<div class="metaItem"><span class="metaLabel">Gender</span> ' + highlight(gender, terms) + "</div>" : "") +
      "</div>" +

      '<button class="detailsBtn" type="button" data-target="' + cardId + '">Details</button>' +
      '<div class="details" id="' + cardId + '" hidden>' +

        '<div class="kv">' +
          "<div><b>Reference:</b> " + (reference ? highlight(reference, terms) : "—") + "</div>" +
          (concentration ? "<div><b>Concentration:</b> " + highlight(concentration, terms) + "</div>" : "") +
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

function render(list, terms) {
  if (list.length === 0) {
    els.results.innerHTML = '<div class="card"><div class="meta">No matches.</div></div>';
    return;
  }

  els.results.innerHTML = list.map((item) => cardHtml(item, terms)).join("");

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

/* -------------------- smart search -------------------- */

function parseCommand(q) {
  const s = normalize(q);

  // house originals
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

  // dupes/inspired/clones
  const dupePrefixes = ["dupes of ", "inspired by ", "clones of ", "dupe of ", "clone of "];
  for (const p of dupePrefixes) {
    if (s.startsWith(p)) return { mode: "dupes_of", query: s.slice(p.length).trim() };
  }

  // original/og
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

  const { expanded, appliedLabels } = expandTerms(queryTerms.length ? queryTerms : userTerms);

  const filtered = DATA
    .filter((i) => (els.onlyOwned.checked ? !!i.owned : true))
    .filter((i) => (els.onlyDupes.checked ? !!i.isDupe : true))
    .filter((i) => {
      if (cmd.mode === "house_only") return !!i.isHouseOriginal;

      if (!expanded.length) return true;

      if (cmd.mode === "dupes_of") {
        if (!i.isDupe) return false;
        const ref = normalize(
          toText(extractField(i, ["inspiredBy", "Inspired By", "reference", "Reference"]))
        );
        return expanded.every((t) => ref.includes(t));
      }

      if (cmd.mode === "original") {
        if (i.isDupe) return false;
        return matchesAllTerms(buildHaystack(i), expanded);
      }

      return matchesAllTerms(buildHaystack(i), expanded);
    })
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  const notice = setExpansionNotice(appliedLabels);
  els.status.innerHTML = `${filtered.length} match(es)` + (raw ? ` for "${escapeHtml(raw)}"` : "") + notice;

  // highlight only what the user actually typed (not synonym expansions)
  render(filtered, userTerms);
}

/* -------------------- init -------------------- */

async function init() {
  try {
    const res = await fetch("./fragrances.json", { cache: "no-store" });
    DATA = await res.json();
    searchAndRender();
  } catch (e) {
    els.status.textContent = "Could not load fragrances.json. Check JSON format and file name.";
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
