# -*- coding: utf-8 -*-
"""Сверяет расчёт заказа в боте (Python) и в приложении (JavaScript).

Обе стороны считают одни и те же дни и людей по одним данным: сначала «сырые»
суммы, потом округление. Если хоть одно число разойдётся — скрипт скажет.

Запуск из папки mini-app-git:
    python tools/check_parity.py
    python tools/check_parity.py --bot PATH --node PATH
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

SCENARIOS = [
    ('все 28 дней, 40/40/25', list(range(1, 29)), {'Завтрак': 40, 'Обед': 40, 'Ужин': 25}, 0),
    ('3 дня, 40/40/25, запас 5', [1, 2, 3], {'Завтрак': 40, 'Обед': 40, 'Ужин': 25}, 5),
    ('дни 10–20, 25/60/30, запас 3', list(range(10, 21)),
     {'Завтрак': 25, 'Обед': 60, 'Ужин': 30}, 3),
    ('один день, только обед 100', [7], {'Завтрак': 0, 'Обед': 100, 'Ужин': 0}, 0),
    ('стык цикла 28-3, 40/40/25', [28, 1, 2, 3],
     {'Завтрак': 40, 'Обед': 40, 'Ужин': 25}, 0),
    ('по дням: 15 и 16 разное число', [15, 16],
     {15: {'Завтрак': 40, 'Обед': 40, 'Ужин': 25},
      16: {'Завтрак': 35, 'Обед': 30, 'Ужин': 20}}, 0),
]

JS = r'''
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = process.argv[2];
const ctx = { window: {}, console: console, Date: Date, Math: Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'calc.js'), 'utf8'), ctx);
const A = ctx.window.APP, D = ctx.window.DATA;
const jobs = JSON.parse(process.argv[3]);
const res = jobs.map(j => ({
  raw: A.calcRaw(D.menu, D.recipes, j.days, j.people, j.reserve),
  rounded: A.calc(D.menu, D.recipes, j.days, j.people, j.reserve)
}));
process.stdout.write(JSON.stringify(res));
'''


def find_bot():
    for p in [os.environ.get('KITCHEN_BOT', ''),
              os.path.join(os.path.dirname(REPO), 'бот'),
              r'C:\Users\pchel\Desktop\Кухня\бот',
              '/opt/zakaz-bot']:
        if p and os.path.isfile(os.path.join(p, 'order_core.py')):
            return p
    return None


def find_node():
    cands = [os.environ.get('NODE_BIN', ''), shutil.which('node') or '',
             r'C:\Users\pchel\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe']
    for p in cands:
        if p and os.path.isfile(p):
            return p
    return None


def main():
    args = sys.argv[1:]
    bot = args[args.index('--bot') + 1] if '--bot' in args else find_bot()
    node = args[args.index('--node') + 1] if '--node' in args else find_node()
    if not bot:
        print('Не нашёл папку бота (--bot ПУТЬ)')
        return 1
    if not node:
        print('Не нашёл node (--node ПУТЬ)')
        return 1

    sys.path.insert(0, bot)
    import order_core as oc
    rows, rec = oc.load()

    jobs = [{'days': days, 'people': people, 'reserve': reserve}
            for _, days, people, reserve in SCENARIOS]

    js_path = os.path.join(tempfile.gettempdir(), 'parity_check.js')
    io.open(js_path, 'w', encoding='utf-8').write(JS)
    out = subprocess.run([node, js_path, REPO, json.dumps(jobs, ensure_ascii=False)],
                         capture_output=True)
    if out.returncode != 0:
        print('node упал:', out.stderr.decode('utf-8', 'replace')[:800])
        return 1
    js_results = json.loads(out.stdout.decode('utf-8'))

    problems = 0
    for (name, days, people, reserve), js in zip(SCENARIOS, js_results):
        py_raw = oc.calc_raw(rows, rec, days, people, reserve)
        py_round = oc.calc(rows, rec, days, people, reserve)
        raw_diff = [p for p in set(py_raw) | set(js['raw'])
                    if abs(py_raw.get(p, 0) - js['raw'].get(p, 0)) > 1e-9]
        round_diff = [p for p in set(py_round) | set(js['rounded'])
                      if py_round.get(p) != js['rounded'].get(p)]
        ok = not raw_diff and not round_diff
        print(('OK   ' if ok else 'ПЛОХО') + f' {name}: позиций {len(py_round)}')
        if not ok:
            problems += 1
            for p in (raw_diff + round_diff)[:10]:
                print(f'      {p}: бот {py_round.get(p)} / приложение {js["rounded"].get(p)}'
                      f' (сырые {py_raw.get(p)} / {js["raw"].get(p)})')

    print('\nИТОГ: ' + ('расчёт бота и приложения совпадает' if not problems
                        else f'{problems} расхождений'))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
