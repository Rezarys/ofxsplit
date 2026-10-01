"use strict";
(function () {
  const $ = (id) => document.getElementById(id);

  function status(msg, isError) {
    const el = $("status");
    el.textContent = msg;
    el.className = isError ? "error" : "";
  }

  function download(out) {
    const url = URL.createObjectURL(new Blob([out.bytes], { type: "application/x-ofx" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = out.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function show(fileName, result) {
    const box = document.createElement("div");
    const h = document.createElement("h2");
    h.textContent = fileName + ": " + result.outputs.length + " account(s)";
    box.appendChild(h);
    const ul = document.createElement("ul");
    for (const out of result.outputs) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Download " + out.name;
      b.addEventListener("click", () => download(out));
      const span = document.createElement("span");
      span.textContent = " " + out.label + ", " + out.transactions + " transaction(s)"
        + (out.start || out.end ? ", " + (out.start || "?") + " to " + (out.end || "?") : "");
      li.appendChild(b);
      li.appendChild(span);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    for (const p of result.problems) {
      const w = document.createElement("p");
      w.className = "error";
      w.textContent = p;
      box.appendChild(w);
    }
    $("list").appendChild(box);
  }

  async function pick() {
    const chosen = Array.from($("files").files || []);
    if (!chosen.length) return;
    $("list").textContent = "";
    status("Reading...", false);
    let accounts = 0;
    let single = 0;
    const errors = [];
    for (const f of chosen) {
      try {
        const result = splitFile(f.name, new Uint8Array(await f.arrayBuffer()));
        accounts += result.outputs.length;
        if (result.outputs.length === 1) single++;
        show(f.name, result);
      } catch (err) {
        errors.push(f.name + ": " + (err && err.message ? err.message : "could not be read."));
      }
    }
    let msg = accounts + " account(s) found in " + (chosen.length - errors.length) + " file(s).";
    if (single) msg += " A file with a single account can be imported as it is; the copy below holds the same statement.";
    if (errors.length) msg += " " + errors.join(" ");
    status(msg, errors.length > 0 && accounts === 0);
  }

  $("files").addEventListener("change", pick);
  $("clear").addEventListener("click", () => {
    $("files").value = "";
    $("list").textContent = "";
    status("Cleared.", false);
  });
})();
