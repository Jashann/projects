/* Insurance Verification Extractor
   Client-side only. Parses messy free-text dental insurance verification notes into
   a clean, structured record using field heuristics (regex + keyword matching).
   No backend, no API keys, no data leaves the browser.
   Author: Jashanjot Gill */
(function () {
  "use strict";

  var SAMPLES = [
    // Sample A — typical messy phone-call note
    "called sunlife 9:42am spoke w/ rep Maria ref# SL-88231\n" +
    "pt: Jordan A. Mehta  dob 04/17/1990\n" +
    "subscriber same. policy no. 553219887 grp #  GA4471\n" +
    "plan: PPO. annual max $1,500/yr, used 320 so far\n" +
    "deductible 50 (met? no)\n" +
    "basic 80%, major 50%, preventive covered 100%\n" +
    "waiting period none. coverage effective 2021-01-01\n" +
    "fluoride to age 16 only. frequency 2/year cleanings",

    // Sample B — pasted from a different carrier portal export
    "Carrier: Canada Life  |  Member: O'Brien, Casey\n" +
    "DOB: 1985-11-02   Certificate #: 7741209-02   Division: 0091\n" +
    "Coverage start 03/15/2019.  Plan Type = Indemnity\n" +
    "Maximum (calendar year): $2,000   Remaining: $1,140\n" +
    "Deductible $25 individual, satisfied YES\n" +
    "Preventive 100% | Basic Services 90% | Major 60% | Ortho 50% lifetime max $1500\n" +
    "Recall exam every 9 months"
  ];

  var raw = document.getElementById("raw");
  var result = document.getElementById("result");

  document.querySelectorAll(".chip[data-sample]").forEach(function (b) {
    b.addEventListener("click", function () {
      var s = b.dataset.sample;
      if (s === "clear") { raw.value = ""; result.innerHTML = '<p class="empty">Cleared.</p>'; return; }
      raw.value = SAMPLES[+s] || "";
    });
  });

  document.getElementById("extract").addEventListener("click", run);
  document.getElementById("copy").addEventListener("click", function () { copy(JSON.stringify(lastRecord || {}, null, 2)); });
  document.getElementById("csv").addEventListener("click", exportCsv);

  var lastRecord = null;

  function run() {
    var t = raw.value || "";
    if (!t.trim()) { result.innerHTML = '<p class="empty">Paste some notes or load a sample first.</p>'; return; }

    var rec = {
      patientName: name(t),
      dateOfBirth: date(t, /\b(?:dob|date of birth)\b[:\s]*([0-9]{1,4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,4})/i),
      carrier: carrier(t),
      policyNumber: grab(t, /\b(?:policy(?:\s*no\.?|\s*#)?|certificate\s*#|cert(?:ificate)?\s*no\.?)\b[:\s]*([A-Z0-9\-]{5,})/i),
      groupNumber: grab(t, /\b(?:grp|group|division|div)\b\s*#?[:\s]*([A-Z0-9\-]{2,})/i),
      planType: planType(t),
      annualMaximum: money(t, /\b(?:annual max|maximum)[^$\d]*\$?\s*([\d,]+)/i),
      maximumRemaining: money(t, /\b(?:remaining|left)[^$\d]*\$?\s*([\d,]+)/i),
      deductible: money(t, /\bdeductible\b[^$\d]*\$?\s*([\d,]+)/i),
      deductibleMet: yesNo(t),
      preventiveCoverage: pct(t, /\b(?:preventive|fluoride|recall|cleanings?)\b[^%\d]*([\d]{1,3})\s*%/i) || pct(t, /\bcovered\s*([\d]{1,3})\s*%/i),
      basicCoverage: pct(t, /\bbasic\b[^%\d]*([\d]{1,3})\s*%/i),
      majorCoverage: pct(t, /\bmajor\b[^%\d]*([\d]{1,3})\s*%/i),
      coverageEffective: date(t, /\b(?:effective|coverage (?:start|effective)|start)\b[:\s]*([0-9]{1,4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,4})/i)
    };

    lastRecord = rec;
    render(rec);
  }

  // ---- field heuristics ----
  function grab(t, re) { var m = t.match(re); return m ? m[1].trim() : null; }
  function money(t, re) { var v = grab(t, re); return v ? "$" + v.replace(/,/g, "") : null; }
  function pct(t, re) { var v = grab(t, re); return v ? v + "%" : null; }
  function date(t, re) { return grab(t, re); }

  function name(t) {
    var m = t.match(/\b(?:pt|patient|member|name)\b[:\s]*([A-Z][A-Za-z'’.]+(?:\s+[A-Z][A-Za-z'’.]+){0,2}|[A-Z][A-Za-z'’.]+,\s*[A-Z][A-Za-z'’.]+)/);
    return m ? m[1].replace(/\s+/g, " ").trim() : null;
  }
  function carrier(t) {
    var carriers = ["Sun Life", "Sunlife", "Canada Life", "Manulife", "Great-West", "Green Shield", "Desjardins", "Blue Cross", "Cigna", "Equitable"];
    for (var i = 0; i < carriers.length; i++) {
      var re = new RegExp(carriers[i].replace(/[-\s]/g, "[-\\s]?"), "i");
      if (re.test(t)) return carriers[i] === "Sunlife" ? "Sun Life" : carriers[i];
    }
    var m = t.match(/\bcarrier\b[:\s]*([A-Z][A-Za-z\-\s]{2,20})/i);
    return m ? m[1].trim() : null;
  }
  function planType(t) {
    var m = t.match(/\b(PPO|HMO|Indemnity|DHMO|Fee[-\s]?for[-\s]?service)\b/i);
    return m ? m[1].toUpperCase().replace(/FEE.*/i, "Fee-for-service") : null;
  }
  function yesNo(t) {
    var m = t.match(/\b(?:deductible|met|satisfied)\b[^.\n]*\b(yes|no)\b/i);
    if (m) return /yes/i.test(m[1]) ? "Yes" : "No";
    if (/met\?\s*no/i.test(t)) return "No";
    return null;
  }

  // ---- render ----
  var GROUPS = [
    { label: "Patient", keys: [["patientName", "Name"], ["dateOfBirth", "Date of Birth"]] },
    { label: "Plan", keys: [["carrier", "Carrier"], ["policyNumber", "Policy / Cert #"], ["groupNumber", "Group / Division"], ["planType", "Plan Type"], ["coverageEffective", "Effective"]] },
    { label: "Financials", keys: [["annualMaximum", "Annual Maximum"], ["maximumRemaining", "Remaining"], ["deductible", "Deductible"], ["deductibleMet", "Deductible Met"]] },
    { label: "Coverage", keys: [["preventiveCoverage", "Preventive"], ["basicCoverage", "Basic"], ["majorCoverage", "Major"]] }
  ];

  function render(rec) {
    var total = 0, found = 0, html = "";
    GROUPS.forEach(function (g) {
      html += '<div class="section-label">' + g.label + "</div>";
      g.keys.forEach(function (pair) {
        total++;
        var val = rec[pair[0]];
        if (val) found++;
        html += '<div class="row"><span class="k">' + pair[1] + '</span>' +
          '<span class="v' + (val ? "" : " missing") + '">' + (val || "not found") + "</span></div>";
      });
    });
    var pctFound = Math.round((found / total) * 100);
    var score = '<div class="score"><span class="lbl">' + found + "/" + total + " fields</span>" +
      '<div class="bar"><span style="width:' + pctFound + '%"></span></div>' +
      '<span class="lbl">' + pctFound + "%</span></div>";
    result.innerHTML = score + html;
  }

  // ---- export ----
  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    var btn = document.getElementById("copy");
    var old = btn.textContent; btn.textContent = "Copied ✓";
    setTimeout(function () { btn.textContent = old; }, 1200);
  }
  function exportCsv() {
    if (!lastRecord) return;
    var rows = [["field", "value"]];
    Object.keys(lastRecord).forEach(function (k) { rows.push([k, lastRecord[k] || ""]); });
    var csv = rows.map(function (r) { return r.map(function (s) {
      s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(","); }).join("\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    var a = document.createElement("a"); a.href = url; a.download = "verification.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // preload Sample A
  raw.value = SAMPLES[0];
})();
