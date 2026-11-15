// Копирование и PDF: поведение в Telegram и в обычном браузере.
// Запуск из папки mini-app-git:  node tests/test_print_copy.cjs
'use strict';

const fs = require('fs');
const path = require('path');
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
  function vis(el) { return !!el && !el.classList.contains('hidden'); }
  function fill() {
    document.getElementById('from').value = '16.11';
    document.getElementById('b').value = '40';
    document.getElementById('l').value = '40';
    document.getElementById('d').value = '25';
    document.getElementById('calculate').click();
  }
  function setClipboard(impl) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: impl } });
  }

  try {
    fill();

    // 1. копирование работает
    setClipboard(function () { return Promise.resolve(); });
    document.getElementById('copy').click();

    setTimeout(function () {
      check('копирование: надпись «Скопировано»', document.getElementById('copy').textContent, 'Скопировано');

      // 2. буфер заблокирован — показываем текст
      setClipboard(function () { return Promise.reject(new Error('blocked')); });
      document.getElementById('copy').click();

      setTimeout(function () {
        check('буфер заблокирован: окно с текстом', vis(document.getElementById('copyBox')), true);
        check('в окне есть заказ', /Заказ на/.test(document.getElementById('copyText').value), true);
        document.getElementById('copyClose').click();

        // 3. Telegram: печать недоступна — предлагаем PDF от бота
        var botLink = '';
        window.Telegram = { WebApp: {
          ready: function () {}, expand: function () {}, close: function () {},
          openLink: function () {},
          openTelegramLink: function (u) { botLink = u; }
        } };
        setClipboard(function () { return Promise.resolve(); });
        document.getElementById('print').click();

        setTimeout(function () {
          check('Telegram: открылось окно с подсказкой', vis(document.getElementById('copyBox')), true);
          check('Telegram: сказано про PDF от бота',
            /PDF/.test(document.getElementById('copyHint').textContent), true);
          check('Telegram: видна кнопка «Открыть бота»', vis(document.getElementById('openBot')), true);
          document.getElementById('openBot').click();
          check('Telegram: открывает бота', /t\\.me\\/zakaz_produktov_bot/.test(botLink), true);

          // 4. страница печати понимает ссылку
          document.getElementById('copyClose').click();
          var bytes = new TextEncoder().encode('Заказ на 16.11.2026\\n\\nПозиций: 3');
          var bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          var hash = btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
          var frame = document.createElement('iframe');
          frame.id = 'printFrame';
          frame.src = 'print.html#d=' + hash;
          frame.style.width = '380px';
          frame.style.height = '300px';
          document.body.appendChild(frame);
          frame.onload = function () {
            try {
              var t = frame.contentDocument.getElementById('txt').textContent;
              check('страница печати прочитала заказ', /Заказ на/.test(t), true);
              check('в печати есть позиции', /Позиций:/.test(t), true);
            } catch (e) { out.errors.push('печать: ' + e.message); }
            done();
          };
          setTimeout(done, 2500);
        }, 300);
      }, 300);
    }, 300);
  } catch (e) { out.errors.push('исключение: ' + e.message); done(); }

  var finished = false;
  function done() {
    if (finished) return;
    finished = true;
    var pre = document.createElement('pre');
    pre.id = 'TESTOUT';
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  }
})();
<\/script>`;

const tmp = path.join(APP, '_print_test.html');
fs.writeFileSync(tmp, html.replace('</body>', inject + '</body>'), 'utf8');
const browser = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(b => fs.existsSync(b));
let dom = '';
try {
  dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files',
    '--user-data-dir=' + path.join(require('os').tmpdir(), 'e' + Date.now()),
    '--virtual-time-budget=9000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) { dom = (e.stdout || '').toString(); }
fs.unlinkSync(tmp);

const m = dom.match(/<pre id="TESTOUT">([\s\S]*?)<\/pre>/);
if (!m) { console.log('ПЛОХО: тест не отработал'); process.exit(1); }
const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
res.steps.forEach(s => console.log(s));
console.log(res.errors.length ? '\nИТОГ: ' + res.errors.length + ' проблем' : '\nИТОГ: копирование и PDF работают');
process.exit(res.errors.length ? 1 : 0);
