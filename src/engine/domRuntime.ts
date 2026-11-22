/**
 * Vanilla-JS DOM runtime embedded in HTML / Web Component exports. It is concatenated AFTER the engine core
 * (src/engine/core.ts, types stripped — see runtimeSource.generated.ts) so `formifyCompute`, `formifySteps`,
 * `formifyValidate`, `formifyCollect`, ... are in scope. Plain ES5-style JS on purpose: it ships to users' pages.
 *
 * Markup contract (produced by utils/exportMarkup.ts): data-field / data-input / data-error / data-req /
 * data-calc / data-slider-value / data-star and data-formify-{progress,progressbar,bar,step,announcer,
 * success,back,next,submit} attributes inside a <form>.
 */
export const FORMIFY_DOM_RUNTIME_JS = `
function formifyMount(form, schema, opts) {
  opts = opts || {};
  var fields = (schema.fields || []).filter(function (f) { return f && f.id; });
  var stepIndex = 0;
  var lastErrors = {};
  var all = function (sel) { return Array.prototype.slice.call(form.querySelectorAll(sel)); };
  var withAttr = function (attr, id) { return all("[" + attr + "]").filter(function (el) { return el.getAttribute(attr) === id; }); };
  var one = function (attr, id) { return withAttr(attr, id)[0]; };
  var role = function (name) { return form.querySelector("[data-formify-" + name + "]"); };
  var optionValue = function (field, str) {
    var hit = (field.options || []).filter(function (o) { return String(o.value) === str; })[0];
    return hit ? hit.value : str;
  };

  function readField(f) {
    var els = withAttr("data-input", f.id);
    if (!els.length) return undefined;
    var checked = els.filter(function (e) { return e.checked; });
    switch (f.type) {
      case "checkbox": return !!els[0].checked;
      case "multiselect": return checked.map(function (c) { return optionValue(f, c.value); });
      case "radio": return checked[0] ? optionValue(f, checked[0].value) : "";
      case "rating": return checked[0] ? Number(checked[0].value) : 0;
      case "slider": return Number(els[0].value);
      case "select": return optionValue(f, els[0].value);
      case "file": return Array.prototype.map.call(els[0].files || [], function (x) { return { name: x.name, size: x.size, type: x.type }; });
      default: return els[0].value;
    }
  }

  function readValues() {
    var v = {};
    fields.forEach(function (f) {
      if (f.type === "hidden") { v[f.id] = formifyDefault(f); return; }
      var x = readField(f);
      if (x !== undefined) v[f.id] = x;
    });
    return v;
  }

  function showErrors(errors) {
    fields.forEach(function (f) {
      var box = one("data-error", f.id);
      var msg = errors[f.id] || "";
      if (box) { box.textContent = msg; box.hidden = !msg; }
      withAttr("data-input", f.id).forEach(function (el) {
        if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
      });
    });
  }

  function announce(text) { var a = role("announcer"); if (a) a.textContent = text; }

  function update() {
    var values = formifyCompute(schema, readValues());
    var steps = formifySteps(schema, values);
    if (stepIndex > steps.length - 1) stepIndex = steps.length - 1;
    var inStep = {};
    steps[stepIndex].fields.forEach(function (f) { inStep[f.id] = true; });
    fields.forEach(function (f) {
      var wrap = one("data-field", f.id);
      if (!wrap) return;
      wrap.hidden = !inStep[f.id];
      var req = formifyRequired(f, values);
      var mark = one("data-req", f.id);
      if (mark) mark.hidden = !req;
      withAttr("data-input", f.id).forEach(function (el) {
        if (req) el.setAttribute("aria-required", "true"); else el.removeAttribute("aria-required");
      });
      if (f.type === "calculated") {
        var out = one("data-calc", f.id);
        var cv = values[f.id];
        if (out) out.textContent = (cv === "" || cv === null || cv === undefined) ? "\\u2014" : String(cv);
      }
      if (f.type === "slider") {
        var sv = one("data-slider-value", f.id);
        if (sv) sv.textContent = String(values[f.id]);
      }
      if (f.type === "rating") {
        withAttr("data-star", f.id).forEach(function (s) {
          var on = Number(s.getAttribute("data-n")) <= Number(values[f.id] || 0);
          s.textContent = on ? "\\u2605" : "\\u2606";
          s.style.color = on ? "#f59e0b" : "#d1d5db";
        });
      }
    });
    var multi = steps.length > 1;
    var prog = role("progress");
    if (prog) prog.hidden = !multi;
    if (multi) {
      var step = steps[stepIndex];
      var text = "Step " + (stepIndex + 1) + " of " + steps.length + (step.title ? " \\u2014 " + step.title : "");
      var head = role("step"); if (head) head.textContent = text;
      var bar = role("bar"); if (bar) bar.style.width = (((stepIndex + 1) / steps.length) * 100) + "%";
      var pb = role("progressbar");
      if (pb) {
        pb.setAttribute("aria-valuemin", "1");
        pb.setAttribute("aria-valuemax", String(steps.length));
        pb.setAttribute("aria-valuenow", String(stepIndex + 1));
        pb.setAttribute("aria-valuetext", text);
      }
    }
    var isLast = stepIndex === steps.length - 1;
    var back = role("back"), next = role("next"), submit = role("submit");
    if (back) back.hidden = !(multi && stepIndex > 0);
    if (next) next.hidden = isLast;
    if (submit) submit.hidden = !isLast;
    return { values: values, steps: steps, isLast: isLast };
  }

  function goTo(i, focusEl) {
    stepIndex = i;
    update();
    var target = focusEl || role("step");
    if (target && target.focus) target.focus();
  }

  function firstInput(id) { return withAttr("data-input", id)[0]; }

  function validateScope(ids) {
    var s = update();
    var errors = formifyValidate(schema, s.values, ids);
    // keep errors on other fields, replace the ones we just checked
    var next = {};
    Object.keys(lastErrors).forEach(function (k) { if (ids && ids.indexOf(k) < 0) next[k] = lastErrors[k]; });
    Object.keys(errors).forEach(function (k) { next[k] = errors[k]; });
    lastErrors = next;
    showErrors(lastErrors);
    return errors;
  }

  function goNext() {
    var s = update();
    var ids = s.steps[stepIndex].fields.map(function (f) { return f.id; });
    var errors = validateScope(ids);
    var keys = Object.keys(errors);
    if (keys.length) {
      announce("Please fix " + keys.length + " error" + (keys.length === 1 ? "" : "s") + " before continuing.");
      var el = firstInput(keys[0]); if (el) el.focus();
      return;
    }
    announce("");
    goTo(stepIndex + 1);
  }

  function onSubmit(e) {
    e.preventDefault();
    var s = update();
    if (!s.isLast) { goNext(); return; }
    var errors = formifyValidate(schema, s.values, null);
    var keys = Object.keys(errors);
    if (keys.length) {
      lastErrors = errors;
      var target = s.steps.map(function (st) { return st.fields.some(function (f) { return errors[f.id]; }); }).indexOf(true);
      if (target >= 0) { stepIndex = target; update(); }
      showErrors(errors);
      announce("Please fix " + keys.length + " error" + (keys.length === 1 ? "" : "s") + " before submitting.");
      var el = firstInput(keys.filter(function (k) { return one("data-field", k) && !one("data-field", k).hidden; })[0] || keys[0]);
      if (el) el.focus();
      return;
    }
    var payload = formifyCollect(schema, s.values);
    announce("");
    lastErrors = {};
    showErrors({});
    form.reset();
    stepIndex = 0;
    update();
    var ok = role("success"); if (ok) { ok.hidden = false; }
    try { form.dispatchEvent(new CustomEvent("formify:submit", { detail: payload, bubbles: true })); } catch (err) {}
    if (opts.onSubmit) opts.onSubmit(payload); else if (typeof console !== "undefined") console.log("Formify submission:", payload);
  }

  function onInput() {
    var ok = role("success"); if (ok) ok.hidden = true;
    update();
    var shown = Object.keys(lastErrors);
    if (shown.length) { // live-clear errors the user is fixing
      var errors = formifyValidate(schema, formifyCompute(schema, readValues()), shown);
      lastErrors = errors;
      showErrors(errors);
    }
  }

  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  var nextBtn = role("next"), backBtn = role("back");
  if (nextBtn) nextBtn.addEventListener("click", goNext);
  if (backBtn) backBtn.addEventListener("click", function () { announce(""); goTo(Math.max(0, stepIndex - 1)); });
  update();
  return {
    update: update,
    getValues: function () { return formifyCollect(schema, readValues()); },
    destroy: function () { form.removeEventListener("submit", onSubmit); form.removeEventListener("input", onInput); form.removeEventListener("change", onInput); }
  };
}
`;
