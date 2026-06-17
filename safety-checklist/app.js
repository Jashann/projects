/* Workplace Safety Inspection Checklist
   Static, client-side only. State persists to localStorage (no backend, no keys).
   Author: Jashanjot Gill */
(function () {
  "use strict";

  var STORAGE_KEY = "safety-checklist-v1";

  // Inspection template: grouped checklist items.
  var TEMPLATE = [
    { group: "Site & Access", items: [
      "Walkways and exits are clear and unobstructed",
      "Adequate lighting in all work areas",
      "Floor surfaces free of trip and slip hazards",
      "Emergency exits clearly marked and accessible"
    ]},
    { group: "PPE & Equipment", items: [
      "Required PPE available and in good condition",
      "Workers observed wearing appropriate PPE",
      "Tools and equipment inspected and serviceable",
      "Machine guarding in place and functional"
    ]},
    { group: "Hazardous Materials", items: [
      "Chemicals stored and labelled correctly",
      "Safety Data Sheets (SDS) accessible on site",
      "Spill kits stocked and within reach"
    ]},
    { group: "Emergency Preparedness", items: [
      "Fire extinguishers charged and inspected",
      "First aid kit stocked and accessible",
      "Emergency contact info posted and current"
    ]}
  ];

  var groupsEl = document.getElementById("groups");
  var state = load();

  // ---- Render ----
  TEMPLATE.forEach(function (g, gi) {
    var section = document.createElement("section");
    section.className = "group";
    var h = document.createElement("h2");
    h.innerHTML = '<span class="dot"></span>' + g.group;
    section.appendChild(h);

    g.items.forEach(function (q, ii) {
      var id = gi + "-" + ii;
      var row = document.createElement("div");
      row.className = "item";
      row.dataset.id = id;

      var label = document.createElement("div");
      label.className = "q";
      label.textContent = q;
      row.appendChild(label);

      var choices = document.createElement("div");
      choices.className = "choices";
      ["pass", "fail", "na"].forEach(function (v) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "choice";
        b.dataset.v = v;
        b.textContent = v === "na" ? "N/A" : v.charAt(0).toUpperCase() + v.slice(1);
        b.setAttribute("aria-pressed", state.answers[id] === v ? "true" : "false");
        b.addEventListener("click", function () { setAnswer(id, v); });
        choices.appendChild(b);
      });
      row.appendChild(choices);
      applyRowFlag(row, id);
      section.appendChild(row);
    });
    groupsEl.appendChild(section);
  });

  // Restore meta fields
  ["site", "inspector", "date"].forEach(function (k) {
    var el = document.getElementById(k);
    if (state.meta[k]) el.value = state.meta[k];
    el.addEventListener("input", function () { state.meta[k] = el.value; save(); });
  });

  // ---- Logic ----
  function setAnswer(id, v) {
    state.answers[id] = state.answers[id] === v ? null : v; // toggle off if same
    var row = groupsEl.querySelector('.item[data-id="' + id + '"]');
    row.querySelectorAll(".choice").forEach(function (b) {
      b.setAttribute("aria-pressed", state.answers[id] === b.dataset.v ? "true" : "false");
    });
    applyRowFlag(row, id);
    save();
    refresh();
  }

  function applyRowFlag(row, id) {
    if (state.answers[id] === "fail") row.classList.add("flagged");
    else row.classList.remove("flagged");
  }

  function counts() {
    var total = 0, c = { pass: 0, fail: 0, na: 0 };
    TEMPLATE.forEach(function (g, gi) {
      g.items.forEach(function (_, ii) {
        total++;
        var a = state.answers[gi + "-" + ii];
        if (a && c[a] != null) c[a]++;
      });
    });
    var answered = c.pass + c.fail + c.na;
    return { total: total, answered: answered, open: total - answered, pass: c.pass, fail: c.fail, na: c.na };
  }

  function refresh() {
    var c = counts();
    var pct = c.total ? Math.round((c.answered / c.total) * 100) : 0;
    document.getElementById("bar").style.width = pct + "%";
    document.getElementById("pct").textContent = pct + "%";
    document.getElementById("cPass").textContent = c.pass;
    document.getElementById("cFail").textContent = c.fail;
    document.getElementById("cNa").textContent = c.na;
    document.getElementById("cOpen").textContent = c.open;
  }

  // ---- Persistence ----
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { meta: {}, answers: {} };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---- Export ----
  function exportCsv() {
    var rows = [["Group", "Item", "Result"]];
    TEMPLATE.forEach(function (g, gi) {
      g.items.forEach(function (q, ii) {
        var a = state.answers[gi + "-" + ii] || "unanswered";
        rows.push([g.group, q, a]);
      });
    });
    var meta = "Site,," + csv(state.meta.site || "") + "\nInspector,," + csv(state.meta.inspector || "") +
               "\nDate,," + csv(state.meta.date || "") + "\n\n";
    var body = rows.map(function (r) { return r.map(csv).join(","); }).join("\n");
    var blob = new Blob([meta + body], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "safety-inspection-" + (state.meta.date || "report") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function csv(s) {
    s = String(s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  document.getElementById("export").addEventListener("click", exportCsv);
  document.getElementById("print").addEventListener("click", function () { window.print(); });
  document.getElementById("reset").addEventListener("click", function () {
    if (!confirm("Clear all answers and details on this device?")) return;
    state = { meta: {}, answers: {} };
    save();
    location.reload();
  });

  refresh();
})();
