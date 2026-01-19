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

function badgeText(item) {
  if (item.isHouseOriginal) return "House Original";
  if (item.isDupe) return "Inspired Expression";
  return "Original";
}

/* ---------- SEARCH CORE ---------- */

function matchesAllTerms(hay, terms) {
  return terms.every((t) => hay.includes(t));
}

function buildHaystack(item) {
  const toText = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(toText).join(", ");
    if (typeof v === "object") return Object.values(v).map(toText).join(", ");
    return String(v);
  };

  return [
    item.id,
    item.name,
    item.brand,
    item.house,
    item.inspiredBy,
    item.reference,
    item.gender,
    item.concentration,
    item.size,
    item.family,
    item.tags,
    item.notes,
    item.notesTop,
    item.notesHeart,
    item.notesBase,
    item["Top Notes"],
    item["Heart Notes"],
    item["Bottom Notes"],
    item["Notes"],
    item.private?.builtFrom
  ]
    .map(toText)
    .filter(Boolean)
    .map(normalize)
    .join(" | ");
}

/* ---------- CARD RENDER ---------- */

function cardHtml(item, terms) {
  const badge = badgeText(item);
  const owned = item.owned ? "Owned" : "Not owned";
  const cardId = "c_" + (item.id ?? normalize(item.name).replace(/\s+/g, "_"));

  const toText = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") return Object.values(v).join(", ");
    return String(v);
  };

  const family = toText(item.family ?? item["Olfactive Family"]);
  const gender = toText(item.gender);
  const concentration = toText(item.concentration);
  const reference = toText(item.inspiredBy ?? item.reference);

  const top = toText(item.notesTop ?? item["Top Notes"] ?? item.notes?.top);
  const heart = toText(item.notesHeart ?? item["Heart Notes"] ?? item.notes?.heart ?? item.notes?.middle);
  const base = toText(item.notesBase ?? item["Bottom Notes"] ?? item.notes?.base);
  const allNotes = toText(item.notes ?? item["Notes"]);

  let privateHtml = "";
  if (PRIVATE_MODE && item.private?.builtFrom) {
    privateHtml =
      '<div class="kv" style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px">' +
      "<div><b>Private:</b> Built from " + escapeHtml(toText(item.private.builtFrom)) + "</div>" +
      "</div>";
  }

  return `
  <article class="card">
    <div class="cardTop">
      <div class="title">${highlight(item.name, terms)}</div>
      <div class="badge">${badge} · ${owned}</div>
    </div>

    <div class="metaRow">
      <div class="metaItem"><span class="metaLabel">House</span> ${highlight(item.brand, terms)}</div>
      <div class="metaItem"><span class="metaLabel">Olfactive Family</span> ${highlight(family || "—", terms)}</div>
      ${gender ? `<div class="metaItem"><span class="metaLabel">Gender</span> ${highlight(gender, terms)}</div>` : ""}
    </div>

    <button class="detailsBtn" data-target="${cardId}">Details</button>

    <div class="details" id="${cardId}" hidden>
      <div class="kv">
        <div><b>Reference:</b> ${reference || "—"}</div>
        ${concentration ? `<div><b>Concentration:</b> ${concentration}</div>` : ""}
        ${top ? `<div><b>Top:</b> ${highlight(top, terms)}</div>` : ""}
        ${heart ? `<div><b>Heart:</b> ${highlight(heart, terms)}</div>` : ""}
        ${base ? `<div><b>Base:</b> ${highlight(base, terms)}</div>` : ""}
        ${!top && !heart && !base && allNotes ? `<div><b>Notes:</b> ${highlight(allNotes, terms)}</div>` : ""}
      </div>
      ${privateHtml}
    </div>
  </article>`;
}

/* ---------- RENDER + EVENTS ---------- */

function render(list, terms) {
  els.results.innerHTML = list.length
    ? list.map((i) => cardHtml(i, terms)).join("")
    : '<div class="card"><div class="meta">No matches.</div></div>';

  els.results.querySelectorAll(".detailsBtn").forEach((btn) => {
    btn.onclick = () => {
      const panel = document.getElementById(btn.dataset.target);
      panel.hidden = !panel.hidden;
      btn.textContent = panel.hidden ? "Details" : "Hide";
    };
  });
}

