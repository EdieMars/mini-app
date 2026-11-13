/* Логика заказа — та же, что в боте и бланке.
   Все функции — на window.APP, тесты гоняются в Node. */
(function () {
  'use strict';

  var MEALS = ['Завтрак', 'Обед', 'Ужин'];

  function norm(s) {
    return String(s)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»"]/g, '')
      .replace(/[.,]/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // '15-17' -> [15,16,17]; '28-3' -> [28,1,2,3]
  function parseDays(text) {
    var t = String(text).replace(/[–—]/g, '-').trim();
    var days = [];
    var parts = t.split(/[,\s]+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a < 1 || a > 28 || b < 1 || b > 28) throw new Error('День вне 1–28: ' + p);
        if (a <= b) { for (var d = a; d <= b; d++) days.push(d); }
        else { for (var x = a; x <= 28; x++) days.push(x); for (var y = 1; y <= b; y++) days.push(y); }
      } else {
        if (!/^\d+$/.test(p)) throw new Error('«' + p + '» — не день (нужно 1–28)');
        var n = parseInt(p, 10);
        if (n < 1 || n > 28) throw new Error('День вне 1–28: ' + p);
        days.push(n);
      }
    }
    // уникальные, порядок ввода
    var seen = {}, out = [];
    for (var k = 0; k < days.length; k++) {
      if (!seen[days[k]]) { seen[days[k]] = 1; out.push(days[k]); }
    }
    return out;
  }

  // Сумма продуктов: {продукт: целое количество}
  function calc(rows, recipes, days, people, reserve) {
    var daySet = {};
    for (var i = 0; i < days.length; i++) daySet[days[i]] = 1;
    var perDay = false;
    for (var key in people) { if (/^\d+$/.test(key)) { perDay = true; break; } }

    var total = {};
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!daySet[row.day_no]) continue;
      var mp = perDay ? (people[row.day_no] || {}) : people;
      var n = parseInt(mp[row.meal] || 0, 10);
      if (!(n > 0)) continue;
      n += reserve;
      var recipe = recipes[norm(row.dish)];
      if (!recipe) throw new Error('Нет рецептуры для «' + row.dish + '»');
      var ing = recipe.ingredients;
      for (var j = 0; j < ing.length; j++) {
        var it = ing[j];
        total[it.product] = (total[it.product] || 0) + it.qty * n;
      }
    }
    var out = {};
    for (var p in total) {
      var q = Math.ceil(total[p] - 1e-9);
      if (q > 0) out[p] = q;
    }
    return out;
  }

  // '28, 1–3'
  function daysLabel(days) {
    if (!days.length) return '—';
    var parts = [], start = days[0], prev = days[0];
    for (var i = 1; i <= days.length; i++) {
      var d = i < days.length ? days[i] : null;
      if (d !== null && d === prev + 1) { prev = d; continue; }
      parts.push(start === prev ? String(start) : start + '–' + prev);
      if (d !== null) { start = d; prev = d; }
    }
    return parts.join(', ');
  }

  // Группы для вывода
  function groupOrder(items, categories, units) {
    var groups = [], used = 0;
    for (var i = 0; i < categories.length; i++) {
      var name = categories[i][0], prods = categories[i][1], block = [];
      for (var j = 0; j < prods.length; j++) {
        var p = prods[j];
        if (items[p]) {
          block.push({ name: p, qty: items[p], unit: units[p] || '' });
          used++;
        }
      }
      if (block.length) groups.push({ title: name, items: block });
    }
    return { groups: groups, used: used };
  }

  window.APP = {
    MEALS: MEALS,
    norm: norm,
    parseDays: parseDays,
    calc: calc,
    daysLabel: daysLabel,
    groupOrder: groupOrder,
    CYCLE_START: new Date(2026, 10, 16),   // 16.11.2026 = день 1
    dateToDay: dateToDay,
    parseDate: parseDate,
    datesToDays: datesToDays,
    fmtDate: fmtDate
  };

  // ---------- календарь ----------
  var DAY_MS = 86400000;

  function dayDiff(a, b) {
    var x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((x - y) / DAY_MS);
  }

  // дата -> номер дня цикла (1..28)
  function dateToDay(d) {
    var n = dayDiff(d, window.APP.CYCLE_START) % 28;
    if (n < 0) n += 28;
    return n + 1;
  }

  // '16.11' / '16.11.2026' / '16' -> Date (год по умолчанию 2026)
  function parseDate(s) {
    var m = String(s).trim().match(/^(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{2,4}))?$/);
    if (!m) throw new Error('«' + s + '» — не дата. Пиши так: 16.11');
    var d = parseInt(m[1], 10);
    var mo = m[2] ? parseInt(m[2], 10) : null;
    var y = m[3] ? parseInt(m[3], 10) : 2026;
    if (y < 100) y += 2000;
    if (!mo) throw new Error('Укажи месяц: 16.11');
    var dt = new Date(y, mo - 1, d);
    if (dt.getDate() !== d || dt.getMonth() !== mo - 1) throw new Error('Такой даты нет: ' + s);
    return dt;
  }

  function fmtDate(d) {
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '.' + mm + '.' + d.getFullYear();
  }

  // диапазон дат -> дни цикла (с переходом через конец цикла)
  function datesToDays(from, to) {
    var span = dayDiff(to, from);
    if (span < 0) throw new Error('«по» раньше «с»');
    if (span > 60) throw new Error('Слишком длинный период');
    var days = [];
    for (var i = 0; i <= span; i++) {
      var d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      days.push(dateToDay(d));
    }
    return days;
  }
})();
