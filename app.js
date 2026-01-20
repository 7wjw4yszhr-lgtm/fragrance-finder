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

function matchesAllTerms(hay, terms) {
  return terms.every((t) => hay.includes(t));
}

/* ---------- DATA FLATTENERS ---------- */

function toText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") return Object.values(v).map(toText).filter(Boolean).join(", ");
  return String(v);
}

/* Search should catch ALL formats safely */
function buildHaystack(item) {
  const notesObj = item.notes && typeof item.notes === "object" && !Array.isArray(item.notes) ? item.notes : null;

  const topNotes =
    item.notesTop ??
    item["Top Notes"] ??
    item.topNotes ??
    item.top_notes ??
    notesObj?.top ??
    "";

  const heartNotes =
    item.notesHeart ??
    item["Heart Notes"] ??
    item.middleNotes ??
    item.middle_notes ??
    item.heartNotes ??
    notesObj?.heart ??
    notesObj?.middle ??
    "";

  const baseNotes =
    item.notesBase ??
    item["Base Notes"] ??
    item["Bottom Notes"] ??
    item.baseNotes ??
    item.base_notes ??
    notesObj?.base ??
    "";

  const familyText =
    item.family ??
    item["Scent Family"] ??
    item["Olfactive Family"] ??
    item.scentFamily ??
    item.olfactiveFamily ??
    "";

  const refText =
    item.inspiredBy ??
    item["Inspired By"] ??
    item.reference ??
    item["Reference"] ??
    "";

  const builtFrom =
    item.private?.builtFrom ??
    item["Built From"] ??
    item.builtFrom ??
    item.components ??
    item["Components"] ??
    "";

  const notesText = item.notesText ?? item["Notes"] ?? item["All Notes"] ?? "";

  return [
    item.id,
    item.name,
    item.brand,
    item.house,
    refText,
    familyText,
    item.gender,
    item.concentration,
    item.size,
    item["Size"],
    item["Size (ml)"],
    item.tags,
    item["Tags"],

    // Notes in all formats
    item.notes, // array OR object OR string
    topNotes,
    heartNotes,
    baseNotes,
    notesText,

    // Private fields searchable
    builtFrom
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
  const cardId = "c_" + (item.id ?? normalize(item.name ?? "").replace(/\s+/g, "_"));

  const familyText = toText(item.family ?? item["Olfactive Family"] ?? item["Scent Family"] ?? "");
  const genderText = toText(item.gender ?? "");
  const concentration = toText(item.concentration ?? item["Concentration"] ?? "");

  const reference = toText(
    item.inspiredBy ??
    item["Inspired By"] ??
    item.reference ??
    item["Reference"] ??
    ""
  );

  const notesObj = item.notes && typeof item.notes === "object" && !Array.isArray(item.notes) ? item.notes : null;

  const top = toText(item.notesTop ?? item["Top Notes"] ?? notesObj?.top ?? "");
  const heart = toText(item.notesHeart ?? item["Heart Notes"] ?? notesObj?.heart ?? notesObj?.middle ?? "");
  const base = toText(item.notesBase ?? item["Bottom Notes"] ?? item["Base Notes"] ?? notesObj?.base ?? "");
  const allNotes = toText(item.notesText ?? item["Notes"] ?? (Array.isArray(item.notes) ? item.notes : ""));

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
        '<div class="metaItem"><span class="metaLabel">Olfactive Family</span> ' + highlight(familyText || "—", terms) + "</div>" +
        (genderText ? '<div class="metaItem"><span class="metaLabel">Gender</span> ' + highlight(genderText, terms) + "</div>" : "") +
      "</div>" +

      '<button class="detailsBtn" type="button" data-target="' + cardId + '">Details</button>' +
      '<div class="details" id="' + cardId + '" hidden>' +

        '<div class="kv">' +
          "<div><b>Reference:</b> " + (reference ? highlight(reference, terms) : "—") + "</div>" +
          (concentration ? "<div><b>Concentration:</b> " + highlight(concentration, terms) + "</div>" : "") +
          (top ? "<div><b>Top:</b> " + highlight(top, terms) + "</div>" : "") +
          (heart ? "<div><b>Heart:</b> " + highlight(heart, terms) + "</div>" : "") +
          (base ? "<div><b>Base:</b> " + highlight(base, terms) + "</div>" : "") +
          ((!top && !heart && !base && allNotes) ? "<div><b>Notes:</b> " + highlight(allNotes, terms) + "</div>" : "") +
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

function setPrivateMode(on) {
  PRIVATE_MODE = !!on;
  els.privateHint.hidden = !PRIVATE_MODE;
  els.privateLabel.textContent = PRIVATE_MODE ? "Private On" : "Private";
  els.privateBtn.textContent = PRIVATE_MODE ? "🔓 " : "🔒 ";
  els.privateBtn.appendChild(els.privateLabel);
  searchAndRender();
}

/* ---------- SMART SEARCH ---------- */

function expandSynonyms(terms) {
  const map = {
    // Sandalwood cluster
    sandalwood: ["santal", "sandalo", "santalum"],
    santal: ["sandalwood", "sandalo", "santalum"],
    sandalo: ["sandalwood", "santal", "santalum"],
    santalum: ["sandalwood", "santal", "sandalo"],

    // Optional expansions you can grow later
    ambroxan: ["amberwood", "amber-wood"],
    amberwood: ["ambroxan"],
  };

  const out = [];
  for (const t of terms) {
    out.push(t);
    if (map[t]) out.push(...map[t]);
  }
  return [...new Set(out)].filter(Boolean);
}

function searchAndRender() {
  const raw = els.q.value.trim();
  const q = normalize(raw);

  // Smart modes
  let mode = "all"; // all | dupes_of | original | house_only
  let modeQuery = q;

  if (q === "house original" || q === "house:original" || q === "house originals" || q === "house:originals") {
    mode = "house_only";
    modeQuery = "";
  } else if (q.startsWith("dupes of ")) {
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
  const userTerms = q.split(/\s+/).filter(Boolean);

  const searchTerms = expandSynonyms(modeTerms.length ? modeTerms : userTerms);

  const filtered = DATA
    .filter((i) => (els.onlyOwned.checked ? !!i.owned : true))
    .filter((i) => (els.onlyDupes.checked ? !!i.isDupe : true))
    .filter((i) => {
      if (mode === "house_only") return !!i.isHouseOriginal;

      if (!searchTerms.length) return true;

      if (mode === "dupes_of") {
        if (!i.isDupe) return false;
        const ref = normalize(toText(i.inspiredBy ?? i.reference ?? i["Inspired By"] ?? i["Reference"] ?? ""));
        return searchTerms.every((t) => ref.includes(t));
      }

      if (mode === "original") {
        if (i.isDupe) return false;
        return matchesAllTerms(buildHaystack(i), searchTerms);
      }

      return matchesAllTerms(buildHaystack(i), searchTerms);
    })
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  els.status.textContent = `${filtered.length} match(es)` + (raw ? ` for "${raw}"` : "");
  // highlight should be based on what they typed, not synonym expansions
  render(filtered, userTerms);
}

/* ---------- INIT ---------- */

async function init() {
  try {
    const res = await fetch("./fragrances.json", { cache: "no-store" });
    DATA = await res.json();
    els.status.textContent = DATA.length + " fragrances loaded.";
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

  // Private Mode toggle
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