function searchAndRender() {
  const raw = els.q.value.trim();
  const q = normalize(raw);
  const terms = q.split(/\s+/).filter(Boolean);

  // ---------- SMART COMMANDS ----------
  // Supported:
  // dupes of <query>
  // inspired by <query>
  // original <query>
  // house original / house:original
  let mode = "all"; // all | dupes_of | original
  let modeQuery = q;

  const isHouseOnly =
    q === "house original" ||
    q === "house:original" ||
    q === "house originals" ||
    q === "house:originals";

  if (q.startsWith("dupes of ")) {
    mode = "dupes_of";
    modeQuery = q.replace(/^dupes of\s+/, "").trim();
  } else if (q.startsWith("inspired by ")) {
    mode = "dupes_of";
    modeQuery = q.replace(/^inspired by\s+/, "").trim();
  } else if (q.startsWith("original ")) {
    mode = "original";
    modeQuery = q.replace(/^original\s+/, "").trim();
  }

  const modeTerms = modeQuery.split(/\s+/).filter(Boolean);

  // ---------- SYNONYMS ----------
  // Expand terms so searching either word finds the other.
  const synonymMap = {
    sandalwood: ["santal", "sandalo"],
    santal: ["sandalwood", "sandalo"],
    bergamot: ["calabrian bergamot"],
    vetiver: ["haitian vetiver"],
    ambroxan: ["amberwood", "amber-wood", "ambroxin"],
  };

  const expandedTerms = [];
  for (const t of (modeTerms.length ? modeTerms : terms)) {
    expandedTerms.push(t);
    if (synonymMap[t]) expandedTerms.push(...synonymMap[t]);
  }

  // de-dupe expanded terms
  const finalTerms = [...new Set(expandedTerms)].filter(Boolean);

  // ---------- FILTER ----------
  const filtered = DATA
    // checkbox filters still apply
    .filter((i) => (els.onlyOwned.checked ? !!i.owned : true))
    .filter((i) => (els.onlyDupes.checked ? !!i.isDupe : true))
    // smart mode filters
    .filter((i) => {
      if (isHouseOnly) return !!i.isHouseOriginal;

      if (mode === "dupes_of") {
        if (!i.isDupe) return false;
        const ref = normalize(i.inspiredBy ?? i.reference ?? i["Inspired By"] ?? i["Reference"] ?? "");
        if (!finalTerms.length) return true;
        return finalTerms.every((t) => ref.includes(t));
      }

      if (mode === "original") {
        if (i.isDupe) return false;
        const hay = buildHaystack(i);
        if (!finalTerms.length) return true;
        return matchesAllTerms(hay, finalTerms);
      }

      // default: search across everything
      const hay = buildHaystack(i);
      if (!finalTerms.length) return true;
      return matchesAllTerms(hay, finalTerms);
    })
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  // ---------- STATUS ----------
  let label = `${filtered.length} match(es)`;
  if (raw) label += ` for "${raw}"`;
  els.status.textContent = label;

  // highlight should use the user's original split terms (not the expanded synonyms)
  render(filtered, terms);
}

function setPrivateMode(on) {
  PRIVATE_MODE = on;
  els.privateHint.hidden = !on;
  els.privateLabel.textContent = on ? "Private On" : "Private";
  searchAndRender();
}

/* ---------- INIT ---------- */

async function init() {
  const res = await fetch("./fragrances.json", { cache: "no-store" });
  DATA = await res.json();
  searchAndRender();

  els.q.addEventListener("input", searchAndRender);
  els.onlyOwned.addEventListener("change", searchAndRender);
  els.onlyDupes.addEventListener("change", searchAndRender);
  els.clearBtn.onclick = () => {
    els.q.value = "";
    searchAndRender();
  };

  els.privateBtn.onclick = () => {
    if (PRIVATE_MODE) return setPrivateMode(false);
    const code = prompt("Enter Private Mode code:");
    if (code === PRIVATE_CODE) setPrivateMode(true);
  };
}

init();

