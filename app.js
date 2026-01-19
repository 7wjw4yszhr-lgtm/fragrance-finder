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

function buildHaystack(item) {
  const notes = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
  const tags = Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags ?? "");
  return [
    item.name,
    item.brand,
    item.inspiredBy,
    item.family,
    notes,
    tags
  ]
    .filter(Boolean)
    .map(normalize)
    .join(" | ");
}

function matchesAllTerms(hay, terms) {
  return terms.every((t) => hay.includes(t));
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

function cardHtml(item, terms) {
  const notesText = Array.isArray(item.notes) ? item.notes.join(", ") : (item.notes ?? "");
  const badge = item.isDupe ? "Dupe" : "Original";
  const owned = item.owned ? "Owned" : "Not owned";

  let privateHtml = "";
  if (PRIVATE_MODE && item.private && item.private.builtFrom) {
    const builtFrom = Array.isArray(item.private.builtFrom)
      ? item.private.builtFrom.join(", ")
      : String(item.private.builtFrom);

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
      '<div class="kv">' +
        "<div><b>Brand:</b> " + highlight(item.brand ?? "", terms) + "</div>" +
        "<div><b>Inspired by:</b> " + (item.inspiredBy ? highlight(item.inspiredBy, terms) : "—") + "</div>" +
        "<div><b>Family:</b> " + (item.family ? highlight(item.family, terms) : "—") + "</div>" +
        "<div><b>Notes:</b> " + (notesText ? highlight(notesText, terms) : "—") + "</div>" +
      "</div>" +
      privateHtml +
    "</article>"
  );
}

function render(list, terms) {
  if (list.length === 0) {
    els.results.innerHTML = '<div class="card"><div class="meta">No matches.</div></div>';
    return;
  }
  els.results.innerHTML = list.map((item) => cardHtml(item, terms)).join("");
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
