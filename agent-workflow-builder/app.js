/* Agent Workflow Builder
   Compose an AI automation from steps, then run a simulated execution engine that
   produces a live, timestamped trace (observability) with per-step status.
   Fully client-side: no backend, no API keys. The "run" is a deterministic
   simulation of how an agent/automation engine would execute and log a workflow.
   Author: Jashanjot Gill */
(function () {
  "use strict";

  // Step type catalogue
  var S = function (p) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; };
  var TYPES = {
    trigger:  { name: "Trigger",        color: "#6d5cf0", icon: S('<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>'),            desc: "Starts the workflow" },
    context:  { name: "Gather Context", color: "#2f8fd0", icon: S('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'), desc: "Fetch data the agent needs" },
    llm:      { name: "LLM Reasoning",  color: "#8a4bd6", icon: S('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'), desc: "Model decides what to do" },
    tool:     { name: "Tool Call",      color: "#1f9d62", icon: S('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z"/>'), desc: "Call an external system" },
    condition:{ name: "Condition",      color: "#c98a1e", icon: S('<path d="M6 3v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9c0 6-12 3-12 6"/>'), desc: "Branch on a result" },
    action:   { name: "Action",         color: "#dc2626", icon: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),                       desc: "Take a final action" }
  };

  var SAMPLE = [
    { type: "trigger",  label: "New support email received" },
    { type: "context",  label: "Load customer + order history" },
    { type: "llm",      label: "Classify intent & urgency" },
    { type: "condition",label: "Refund request?" },
    { type: "tool",     label: "Create refund in billing system" },
    { type: "action",   label: "Send reply + log resolution" }
  ];

  var steps = [];
  var running = false;

  var paletteEl = document.getElementById("palette");
  var stepsEl = document.getElementById("steps");
  var logEl = document.getElementById("log");
  var statusEl = document.getElementById("status");
  var emptyHint = document.getElementById("emptyHint");

  // Build palette
  Object.keys(TYPES).forEach(function (key) {
    var t = TYPES[key];
    var b = document.createElement("button");
    b.className = "ptype";
    b.type = "button";
    b.innerHTML = '<span class="ic" style="background:' + t.color + '">' + t.icon + "</span>" + t.name;
    b.addEventListener("click", function () { addStep(key); });
    paletteEl.appendChild(b);
  });

  document.getElementById("sample").addEventListener("click", function () {
    steps = SAMPLE.map(function (s) { return { type: s.type, label: s.label }; });
    render();
  });
  document.getElementById("clear").addEventListener("click", function () { steps = []; render(); });
  document.getElementById("run").addEventListener("click", run);

  function addStep(type) {
    steps.push({ type: type, label: TYPES[type].name });
    render();
  }
  function removeStep(i) { steps.splice(i, 1); render(); }
  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= steps.length) return;
    var tmp = steps[i]; steps[i] = steps[j]; steps[j] = tmp;
    render();
  }

  function render() {
    stepsEl.innerHTML = "";
    emptyHint.style.display = steps.length ? "none" : "block";
    steps.forEach(function (s, i) {
      var t = TYPES[s.type];
      var li = document.createElement("li");
      li.className = "step";
      li.dataset.i = i;
      li.innerHTML =
        '<span class="ic" style="background:' + t.color + '">' + t.icon + "</span>" +
        '<div class="body"><div class="name"></div><div class="desc">' + t.desc + "</div></div>" +
        '<div class="ctrl">' +
          '<button class="iconbtn" data-act="up" title="Move up">↑</button>' +
          '<button class="iconbtn" data-act="down" title="Move down">↓</button>' +
          '<button class="iconbtn" data-act="del" title="Remove">✕</button>' +
        "</div><span class='dot'></span>";
      // editable label
      var nameEl = li.querySelector(".name");
      nameEl.textContent = s.label;
      nameEl.title = "Click to rename";
      nameEl.style.cursor = "text";
      nameEl.addEventListener("click", function () {
        var v = prompt("Step label:", s.label);
        if (v != null && v.trim()) { s.label = v.trim(); render(); }
      });
      li.querySelector('[data-act=up]').addEventListener("click", function () { move(i, -1); });
      li.querySelector('[data-act=down]').addEventListener("click", function () { move(i, 1); });
      li.querySelector('[data-act=del]').addEventListener("click", function () { removeStep(i); });
      stepsEl.appendChild(li);
    });
  }

  // ---- Simulated execution engine ----
  function run() {
    if (running) return;
    if (!steps.length) { setStatus("idle"); flash("Add steps first."); return; }
    running = true;
    setStatus("running");
    logEl.innerHTML = "";
    document.getElementById("run").disabled = true;
    stepsEl.querySelectorAll(".step").forEach(function (el) { el.className = "step"; });

    line("head", "▶ workflow.run() — " + steps.length + " steps");
    var t0 = Date.now();
    var i = 0;

    function next() {
      if (i >= steps.length) {
        var ms = Date.now() - t0;
        line("ok", "✓ completed in " + ms + "ms");
        setStatus("done");
        running = false;
        document.getElementById("run").disabled = false;
        return;
      }
      var s = steps[i];
      var t = TYPES[s.type];
      var el = stepsEl.querySelector('.step[data-i="' + i + '"]');
      if (el) el.classList.add("s-run");
      line("info", "→ [" + t.name + "] " + s.label);

      // simulate variable per-step latency
      var dur = 280 + (s.type === "llm" ? 520 : s.type === "tool" ? 340 : 160);
      setTimeout(function () {
        if (el) el.classList.remove("s-run");
        // a tool call has a small chance to "retry" to show error handling/observability
        if (s.type === "tool" && i % 5 === 4) {
          line("fail", "  ! tool timeout — retrying (1/1)");
          if (el) el.classList.add("s-run");
          setTimeout(function () {
            if (el) { el.classList.remove("s-run"); el.classList.add("s-ok"); }
            line("ok", "  ✓ " + t.name + " ok (retry)");
            i++; next();
          }, 360);
          return;
        }
        if (el) el.classList.add("s-ok");
        if (s.type === "condition") line("info", "  ↳ branch: yes");
        if (s.type === "llm") line("info", "  ↳ model output: structured decision");
        line("ok", "  ✓ " + t.name + " ok (" + dur + "ms)");
        i++; next();
      }, dur);
    }
    next();
  }

  function setStatus(s) {
    statusEl.textContent = s;
    statusEl.className = "run-status" + (s === "running" ? " running" : s === "done" ? " done" : s === "failed" ? " failed" : "");
  }
  function line(cls, text) {
    var d = document.createElement("div");
    d.className = "line";
    var stamp = new Date().toLocaleTimeString([], { hour12: false });
    d.innerHTML = '<span class="t">' + stamp + '</span><span class="' + cls + '"></span>';
    d.querySelector("." + cls).textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function flash(msg) { logEl.innerHTML = '<p class="empty">' + msg + "</p>"; }

  // preload sample
  steps = SAMPLE.map(function (s) { return { type: s.type, label: s.label }; });
  render();
})();
