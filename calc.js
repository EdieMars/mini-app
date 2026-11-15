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
  // понимает и «с 15 по 17», и «15..17», и «15 – 17», как бот
  function parseDays(text) {
    var t = String(text == null ? '' : text).toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/\s*\.\s*\.\s*/g, '-')      // 15..17
      .replace(/^дни\s*:?\s*/, '')
      .replace(/\s+по\s+/g, '-')
      .replace(/^с\s+/, '')
      .replace(/\s*-\s*/g, '-')
      .trim();
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

  // Сумма продуктов БЕЗ округления — для вычета остатков
  function calcRaw(rows, recipes, days, people, reserve) {
    reserve = reserve || 0;              // без этого n += undefined даёт NaN и пустой заказ
    var daySet = {};
    for (var i = 0; i < days.length; i++) daySet[days[i]] = 1;
    var perDay = false;
    for (var key in people) { if (/^\d+$/.test(key)) { perDay = true; break; } }

    var total = {}, missing = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!daySet[row.day_no]) continue;
      var mp = perDay ? (people[row.day_no] || {}) : people;
      var n = parseInt(mp[row.meal] || 0, 10);
      if (!(n > 0)) continue;
      n += reserve;
      var recipe = recipes[norm(row.dish)];
      if (!recipe) { missing.push({ day: row.day_no, dish: row.dish }); continue; }
      var ing = recipe.ingredients;
      for (var j = 0; j < ing.length; j++) {
        var it = ing[j];
        total[it.product] = (total[it.product] || 0) + it.qty * n;
      }
    }
    if (missing.length) {
      var names = [], seen = {}, dayList = [], daySeen = {};
      missing.forEach(function (m) {
        if (!seen[m.dish]) { seen[m.dish] = 1; names.push(m.dish); }
        if (!daySeen[m.day]) { daySeen[m.day] = 1; dayList.push(m.day); }
      });
      dayList.sort(function (a, b) { return a - b; });
      throw new Error('Нет рецептуры: ' + names.join(', ') +
                      ' (дни: ' + daysLabel(dayList) + ')');
    }
    var clean = {};
    for (var p in total) { if (total[p] > 0) clean[p] = total[p]; }
    return clean;
  }

  // Сумма продуктов: {продукт: целое количество} — округление вверх в самом конце
  function calc(rows, recipes, days, people, reserve) {
    var raw = calcRaw(rows, recipes, days, people, reserve);
    var out = {};
    for (var p in raw) {
      var q = Math.ceil(raw[p] - 1e-9);
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
    calcRaw: calcRaw,
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

  // приводит дату к виду '16.11' или '16.11.2026'
  // понимает: 16.11 / 16.11.26 / 16.11.2026 / 16 11 / 16/11 / 16-11 / 1611 / 16112026
  function normDate(s) {
    var t = String(s).trim()
      .replace(/[\/\\\-,\s]+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '');
    if (/^\d{4}$/.test(t)) t = t.slice(0, 2) + '.' + t.slice(2);            // 1611
    else if (/^\d{5,8}$/.test(t)) t = t.slice(0, 2) + '.' + t.slice(2, 4) + '.' + t.slice(4); // 161126 / 16112026
    return t;
  }

  // '16.11' / '16.11.2026' / '1611' -> Date (год по умолчанию 2026)
  function parseDate(s) {
    var t = normDate(s);
    var m = t.match(/^(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{2,4}))?$/);
    if (!m) throw new Error('«' + s + '» — не дата. Пиши так: 16.11 или 1611');
    var d = parseInt(m[1], 10);
    var mo = m[2] ? parseInt(m[2], 10) : null;
    var y = m[3] ? parseInt(m[3], 10) : 2026;
    if (y < 100) y += 2000;
    if (!mo) throw new Error('Укажи месяц: 16.11 или 1611');
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

  // ---------- меню недели ----------
  var WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  function weekDays(baseDate) {
    var wd = (baseDate.getDay() + 6) % 7;   // 0 = понедельник
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - wd + i);
      out.push({ date: d, day: dateToDay(d), name: WEEKDAYS[i] });
    }
    return out;
  }

  function menuFor(day, menu) {
    var meals = { 'Завтрак': [], 'Обед': [], 'Ужин': [] };
    for (var i = 0; i < menu.length; i++) {
      var r = menu[i];
      if (r.day_no === day && meals[r.meal]) meals[r.meal].push(r.dish);
    }
    return meals;
  }

  // ---------- техкарты ----------
  var RU_ENDINGS = ['ая', 'яя', 'ый', 'ий', 'ой', 'ые', 'ие', 'ов', 'ев', 'ам', 'ем', 'ом',
                    'ах', 'ях', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ь'];
  var STOP = { 'под': 1, 'для': 1, 'при': 1, 'над': 1, 'без': 1, 'про': 1, 'порц': 1,
               'гр': 1, 'кг': 1, 'шт': 1, 'мл': 1, 'порции': 1, 'из': 1, 'с': 1, 'в': 1,
               'на': 1, 'от': 1, 'по': 1, 'до': 1, 'к': 1, 'и': 1, 'не': 1, 'со': 1,
               'об': 1, 'о': 1, 'у': 1, 'а': 1, 'же': 1, 'ли': 1 };
  var SYNO = { 'картошка': 'картофель', 'картошечка': 'картофель', 'гречка': 'греча',
               'курица': 'кура', 'курочка': 'кура' };

  function stem(w) {
    for (var i = 0; i < RU_ENDINGS.length; i++) {
      var e = RU_ENDINGS[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }

  function keyWords(text) {
    var words = norm(text).split(/[^а-яёa-z0-9]+/).filter(function (w) { return w.length >= 2; });
    var out = {};
    words.forEach(function (w) {
      w = SYNO[w] || w;
      if (STOP[w]) return;
      out[stem(w)] = 1;
    });
    return Object.keys(out);
  }

  function wordsMatch(a, b) {
    if (a === b) return true;
    var shortest = Math.min(a.length, b.length);
    if (shortest < 3) return false;
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
    var n = shortest >= 5 ? 4 : 3;
    return a.slice(0, n) === b.slice(0, n);
  }

  function findCards(q, cards) {
    var t = norm(q).trim();
    if (!t) return [];

    var exact = cards.filter(function (c) {
      var n = norm(c.dish);
      return (' ' + n + ' ').indexOf(' ' + t + ' ') >= 0;
    });
    if (exact.length) return exact;

    var words = keyWords(t);
    if (!words.length) return [];

    var scored = [];
    cards.forEach(function (c) {
      var nw = keyWords(c.dish);
      if (!nw.length) return;
      var hits = nw.filter(function (w) {
        return words.some(function (q) { return wordsMatch(w, q); });
      }).length;
      if (hits) scored.push({ c: c, hits: hits, ratio: hits / nw.length });
    });
    if (!scored.length) return [];
    scored.sort(function (a, b) { return b.hits - a.hits || b.ratio - a.ratio; });
    var best = scored[0].hits;
    return scored.filter(function (s) { return s.hits === best; })
      .map(function (s) { return s.c; }).slice(0, 20);
  }

  function fmtQty(q, unit) {
    if (unit === 'шт') return String(Math.ceil(q - 1e-9)) + ' шт';
    if (unit === 'кг' || unit === 'л') {
      if (q < 1) return String(Math.round(q * 1000)) + (unit === 'кг' ? ' г' : ' мл');
      var s = q.toFixed(2).replace(/\.?0+$/, '');
      return s.replace('.', ',') + ' ' + unit;
    }
    return String(Math.round(q * 1000) / 1000) + ' ' + (unit || '');
  }

  function portionsWord(n) {
    n = Math.abs(Math.round(n));
    if (n % 10 === 1 && n % 100 !== 11) return 'порция';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'порции';
    return 'порций';
  }

  function cardText(card, portions) {
    var per = card.per || 1;
    var lines = [card.dish + (card.output ? ' (' + card.output + ')' : ''),
                 'На ' + portions + ' ' + portionsWord(portions) + ':', ''];
    card.ing.forEach(function (it) {
      lines.push('  ' + it[0] + ' — ' + fmtQty(it[2] * portions / per, it[1]));
    });
    return lines.join('\n');
  }

  var A = window.APP;
  A.weekDays = weekDays;
  A.menuFor = menuFor;
  A.findCards = findCards;
  A.fmtQty = fmtQty;
  A.cardText = cardText;
})();
