// Token Radar — the page's whole behaviour: read window.RADAR, filter, sort, open a row, compare two.
// No network, no framework: data.js carries the board, this file draws it.
(function () {
  'use strict';

  var DATA = window.RADAR || null;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- formatting ----------

  function usd(n) {
    if (!isFinite(n)) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n === null || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function growthClass(n) {
    if (n === null || !isFinite(n)) return 'flat';
    if (n > 0.5) return 'up';
    if (n < -0.5) return 'down';
    return 'flat';
  }

  function ageText(days) {
    if (days === null || !isFinite(days)) return 'no listing date';
    if (days < 60) return days + ' days old';
    if (days < 730) return Math.round(days / 30) + ' months old';
    return (days / 365).toFixed(1) + ' years old';
  }

  function chainsText(chains) {
    if (!chains || chains.length === 0) return 'no chain listed';
    if (chains.length <= 2) return chains.join(', ');
    return chains[0] + ', ' + chains[1] + ' +' + (chains.length - 2);
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- state ----------

  var state = { q: '', cat: '', chain: '', minTvl: 0, sort: 'rank', watchOnly: false, picked: [] };
  var BY_SLUG = {};

  function rows() { return (DATA && DATA.rows) || []; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows().filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      switch (state.sort) {
        case 'tvl': return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
        case 'growth': return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d) || a.rank - b.rank;
        case 'risk': return b.risk_score - a.risk_score || a.rank - b.rank;
        case 'age': return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days) || a.rank - b.rank;
        case 'name': return a.name.localeCompare(b.name);
        default: return a.rank - b.rank;
      }
    });
    return out;
  }

  // ---------- board ----------

  function riskHtml(r) {
    var band = r.risk_band || 'watch';
    return '<span class="risk ' + esc(band) + '"><span class="bar"><i style="width:' +
      Math.max(2, Math.min(100, r.risk_score)) + '%"></i></span>' + r.risk_score + '</span>';
  }

  function rowHtml(r) {
    var picked = state.picked.indexOf(r.slug) !== -1;
    return '<div class="row' + (picked ? ' on' : '') + '" role="row" tabindex="0" data-slug="' + esc(r.slug) + '">' +
      '<span role="cell"><input class="pick" type="checkbox" data-pick="' + esc(r.slug) + '"' + (picked ? ' checked' : '') +
      ' aria-label="pick ' + esc(r.name) + ' to compare"></span>' +
      '<span role="cell" class="c-rank">' + r.rank + '</span>' +
      '<span role="cell" class="c-name"><span class="name">' + esc(r.name) + '</span>' +
        '<span class="sub">' + (r.watchlist ? '<span class="pill wl">watchlist</span> ' : '') + ageText(r.age_days) + '</span></span>' +
      '<span role="cell" class="c-cat">' + esc(r.category || 'uncategorised') + '</span>' +
      '<span role="cell" class="c-chain">' + esc(chainsText(r.chains)) + '</span>' +
      '<span role="cell" class="c-num">' + usd(r.tvl_usd) + '</span>' +
      '<span role="cell" class="c-num ' + growthClass(r.change_7d) + '">' + pct(r.change_7d) + '</span>' +
      '<span role="cell" class="c-risk">' + riskHtml(r) + '</span>' +
      '<span role="cell" class="c-num big">' + usd(r.implied_value_usd) + '</span>' +
      '</div>';
  }

  function updateRange() {
    var box = $('rows');
    var total = box.children.length;
    var label = $('visible-range');
    if (total === 0) { label.textContent = 'no rows'; return; }
    var rowH = box.firstElementChild.getBoundingClientRect().height || 47;
    // Snap the viewport to whole rows so no row is ever sliced by the container edge.
    var room = window.innerHeight - box.getBoundingClientRect().top - 150;
    var per = Math.max(4, Math.floor(room / rowH));
    box.style.height = Math.min(per, total) * rowH + 'px';
    var capacity = Math.max(1, Math.round(box.clientHeight / rowH));
    var first = Math.min(total, Math.floor(box.scrollTop / rowH) + 1);
    var last = Math.min(total, first + capacity - 1);
    label.textContent = 'rows ' + first + '–' + last + ' of ' + total;
  }

  /** The active filters as words, for the status line. */
  function filterWords() {
    var w = [];
    if (state.q.trim()) w.push('"' + state.q.trim() + '"');
    if (state.cat) w.push(state.cat);
    if (state.chain) w.push(state.chain);
    if (state.minTvl) w.push('TVL ≥ ' + usd(state.minTvl));
    if (state.watchOnly) w.push('watchlist only');
    if (state.sort !== 'rank') w.push('sorted by ' + $('sort').selectedOptions[0].textContent);
    return w;
  }

  function render() {
    var list = filtered();
    var box = $('rows');
    box.innerHTML = list.map(rowHtml).join('');
    box.scrollTop = 0;
    $('empty').hidden = list.length !== 0;
    var words = filterWords();
    $('count').innerHTML = '<b>' + list.length + '</b> of ' + rows().length + ' protocols on the board' +
      (words.length ? ' · <span class="on">' + esc(words.join(' · ')) + '</span>' : ' · no filter');
    var canCompare = state.picked.length === 2;
    $('compare-go').disabled = !canCompare;
    $('compare-clear').disabled = state.picked.length === 0;
    updateRange();
    renderTray();
  }

  // ---------- compare tray ----------

  function renderTray() {
    var tray = $('compare-tray');
    var n = state.picked.length;
    tray.hidden = n === 0;
    if (n === 0) {
      $('tray-label').textContent = '';
      $('compare-go').disabled = true;
      return;
    }
    var names = state.picked.map(function (s) { return (BY_SLUG[s] || {}).name || s; });
    $('tray-label').textContent = names.join('  vs  ');
    $('compare-go').disabled = n !== 2;
    $('compare-go').textContent = n === 2 ? 'Compare these two' : 'Pick one more';
  }

  function togglePick(slug) {
    var at = state.picked.indexOf(slug);
    if (at >= 0) state.picked.splice(at, 1);
    else {
      state.picked.push(slug);
      if (state.picked.length > 2) state.picked.shift();
    }
    render();
  }

  // ---------- detail ----------

  function breakdownRow(label, text, ratio, cls) {
    var w = Math.max(0, Math.min(100, ratio * 100));
    return '<div class="bd-row"><span class="lab">' + esc(label) + '</span>' +
      '<span class="track"><i class="' + (cls || '') + '" style="width:' + w.toFixed(1) + '%"></i></span>' +
      '<span class="val">' + esc(text) + '</span></div>';
  }

  function detailHtml(r) {
    var m = r;
    var gm = r.growth_multiplier || 1;
    var mm = r.maturity_multiplier || 1;
    var cm = r.chain_multiplier || 1;
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var chainList = (r.chains || []).map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join(' ');
    return '<div class="detail-head">' +
        '<div>' +
          '<h2>' + esc(r.name) + '</h2>' +
          '<p class="meta">Rank <b>#' + r.rank + '</b> of ' + rows().length + ' · ' +
            '<b>' + esc(r.category || 'uncategorised') + '</b> · ' + esc(ageText(r.age_days)) +
            (r.listed_at ? ' (listed ' + esc(r.listed_at) + ')' : '') + '</p>' +
          '<p class="meta">' + (r.watchlist ? '<span class="pill wl">on the watchlist</span> ' : '') +
            (chainList || 'no chain listed') + '</p>' +
        '</div>' +
        '<div class="big-value">' +
          '<span class="k">implied value</span>' +
          '<span class="v">' + usd(r.implied_value_usd) + '</span>' +
          '<span class="r">risk ' + r.risk_score + '/100 · ' + esc(r.risk_band) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cols">' +
        '<div>' +
          '<h3>Farm plan — six steps</h3>' +
          '<ol class="steps">' + steps + '</ol>' +
        '</div>' +
        '<div>' +
          '<h3>How the model got there</h3>' +
          '<div class="breakdown">' +
            breakdownRow('TVL', usd(r.tvl_usd), Math.min(1, r.tvl_usd / 3e9)) +
            breakdownRow('7d growth', pct(r.change_7d), Math.min(1, Math.abs(r.change_7d || 0) / 120), (r.change_7d || 0) < 0 ? 'risk' : '') +
            breakdownRow('growth ×', gm.toFixed(3), Math.min(1, Math.abs(gm - 1) / 1.2), gm < 1 ? 'risk' : '') +
            breakdownRow('maturity ×', mm.toFixed(3), mm, mm < 0.9 ? 'warn' : '') +
            breakdownRow('chains ×', cm.toFixed(3), Math.min(1, (cm - 1) / 0.2)) +
            breakdownRow('risk', String(r.risk_score), r.risk_score / 100, r.risk_band === 'high' ? 'risk' : r.risk_band === 'watch' ? 'warn' : '') +
          '</div>' +
          '<div class="formula">' +
            'base  = ' + usd(r.tvl_usd) + ' × 0.20 = <b>' + usd(r.base_usd != null ? r.base_usd : r.tvl_usd * 0.2) + '</b><br>' +
            'growth = clamp(' + pct(r.change_7d) + ', −50, +150) → <b>×' + gm.toFixed(3) + '</b><br>' +
            'maturity at ' + esc(ageText(r.age_days)) + ' → <b>×' + mm.toFixed(3) + '</b><br>' +
            'chains = ' + (r.chains || []).length + ' → <b>×' + cm.toFixed(3) + '</b><br>' +
            'implied = base × growth × maturity × chains = <b>' + usd(r.implied_value_usd) + '</b>' +
          '</div>' +
          '<ul class="notes">' +
            '<li>This protocol\'s public index record carries no token, no symbol and no market cap. That is what the snapshot records, not proof a token can never exist.</li>' +
            '<li>Implied value is the model\'s estimate from TVL and momentum, not a price, a promise or advice.</li>' +
            '<li>Risk weighs age, the size of the weekly move and how many chains the protocol reaches. It never changes the rank.</li>' +
          '</ul>' +
        '</div>' +
      '</div>';
  }

  function openDetail(slug) {
    var r = BY_SLUG[slug];
    if (!r) return;
    $('app').hidden = true;
    $('detail').hidden = false;
    $('compare').hidden = true;
    document.body.classList.add('panel-mode');
    $('detail-body').innerHTML = detailHtml(r);
    window.scrollTo(0, 0);
  }

  // ---------- compare ----------

  function cmpCell(a, b, pick, fmt) {
    var va = fmt(a), vb = fmt(b);
    var cls = '';
    if (va !== vb) cls = pick(a, b) ? 'better' : 'worse';
    var other = pick(a, b) ? 'worse' : 'better';
    return '<div class="n grp-a ' + cls + '">' + va + '</div><div class="n ' + other + '">' + vb + '</div>';
  }

  function openCompare() {
    if (state.picked.length !== 2) return;
    var a = BY_SLUG[state.picked[0]], b = BY_SLUG[state.picked[1]];
    if (!a || !b) return;
    $('app').hidden = true;
    $('detail').hidden = true;
    $('compare').hidden = false;
    document.body.classList.add('panel-mode');
    var html = '<h2 style="margin:0 0 4px;font-size:20px">Two protocols, side by side</h2>' +
      '<p class="meta" style="margin:0;color:#7d90a4;font-size:12.5px">Same model, same snapshot. ' +
      'Green marks the stronger figure on each line; click either name for its full farm plan.</p>' +
      '<div class="cmp-grid">' +
        '<div class="h"> </div>' +
        '<div class="h hd" role="button" tabindex="0" data-open="' + esc(a.slug) + '">' + esc(a.name) + '</div>' +
        '<div class="h hd" role="button" tabindex="0" data-open="' + esc(b.slug) + '">' + esc(b.name) + '</div>' +
        '<div class="rowhead">Rank</div>' + cmpCell(a, b, function (x, y) { return x.rank < y.rank; }, function (r) { return '#' + r.rank; }) +
        '<div class="rowhead">Implied value</div>' + cmpCell(a, b, function (x, y) { return x.implied_value_usd > y.implied_value_usd; }, function (r) { return usd(r.implied_value_usd); }) +
        '<div class="rowhead">TVL</div>' + cmpCell(a, b, function (x, y) { return x.tvl_usd > y.tvl_usd; }, function (r) { return usd(r.tvl_usd); }) +
        '<div class="rowhead">7d growth</div>' + cmpCell(a, b, function (x, y) { return (x.change_7d || 0) > (y.change_7d || 0); }, function (r) { return pct(r.change_7d); }) +
        '<div class="rowhead">Growth ×</div>' + cmpCell(a, b, function (x, y) { return x.growth_multiplier > y.growth_multiplier; }, function (r) { return (r.growth_multiplier || 0).toFixed(3); }) +
        '<div class="rowhead">Maturity ×</div>' + cmpCell(a, b, function (x, y) { return x.maturity_multiplier > y.maturity_multiplier; }, function (r) { return (r.maturity_multiplier || 0).toFixed(3); }) +
        '<div class="rowhead">Chains ×</div>' + cmpCell(a, b, function (x, y) { return x.chain_multiplier > y.chain_multiplier; }, function (r) { return (r.chain_multiplier || 0).toFixed(3); }) +
        '<div class="rowhead">Chains</div>' + cmpCell(a, b, function (x, y) { return (x.chains || []).length > (y.chains || []).length; }, function (r) { return String((r.chains || []).length); }) +
        '<div class="rowhead">Risk (low is better)</div>' + cmpCell(a, b, function (x, y) { return x.risk_score < y.risk_score; }, function (r) { return String(r.risk_score); }) +
        '<div class="rowhead">Age</div>' + cmpCell(a, b, function (x, y) { return (x.age_days || 0) > (y.age_days || 0); }, function (r) { return ageText(r.age_days); }) +
        '<div class="rowhead">Category</div><div class="n grp-a">' + esc(a.category || '—') + '</div><div class="n">' + esc(b.category || '—') + '</div>' +
      '</div>' +
      '<p class="cmp-foot">Both rows carry the same six-step farm plan in their detail view. ' +
      'A bigger implied value is the model\'s ranking claim, not a forecast.</p>';
    $('compare-body').innerHTML = html;
    $('compare-body').querySelectorAll('[data-open]').forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-open')); });
    });
    window.scrollTo(0, 0);
  }

  // ---------- navigation (reachable from HTML) ----------

  window.showBoard = function showBoard() {
    $('detail').hidden = true;
    $('compare').hidden = true;
    $('app').hidden = false;
    document.body.classList.remove('panel-mode');
    window.scrollTo(0, 0);
  };
  window.openDetail = openDetail;
  window.openCompare = openCompare;

  // ---------- wiring ----------

  function fillSelect(id, values, fallback) {
    var sel = $(id);
    var html = '<option value="">' + fallback + '</option>';
    values.forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + '</option>'; });
    sel.innerHTML = html;
  }

  function bind() {
    $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('cat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
    $('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    $('mintvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value) || 0; render(); });
    $('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); markSort(); });
    $('wl').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });
    $('reset').addEventListener('click', function () {
      state = { q: '', cat: '', chain: '', minTvl: 0, sort: 'rank', watchOnly: false, picked: [] };
      $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('mintvl').value = '0';
      $('sort').value = 'rank'; $('wl').checked = false;
      render();
      markSort();
    });

    // Row clicks open the detail view; the checkbox only picks for the compare.
    $('rows').addEventListener('click', function (e) {
      var pick = e.target.closest('[data-pick]');
      if (pick) { e.stopPropagation(); togglePick(pick.getAttribute('data-pick')); return; }
      var row = e.target.closest('.row');
      if (row) openDetail(row.getAttribute('data-slug'));
    });
    $('rows').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('.row');
      if (row) { e.preventDefault(); openDetail(row.getAttribute('data-slug')); }
    });

    $('rows').addEventListener('scroll', updateRange, { passive: true });
    $('compare-go').addEventListener('click', openCompare);
    $('compare-clear').addEventListener('click', function () { state.picked = []; render(); });
    window.addEventListener('resize', updateRange);

    // The column headers sort too, and mark which one is in force.
    document.querySelectorAll('.thead [data-col]').forEach(function (h) {
      h.style.cursor = 'pointer';
      h.addEventListener('click', function () {
        state.sort = h.getAttribute('data-col');
        $('sort').value = state.sort;
        render();
        markSort();
      });
    });
  }

  /** A caret on the header column the board is sorted by. */
  function markSort() {
    document.querySelectorAll('.thead [data-col]').forEach(function (h) {
      var on = h.getAttribute('data-col') === state.sort;
      h.classList.toggle('sorted', on);
      h.setAttribute('aria-sort', on ? 'descending' : 'none');
    });
  }

  // ---------- boot ----------

  function boot() {
    var loading = $('loading');
    var app = $('app');
    if (!DATA || !Array.isArray(DATA.rows) || DATA.rows.length === 0) {
      loading.textContent = 'The board data did not load: data.js is missing or empty. Rebuild with main.ts.';
      return;
    }
    rows().forEach(function (r) { BY_SLUG[r.slug] = r; });

    $('fact-model').textContent = DATA.model_version || 'momentum-b';
    $('fact-asof').textContent = DATA.as_of || '—';
    $('fact-rows').textContent = DATA.rows.length + (DATA.early_size ? ' (' + DATA.early_size + ' early)' : '');
    $('fact-watch').textContent = DATA.watchlist_size + ' protocols';
    $('source').textContent = (DATA.source || '') + ' · watchlist floor ' + usd(DATA.floor_usd) + ' · model ' + (DATA.model_version || '');

    var cats = {}, chains = {};
    rows().forEach(function (r) {
      cats[r.category || 'uncategorised'] = 1;
      (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var catList = Object.keys(cats).sort(function (a, b) { return a.localeCompare(b); });
    var chainList = Object.keys(chains).filter(function (c) { return chains[c] >= 3; }).sort(function (a, b) { return chains[b] - chains[a] || a.localeCompare(b); });
    fillSelect('cat', catList, 'all categories');
    fillSelect('chain', chainList, 'all chains');

    bind();
    render();
    markSort();

    // The page is ready: hide the loading line, show the board.
    loading.hidden = true;
    loading.style.display = 'none';
    app.hidden = false;
    updateRange();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
