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

// Make sure search finds everything (including expandable notes + private components)
function buildHaystack(item) {
  // Helper: turn anything into searchable text
  const toText = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
    if (typeof v === "object") {
      // Flatten object values (handles nested note pyramids)
      return Object.values(v).map(toText).filter(Boolean).join(", ");
    }
    return String(v);
  };

  // Notes in many possible formats
  const notesArray = Array.isArray(item.notes) ? item.notes : [];
  const notesTopA = item.notesTop ?? item["Top Notes"] ?? item.topNotes ?? item.top_notes ?? "";
  const notesHeartA = item.notesHeart ?? item["Heart Notes"] ?? item.heartNotes ?? item.middleNotes ?? item.middle_notes ?? "";
  const notesBaseA = item.notesBase ?? item["Base Notes"] ?? item["Bottom Notes"] ?? item.baseNotes ?? item.base_notes ?? "";

  // Note pyramid object formats: notes: {top, heart/middle, base}
  const notesObj = item.notes && typeof item.notes === "object" && !Array.isArray(item.notes) ? item.notes : null;
  const notesTopB = notesObj?.top ?? "";
  const notesHeartB = notesObj?.heart ?? notesObj?.middle ?? "";
  const notesBaseB = notesObj?.base ?? "";

  // Some people store everything in one field
  const notesText = item.notesText ?? item["Notes"] ?? item["All Notes"] ?? "";

  // Family/tags can be arrays or strings
  const familyText =
    item.family ?? item["Scent Family"] ?? item["Olfactive Family"] ?? item.scentFamily ?? item.olfactiveFamily ?? "";

  const tagsText = item.tags ?? item["Tags"] ?? "";

  // Private components (searchable even when not shown)
  const builtFrom =
    item.private?.builtFrom ?? item["Built From"] ?? item.builtFrom ?? item.components ?? item["Components"] ?? "";

  // Include common identity fields too
  return [
    item.id,
    item.name,
    item.brand,
    item.house,
    item.inspiredBy,
    item["Inspired By"],
    item.reference,
    item["Reference"],
    item.gender,
    item.concentration,
    item.size,
    item["Size"],
    item["Size (ml)"],
    familyText,
    tagsText,

    // Notes in all formats
    notesArray,
    notesTopA,
    notesHeartA,
    notesBaseA,
    notesTopB,
    notesHeartB,
    notesBaseB,
    notesText,

    // Private composition fields
    builtFrom,
  ]
    .map(toText)
    .filter(Boolean)
    .map(normalize)
    .join(" | ");
}


function cardHtml(item, terms) {
  const badge = badgeText(item);
  const owned = item.owned ? "Owned" : "Not owned";
  const cardId = "c_" + (item.id ?? normalize(item.name ?? "").replace(/\s+/g, "_"));

  // Helper: show text no matter how it is stored
  const toText = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
    if (typeof v === "object") return Object.values(v).map(toText).filter(Boolean).join(", ");
    return String(v);
  };

  // Family / gender
  const familyText = toText(item.family ?? item["Scent Family"] ?? item["Olfactive Family"] ?? item.scentFamily ?? item.olfactiveFamily ?? "");
  const genderText = toText(item.gender ?? "");

  // Concentration (many names)
  const concentration = toText(item.concentration ?? item["Concentration"] ?? "");

  // Reference / inspired by (many names)
  const reference = toText(item.inspiredBy ?? item["Inspired By"] ?? item.reference ?? item["Reference"] ?? "");

  // Notes (many possible formats)
  const notesArray = Array.isArray(item.notes) ? item.notes : [];
  const notesObj = item.notes && typeof item.notes === "object" && !Array.isArray(item.notes) ? item.notes : null;

  const topNotes = toText(
    item.notesTop ??
    item["Top Notes"] ??
    item.topNotes ??
    item.top_notes ??
    notesObj?.top ??
    ""
  );

  const heartNotes = toText(
    item.notesHeart ??
    item["Heart Notes"] ??
    item.middleNotes ??
    item.middle_notes ??
    item.heartNotes ??
    notesObj?.heart ??
    notesObj?.middle ??
    ""
  );

  const baseNotes = toText(
    item.notesBase ??
    item["Base Notes"] ??
    item["Bottom Notes"] ??
    item.baseNotes ??
    item.base_notes ??
    notesObj?.base ??
    ""
  );

  // If notes are only in a single list, show them as "All Notes"
  const allNotesText = toText(item.notesText ?? item["Notes"] ?? item["All Notes"] ?? (notesArray.length ? notesArray : ""));

  // Private block (only shows when unlocked)
  let privateHtml = "";
  if (PRIVATE_MODE && item.private && item.private.builtFrom) {
    const builtFrom = toText(item.private.builtFrom);
    privateHtml =
      '<div class="kv" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.10); padding-top:10px;">' +
      "<div><b>Private:</b> Built from " + escapeHtml(builtFrom) + "</div>" +
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

          // Show pyramid if we have it
          (topNotes ? "<div><b>Top:</b> " + highlight(topNotes, terms) + "</div>" : "") +
          (heartNotes ? "<div><b>Heart:</b> " + highlight(heartNotes, terms) + "</div>" : "") +
          (baseNotes ? "<div><b>Base:</b> " + highlight(baseNotes, terms) + "</div>" : "") +

          // Fallback if notes are stored as one field/list
          ((!topNotes && !heartNotes && !baseNotes && allNotesText) ? "<div><b>Notes:</b> " + highlight(allNotesText, terms) + "</div>" : "") +
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

  // Wire up Details toggle buttons
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

function searchAndRender() {
  const raw = els.q.value;
  const q = normalize(raw);
  const terms = q.split(/\s+/).filter(Boolean);

  const onlyOwned = els.onlyOwned.checked;
  const onlyDupes = els.onlyDupes.checked;

  const filtered = DATA
    .filter((item) => (onlyOwned ? !!item.owned : true))
    .filter((item) => (onlyDupes ? !!item.isDupe : true))
    .filter((item) => (terms.length ? matchesAllTerms(buildHaystack(item), terms) : true))
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  els.status.textContent = filtered.length + ' match(es)' + (q ? ' for "' + raw + '"' : "") + ".";
  render(filtered, terms);
}

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


