// Проверки ввода: на неверное — понятная ошибка, а не молчаливое «0».
// Запуск из папки mini-app-git:  node tests/test_input_errors.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

const inject = `
<script>
(function () {
  var out = { steps: [], errors: [] };
  function check(n, got, want) {
    if (String(got) === String(want)) out.steps.push('OK ' + n);
    else { out.steps.push('ПЛОХО ' + n + ': ' + got + ' вместо ' + want); out.errors.push(n); }
  }
  function set(id, v) { document.getElementById(id).value = v; }
  function err() {
    var e = document.getElementById('error');
    return { shown: !e.classList.contains('hidden'), text: e.textContent };
  }
  function calc() { document.getElementById('calculate').click(); return err(); }
  try {
    // 0. цифровых клавиатур больше нет
    check('нет полей с inputmode=numeric', document.querySelectorAll('[inputmode="numeric"]').length, 0);

    // 1. люди: слово вместо числа
    set('from', '16.11'); set('to', ''); set('b', 'сорок'); set('l', '40'); set('d', '25');
    var e1 = calc();
    check('«сорок» в завтраке: ошибка показана', e1.shown, true);
    check('«сорок» в завтраке: сказано, что не число', /не число/.test(e1.text), true);
    check('«сорок» в завтраке: названо поле', /Завтрак/.test(e1.text), true);
    check('«сорок» в завтраке: назван ввод', /сорок/.test(e1.text), true);

    // 2. буква прилипла к числу
    set('b', '40a');
    check('«40a»: ошибка', /не число/.test(calc().text), true);

    // 3. минус
    set('b', '-40');
    check('«-40»: сказано про минус', /минус не нужен/.test(calc().text), true);

    // 4. пустые люди
    set('b', ''); set('l', ''); set('d', '');
    check('пусто в людях: просит указать число', /Укажи число человек/.test(calc().text), true);

    // 5. запас
    set('b', '40'); set('l', '40'); set('d', '25'); set('reserve', '-3');
    check('запас «-3»: ошибка', /минус не нужен/.test(calc().text), true);
    set('reserve', '');

    // 6. даты
    set('from', '32.13'); set('to', '');
    check('дата «32.13»: ошибка', /Такой даты нет/.test(calc().text), true);
    set('from', 'абв');
    check('дата «абв»: ошибка', /не дата/.test(calc().text), true);

    // 7. дни цикла
    set('from', '16.11');
    document.getElementById('modeCycle').click();
    set('days', '1a');
    check('дни «1a»: ошибка', /не день/.test(calc().text), true);
    set('days', '29');
    check('дни «29»: вне диапазона', /вне 1–28/.test(calc().text), true);

    // 8. верный ввод по-прежнему работает
    set('days', '1-3');
    set('b', '40'); set('l', '40'); set('d', '25');
    var ok = calc();
    check('верные дни 1-3: ошибки нет', ok.shown, false);
    check('верные дни 1-3: заказ показан',
      !document.getElementById('output').classList.contains('hidden'), true);

    // 9. порции в техкарте
    document.querySelector('.nav button[data-screen="cards"]').click();
    var cat = document.querySelector('#cardCats .category');
    cat.click();
    var dish = document.querySelector('#cardList .category[data-page]');
    check('техкарта открывается', !!dish, true);
    if (dish) {
      dish.click();
      document.getElementById('portions').value = 'абв';
      document.getElementById('showRecipe').click();
      var rt = document.getElementById('recipeOut').textContent;
      check('порции «абв»: сказано «не число»', /не число/.test(rt), true);
      document.getElementById('portions').value = '-2';
      document.getElementById('showRecipe').click();
      check('порции «-2»: сказано про минус', /минус не нужен/.test(document.getElementById('recipeOut').textContent), true);
    }

    // 10. дата в меню
    document.querySelector('.nav button[data-screen="menu"]').click();
    var wd = document.getElementById('weekDate');
    wd.value = 'абв';
    wd.dispatchEvent(new Event('change'));
    var me = document.getElementById('menuErr');
    check('дата меню «абв»: ошибка показана', !me.classList.contains('hidden'), true);
    check('дата меню «абв»: сказано «не дата»', /не дата/.test(me.textContent), true);
  } catch (e) { out.errors.push('исключение: ' + e.message); }
  var pre = document.createElement('pre'); pre.id = 'TESTOUT'; pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
<\/script>`;

const tmp = path.join(APP, '_input_errors_test.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
const browser = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(b => fs.existsSync(b));
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'e' + Date.now()),
    '--virtual-time-budget=6000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: тест не отработал'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: проверки ввода работают');
process.exit(res.errors.length ? 1 : 0);
