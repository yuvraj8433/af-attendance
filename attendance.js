/* AF Attendance — app ke andar ERP page par inject hota hai.
   Employee ka apna ERP login session use karta hai (koi API key nahi). */
(function () {
  'use strict';
  if (window.__afAttLoaded) return;
  window.__afAttLoaded = true;

  const DOCTYPE = 'Attendance Request';
  const CFG_KEY = 'af_att_cfg_v2';
  const DEFAULTS = {
    employee: '',                // khali = login user ka Employee auto
    reason: 'On Duty',
    explanation: '',
    action: 'Send for Approval', // workflow action ka naam
    autoSubmit: false            // true = app khulte hi khud submit
  };

  // ---------------- helpers ----------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function waitFor(fn, timeout = 30000, step = 200) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function tick() {
        let v;
        try { v = fn(); } catch (e) {}
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return reject(new Error('Page load timeout — dobara try karo'));
        setTimeout(tick, step);
      })();
    });
  }

  function loadCfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function getMyEmployee() {
    const r = await frappe.db.get_value('Employee',
      { user_id: frappe.session.user, status: 'Active' }, ['name', 'employee_name']);
    return r && r.message && r.message.name ? r.message : null;
  }

  async function findToday(emp, today) {
    const rows = await frappe.db.get_list(DOCTYPE, {
      filters: [
        ['employee', '=', emp],
        ['from_date', '<=', today],
        ['to_date', '>=', today],
        ['docstatus', '!=', 2]
      ],
      fields: ['name', 'docstatus'],
      limit: 1
    });
    return rows && rows.length ? rows[0] : null;
  }

  // ---------------- UI ----------------
  function injectCss() {
    if (document.getElementById('af-css')) return;
    const s = document.createElement('style');
    s.id = 'af-css';
    s.textContent = `
      #af-bar{position:fixed;left:0;right:0;bottom:0;z-index:10050;background:#fff;
        box-shadow:0 -6px 24px rgba(0,0,0,.18);border-radius:18px 18px 0 0;
        padding:14px 16px calc(14px + env(safe-area-inset-bottom));font-family:system-ui,-apple-system,Roboto,sans-serif}
      #af-bar .af-top{display:flex;align-items:center;gap:10px}
      #af-bar .af-msg{flex:1;font-size:14px;line-height:1.4;color:#1b2430}
      #af-bar .af-msg b{font-size:15px}
      #af-bar .af-gear{border:0;background:#eef2f7;border-radius:12px;width:44px;height:44px;font-size:20px}
      #af-bar .af-main{margin-top:12px;width:100%;border:0;border-radius:14px;padding:16px;
        font-size:18px;font-weight:700;color:#fff;background:#1565c0}
      #af-bar .af-main:disabled{opacity:.6}
      #af-bar.af-ok .af-main{background:#2e7d32}
      #af-bar.af-err .af-msg{color:#b71c1c}
      #af-bar.af-warn .af-msg{color:#7a5b00}
      #af-fab{position:fixed;right:16px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:10050;border:0;
        border-radius:28px;padding:14px 18px;font-size:16px;font-weight:700;color:#fff;background:#1565c0;
        box-shadow:0 6px 18px rgba(21,101,192,.4)}
      body.af-pad .page-container, body.af-pad .layout-main{padding-bottom:170px !important}`;
    document.head.appendChild(s);
  }

  function removeUI() {
    ['af-bar', 'af-fab'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    document.body.classList.remove('af-pad');
  }

  // state: loading | ready | warn | ok | err
  function showBar(state, html, btnText, onBtn) {
    injectCss();
    const fab = document.getElementById('af-fab'); if (fab) fab.remove();
    let bar = document.getElementById('af-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'af-bar';
      bar.innerHTML = `<div class="af-top"><div class="af-msg"></div>
        <button class="af-gear" title="Settings">⚙️</button></div>
        <button class="af-main"></button>`;
      document.body.appendChild(bar);
      bar.querySelector('.af-gear').onclick = openSettings;
    }
    document.body.classList.add('af-pad');
    bar.className = 'af-' + state;
    bar.querySelector('.af-msg').innerHTML = html;
    const b = bar.querySelector('.af-main');
    b.style.display = btnText ? '' : 'none';
    b.textContent = btnText || '';
    b.disabled = state === 'loading';
    b.onclick = onBtn || null;
  }

  function showFab() {
    injectCss();
    const bar = document.getElementById('af-bar'); if (bar) bar.remove();
    document.body.classList.remove('af-pad');
    if (document.getElementById('af-fab')) return;
    const f = document.createElement('button');
    f.id = 'af-fab';
    f.textContent = '📝 Attendance';
    f.onclick = () => frappe.new_doc(DOCTYPE);
    document.body.appendChild(f);
  }

  // ---------------- flow ----------------
  let routeToken = 0;
  let busy = false;

  async function onRoute() {
    const my = ++routeToken;
    const r = frappe.get_route() || [];

    if (!(r[0] === 'Form' && r[1] === DOCTYPE)) { showFab(); return; }

    showBar('loading', '⏳ Form load ho raha hai...');
    let frm;
    try {
      frm = await waitFor(() => window.cur_frm && cur_frm.doctype === DOCTYPE &&
        cur_frm.docname === r[2] && cur_frm.doc && cur_frm);
    } catch (e) { if (my === routeToken) showBar('err', esc(e.message), '🔄 Retry', onRoute); return; }
    if (my !== routeToken) return;

    if (!frm.is_new()) {
      const st = frm.doc.workflow_state || (frm.doc.docstatus === 1 ? 'Submitted' : 'Draft');
      showBar(frm.doc.docstatus === 0 ? 'warn' : 'ok',
        `<b>${esc(frm.doc.name)}</b><br>Status: ${esc(st)}`,
        '➕ Nayi Attendance', () => frappe.new_doc(DOCTYPE));
      return;
    }
    prepare(frm, my);
  }

  async function prepare(frm, my) {
    const cfg = loadCfg();
    try {
      showBar('loading', '⏳ Aapki details bhari ja rahi hain...');
      let emp = cfg.employee || frm.doc.employee;
      if (!emp) { const me = await getMyEmployee(); emp = me && me.name; }
      if (my !== routeToken) return;
      if (!emp) {
        showBar('err', 'Aapka Employee record nahi mila. ⚙️ dabakar apna naam select karo.', '⚙️ Settings', openSettings);
        return;
      }

      const today = frappe.datetime.get_today();
      const todayUser = frappe.datetime.str_to_user(today);

      const existing = await findToday(emp, today);
      if (my !== routeToken) return;
      if (existing) {
        showBar('ok', `✅ Aaj (${esc(todayUser)}) ki attendance already lag chuki hai.<br><b>${esc(existing.name)}</b>`,
          '👁️ Dekho', () => frappe.set_route('Form', DOCTYPE, existing.name));
        return;
      }

      await frm.set_value('employee', emp);
      await sleep(600); // employee_name / company fetch
      await frm.set_value('from_date', today);
      await frm.set_value('to_date', today);
      if (frm.fields_dict.half_day) await frm.set_value('half_day', 0);
      await frm.set_value('reason', cfg.reason || 'On Duty');
      if (cfg.explanation && frm.fields_dict.explanation) await frm.set_value('explanation', cfg.explanation);
      if (my !== routeToken) return;

      const name = frm.doc.employee_name || emp;
      showBar('ready',
        `<b>${esc(name)}</b><br>📅 ${esc(todayUser)} &nbsp;•&nbsp; ${esc(cfg.reason || 'On Duty')}`,
        '✅ Submit Attendance', () => submit(frm));

      if (cfg.autoSubmit) submit(frm);
    } catch (e) {
      console.error('[AF]', e);
      if (my === routeToken) showBar('err', esc((e && e.message) || 'Kuch galat ho gaya'), '🔄 Retry', onRoute);
    }
  }

  async function submit(frm) {
    if (busy) return;
    busy = true;
    const cfg = loadCfg();
    try {
      showBar('loading', '💾 Save ho raha hai...', '⏳ Please wait');
      try { await frm.save(); } catch (e) { throw new Error('Save nahi hua — upar ERP ka error message dekho.'); }
      if (frm.is_new()) throw new Error('Save nahi hua — mandatory fields check karo.');

      showBar('loading', '📨 Approval ke liye bheja ja raha hai...', '⏳ Please wait');
      await sleep(600);
      const transitions = await frappe.xcall('frappe.model.workflow.get_transitions', { doc: frm.doc });
      if (!transitions || !transitions.length) {
        throw new Error(`Save ho gaya (${frm.doc.name}) par koi Approval action nahi mila. ERP mein Actions check karo.`);
      }
      const w = (cfg.action || '').toLowerCase().trim();
      const t = transitions.find(x => (x.action || '').toLowerCase() === w)
             || transitions.find(x => /approv/i.test(x.action || ''));
      if (!t) {
        throw new Error(`Action "${cfg.action}" nahi mila. Available: ${transitions.map(x => x.action).join(', ')}`);
      }

      const doc = await frappe.xcall('frappe.model.workflow.apply_workflow', { doc: frm.doc, action: t.action });
      frappe.model.sync(doc);
      frm.refresh();

      showBar('ok', `🎉 Attendance bhej di gayi!<br><b>${esc(doc.name)}</b> → ${esc(doc.workflow_state || t.action)}`,
        '✔️ Done', () => frappe.set_route('Form', DOCTYPE, doc.name));
      if (window.AFApp && AFApp.vibrate) try { AFApp.vibrate(); } catch (e) {}
    } catch (e) {
      console.error('[AF]', e);
      showBar('err', esc((e && e.message) || 'Kuch galat ho gaya'), '🔄 Dobara try karo', () => onRoute());
    } finally {
      busy = false;
    }
  }

  // ---------------- settings ----------------
  function openSettings() {
    const cfg = loadCfg();
    const d = new frappe.ui.Dialog({
      title: '⚙️ Attendance Settings',
      fields: [
        { fieldname: 'employee', fieldtype: 'Link', options: 'Employee', label: 'Employee (khali = automatic)', default: cfg.employee },
        { fieldname: 'reason', fieldtype: 'Select', options: 'On Duty\nWork From Home', label: 'Reason', default: cfg.reason },
        { fieldname: 'explanation', fieldtype: 'Small Text', label: 'Explanation (optional)', default: cfg.explanation },
        { fieldname: 'action', fieldtype: 'Data', label: 'Approval action ka naam', default: cfg.action },
        { fieldname: 'autoSubmit', fieldtype: 'Check', label: 'App khulte hi khud submit kar do', default: cfg.autoSubmit ? 1 : 0 }
      ],
      primary_action_label: 'Save',
      primary_action(v) {
        saveCfg({
          employee: (v.employee || '').trim(),
          reason: v.reason || 'On Duty',
          explanation: v.explanation || '',
          action: (v.action || '').trim() || DEFAULTS.action,
          autoSubmit: !!v.autoSubmit
        });
        d.hide();
        frappe.show_alert({ message: 'Settings saved ✅', indicator: 'green' }, 3);
        onRoute();
      }
    });
    d.show();
  }

  // ---------------- boot ----------------
  waitFor(() => window.frappe && frappe.router && frappe.session &&
                 frappe.session.user && frappe.session.user !== 'Guest' && document.body, 120000)
    .then(() => {
      frappe.router.on('change', () => setTimeout(onRoute, 300));
      onRoute();
    })
    .catch(() => {});
})();
