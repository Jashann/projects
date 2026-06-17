/* Expense Management Dashboard
   Multi-view corporate-card spend app: Dashboard, Transactions, Categories,
   Reports, Settings. Auto-categorization, budget + approval threshold, search/
   filter. Client-side only; state persists to localStorage. No backend, no keys.
   Author: Jashanjot Gill */
(function () {
  "use strict";

  var TKEY = "expense-dashboard-v1";
  var CKEY = "expense-dashboard-cfg-v1";

  var ICONS = {
    wallet: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 12h.01"/><path d="M3 9h13a2 2 0 0 1 2 2"/></svg>',
    budget: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 22 12a10 10 0 0 0-10-10z"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    tag: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v5l9 9 7-7-9-9H3z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>',
    avg: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>',
    max: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>',
    people: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>'
  };
  var ARROWS = {
    pos: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17M7 17h8M7 17V9"/></svg>'
  };

  var RULES = [
    { cat: "Travel",    kw: ["uber", "lyft", "air canada", "westjet", "hotel", "airbnb", "rail", "taxi"] },
    { cat: "Software",  kw: ["aws", "google", "github", "figma", "notion", "slack", "atlassian", "openai", "azure", "vercel"] },
    { cat: "Meals",     kw: ["starbucks", "tim", "restaurant", "cafe", "coffee", "doordash", "uber eats", "pizza", "mcdonald"] },
    { cat: "Office",    kw: ["staples", "amazon", "best buy", "ikea", "office", "supplies"] },
    { cat: "Marketing", kw: ["meta", "facebook", "linkedin", "ads", "mailchimp", "hubspot"] },
    { cat: "Utilities", kw: ["bell", "rogers", "telus", "hydro", "internet", "phone"] }
  ];

  var SEED = [
    { date: "2026-06-14", merchant: "AWS", cardholder: "J. Gill", amount: 842.10 },
    { date: "2026-06-13", merchant: "Air Canada", cardholder: "M. Patel", amount: 612.45 },
    { date: "2026-06-12", merchant: "Staples", cardholder: "J. Gill", amount: 138.22 },
    { date: "2026-06-12", merchant: "Starbucks", cardholder: "R. Chen", amount: 18.75 },
    { date: "2026-06-11", merchant: "Figma", cardholder: "M. Patel", amount: 144.00 },
    { date: "2026-06-10", merchant: "Uber", cardholder: "R. Chen", amount: 31.90 },
    { date: "2026-06-09", merchant: "LinkedIn Ads", cardholder: "M. Patel", amount: 480.00 },
    { date: "2026-06-08", merchant: "Bell", cardholder: "J. Gill", amount: 96.05 }
  ];

  var TITLES = {
    dashboard: ["Spend overview", "Corporate card activity · June 2026"],
    transactions: ["Transactions", "Every corporate card transaction"],
    categories: ["Categories", "Spend grouped by category"],
    reports: ["Reports", "Summary metrics and breakdowns"],
    settings: ["Settings", "Budget and approval preferences"]
  };

  var txns = loadTxns();
  var cfg = loadCfg();

  var $ = function (id) { return document.getElementById(id); };

  // ---- nav / routing ----
  var navItems = Array.prototype.slice.call(document.querySelectorAll(".nav-item"));
  navItems.forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });

  function setView(name) {
    navItems.forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
    ["dashboard", "transactions", "categories", "reports", "settings"].forEach(function (v) {
      $("view-" + v).hidden = (v !== name);
    });
    $("pageTitle").textContent = TITLES[name][0];
    $("pageSub").textContent = TITLES[name][1];
    window.scrollTo(0, 0);
  }

  // ---- events ----
  $("add").addEventListener("click", add);
  $("search").addEventListener("input", renderTransactions);
  $("catFilter").addEventListener("change", renderTransactions);
  $("saveSettings").addEventListener("click", saveSettingsFromForm);
  $("resetData").addEventListener("click", function () {
    if (!confirm("Clear all transactions on this device?")) return;
    txns = SEED.slice(); saveTxns(); renderAll();
  });

  // ---- helpers ----
  function categorize(m) {
    m = m.toLowerCase();
    for (var i = 0; i < RULES.length; i++)
      for (var j = 0; j < RULES[i].kw.length; j++)
        if (m.indexOf(RULES[i].kw[j]) !== -1) return RULES[i].cat;
    return "Other";
  }
  function statusFor(a) { return a > cfg.threshold ? "pending" : "ok"; }
  function money(n) { return "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return "$" + Math.round(n).toLocaleString("en-CA"); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]; }); }
  function sumBy(keyFn) { var o = {}; txns.forEach(function (t) { var k = keyFn(t); o[k] = (o[k] || 0) + t.amount; }); return o; }

  function add() {
    var merchant = ($("merchant").value || "").trim();
    var amount = parseFloat($("amount").value);
    var cardholder = ($("cardholder").value || "").trim() || "Unassigned";
    if (!merchant || !(amount > 0)) { $("merchant").focus(); return; }
    txns.unshift({ date: today(), merchant: merchant, cardholder: cardholder, amount: Math.round(amount * 100) / 100 });
    saveTxns(); $("merchant").value = ""; $("amount").value = ""; $("cardholder").value = "";
    renderAll();
  }

  function kpi(icon, label, val, tone, pillText, subLabel) {
    var pill = "";
    if (pillText || subLabel) {
      pill = '<div class="pill ' + tone + '">' + (ARROWS[tone] || "") +
        (pillText ? "<span>" + pillText + "</span>" : "") +
        (subLabel ? '<span class="lbl">' + subLabel + "</span>" : "") + "</div>";
    }
    return '<div class="kpi"><span class="kpi-ic">' + ICONS[icon] + "</span>" +
      '<div class="label">' + label + "</div><div class=\"val\">" + val + "</div>" + pill + "</div>";
  }

  function barsHTML(map) {
    var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
    var max = Math.max.apply(null, keys.map(function (k) { return map[k]; }).concat([1]));
    if (!keys.length) return '<p class="empty">No data yet.</p>';
    return keys.map(function (k) {
      var pct = Math.round((map[k] / max) * 100);
      return '<div class="barrow"><div class="top"><span class="name">' + esc(k) + '</span><span class="amt">' +
        money(map[k]) + '</span></div><div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>';
    }).join("");
  }

  // ---- renderers ----
  function renderAll() {
    var nc = $("navCount"); if (nc) nc.textContent = txns.length;
    renderDashboard();
    renderTransactions();
    renderCategories();
    renderReports();
    renderSettings();
  }

  function renderDashboard() {
    var total = txns.reduce(function (s, t) { return s + t.amount; }, 0);
    var pending = txns.filter(function (t) { return statusFor(t.amount) === "pending"; }).length;
    var byCat = sumBy(function (t) { return categorize(t.merchant); });
    var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0] || "—";
    var pctUsed = cfg.budget ? Math.round((total / cfg.budget) * 100) : 0;

    $("cards").innerHTML = [
      kpi("wallet", "Total spent", money(total), "flat", "", pctUsed + "% of " + money0(cfg.budget)),
      kpi("budget", "Budget remaining", money(Math.max(0, cfg.budget - total)), pctUsed < 90 ? "pos" : "warn", pctUsed < 90 ? "On track" : "Near limit", ""),
      kpi("receipt", "Transactions", String(txns.length), pending ? "warn" : "flat", pending + " pending", ""),
      kpi("tag", "Top category", top, "flat", "", byCat[top] ? money(byCat[top]) : "")
    ].join("");

    $("dashBars").innerHTML = barsHTML(byCat);

    var recent = txns.slice(0, 6);
    $("dashRecent").innerHTML = recent.length ? recent.map(function (t) {
      var st = statusFor(t.amount);
      return '<div class="mini"><div class="mini-l"><div class="mini-merch">' + esc(t.merchant) +
        '</div><div class="mini-meta">' + esc(t.cardholder) + " · " + categorize(t.merchant) + '</div></div>' +
        '<div class="mini-r"><div class="mini-amt">' + money(t.amount) + '</div>' +
        '<div class="status ' + st + '">' + (st === "ok" ? "Approved" : "Pending") + "</div></div></div>";
    }).join("") : '<p class="empty">No transactions yet.</p>';
  }

  function renderTransactions() {
    var byCat = sumBy(function (t) { return categorize(t.merchant); });
    var cats = Object.keys(byCat).sort();
    var cf = $("catFilter");
    var current = cf.value;
    cf.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
    if (cats.indexOf(current) !== -1) cf.value = current;

    var q = ($("search").value || "").toLowerCase();
    var sel = cf.value;
    var list = txns.filter(function (t) {
      if (sel && categorize(t.merchant) !== sel) return false;
      if (q && t.merchant.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    $("rows").innerHTML = list.length ? list.map(function (t) {
      var c = categorize(t.merchant), st = statusFor(t.amount);
      return "<tr><td>" + t.date + '</td><td class="merchant">' + esc(t.merchant) + "</td><td>" + esc(t.cardholder) +
        '</td><td><span class="cat">' + c + '</span></td><td class="num">' + money(t.amount) +
        '</td><td><span class="status ' + st + '">' + (st === "ok" ? "Approved" : "Pending") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="6" class="empty" style="padding:18px 14px">No matching transactions.</td></tr>';
  }

  function renderCategories() {
    var byCat = sumBy(function (t) { return categorize(t.merchant); });
    var countByCat = {};
    txns.forEach(function (t) { var c = categorize(t.merchant); countByCat[c] = (countByCat[c] || 0) + 1; });
    var total = txns.reduce(function (s, t) { return s + t.amount; }, 0) || 1;
    $("catBars").innerHTML = barsHTML(byCat);
    var keys = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    $("catTable").innerHTML = keys.length ? keys.map(function (c) {
      return "<tr><td class=\"merchant\">" + c + '</td><td class="num">' + countByCat[c] + '</td><td class="num">' +
        money(byCat[c]) + '</td><td class="num">' + Math.round((byCat[c] / total) * 100) + "%</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty" style="padding:18px 14px">No data yet.</td></tr>';
  }

  function renderReports() {
    var amounts = txns.map(function (t) { return t.amount; });
    var total = amounts.reduce(function (s, a) { return s + a; }, 0);
    var avg = amounts.length ? total / amounts.length : 0;
    var max = amounts.length ? Math.max.apply(null, amounts) : 0;
    var holders = {};
    txns.forEach(function (t) { holders[t.cardholder] = true; });
    var byHolder = sumBy(function (t) { return t.cardholder; });
    $("reportCards").innerHTML = [
      kpi("wallet", "Total spend", money(total), "flat", "", "this period"),
      kpi("avg", "Avg transaction", money(avg), "flat", "", "per expense"),
      kpi("max", "Largest expense", money(max), "flat", "", "single charge"),
      kpi("people", "Cardholders", String(Object.keys(holders).length), "flat", "", "active")
    ].join("");
    $("cardholderBars").innerHTML = barsHTML(byHolder);
  }

  function renderSettings() {
    $("setBudget").value = cfg.budget;
    $("setThreshold").value = cfg.threshold;
  }
  function saveSettingsFromForm() {
    var b = parseFloat($("setBudget").value);
    var t = parseFloat($("setThreshold").value);
    if (b >= 0) cfg.budget = Math.round(b);
    if (t >= 0) cfg.threshold = Math.round(t);
    saveCfg(); renderAll();
    var m = $("savedMsg"); m.hidden = false; setTimeout(function () { m.hidden = true; }, 1600);
  }

  // ---- persistence ----
  function loadTxns() { try { var r = localStorage.getItem(TKEY); if (r) return JSON.parse(r); } catch (e) {} return SEED.slice(); }
  function saveTxns() { try { localStorage.setItem(TKEY, JSON.stringify(txns)); } catch (e) {} }
  function loadCfg() { try { var r = localStorage.getItem(CKEY); if (r) return JSON.parse(r); } catch (e) {} return { budget: 10000, threshold: 500 }; }
  function saveCfg() { try { localStorage.setItem(CKEY, JSON.stringify(cfg)); } catch (e) {} }

  renderAll();
  setView("dashboard");
})();
