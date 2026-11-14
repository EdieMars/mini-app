# -*- coding: utf-8 -*-
"""Проставляет единицы выхода (г / мл / шт) прямо в данные — data.js.

Зачем: раньше «мл» для компота, чая и кофе вычислялось в index.html по названию
блюда. Любое новое блюдо (какао, кисель, сок) показалось бы в граммах. Теперь
единица лежит в данных: menu[].out_units — по одной на каждую часть поля out
(части разделены «/»).

Запускать из папки mini-app-git:
    python tools/add_out_units.py

Скрипт идемпотентный: повторный запуск не меняет результат.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(os.path.dirname(HERE), 'data.js')
PREFIX = 'window.DATA = '


def units_for(dish, out):
    """Возвращает (единицы по частям, нормализованный out).

    ('Каша овсяная', '250')        -> (['г'], '250')
    ('Кофе с молоком', '3/50')     -> (['г', 'мл'], '3/50')
    ('Вафли', '3шт')               -> (['шт'], '3')
    ('Суп', '420 гр.')             -> (None, '420 гр.')  — единица уже в тексте
    """
    s = str(out or '').strip()
    if not s:
        return None, s

    m = re.fullmatch(r'(\d+)\s*шт\.?', s, re.I)
    if m:
        return ['шт'], m.group(1)

    if re.search(r'[а-яёa-z]', s, re.I):
        return None, s

    parts = s.split('/')
    key = re.sub(r'\s+', ' ', str(dish).lower().replace('ё', 'е')).strip()
    if key.startswith(('компот', 'чай')):
        ml = {0}
    elif key.startswith('кофе'):
        ml = {1}          # «3/50» = 3 г кофе + 50 мл молока
    else:
        ml = set()
    return ['мл' if i in ml else 'г' for i in range(len(parts))], s


def fill_rows(rows):
    """Проставляет out_units в список строк меню. Возвращает (сколько изменилось, статистика, пропуски)."""
    stats = {}
    changed = 0
    skipped = []
    for row in rows:
        parts = str(row.get('out', '')).split('/')
        have = row.get('out_units')
        # уже проставленные единицы не трогаем: из «3» шт. обратно не вывести
        if have and len(have) == len(parts):
            key = '+'.join(have)
            stats[key] = stats.get(key, 0) + 1
            continue

        units, out = units_for(row.get('dish'), row.get('out'))
        if units is None:
            skipped.append(row.get('dish'))
            continue
        if row.get('out') != out or row.get('out_units') != units:
            changed += 1
        row['out'] = out
        row['out_units'] = units
        key = '+'.join(units)
        stats[key] = stats.get(key, 0) + 1
    return changed, stats, skipped


def add_units_to_menu_json(path):
    """То же для menu_rows.json (данные бота). Формат файла сохраняем: отступ 1."""
    text = io.open(path, encoding='utf-8').read()
    data = json.loads(text)
    rows = data['menu'] if isinstance(data, dict) else data
    changed, stats, skipped = fill_rows(rows)
    new_text = json.dumps(data, ensure_ascii=False, indent=1)
    if text.endswith('\n'):
        new_text += '\n'
    if new_text == text:
        print(path + ': всё уже на месте')
    else:
        io.open(path, 'w', encoding='utf-8', newline='').write(new_text)
        print(path + ': строк изменено ' + str(changed))
    print('единицы:', ', '.join(f'{k} — {v}' for k, v in sorted(stats.items())))
    print('строк без единиц (оставлены как есть):', len(skipped))
    return 0


def main():
    if '--menu-json' in sys.argv:
        return add_units_to_menu_json(sys.argv[sys.argv.index('--menu-json') + 1])

    text = io.open(PATH, encoding='utf-8').read()
    if not (text.startswith(PREFIX) and text.rstrip().endswith(';')):
        print('Не похоже на data.js: неожиданное начало или конец файла')
        return 1

    data = json.loads(text[len(PREFIX):].rstrip()[:-1])
    changed, stats, skipped = fill_rows(data['menu'])

    new_text = PREFIX + json.dumps(data, ensure_ascii=False) + ';'
    if new_text == text:
        print('Всё уже на месте, файл не менялся')
    else:
        io.open(PATH, 'w', encoding='utf-8', newline='').write(new_text)
        print('data.js обновлён: строк изменено', changed)

    print('единицы:', ', '.join(f'{k} — {v}' for k, v in sorted(stats.items())))
    print('строк без единиц (оставлены как есть):', len(skipped))
    for d in sorted(set(skipped))[:10]:
        print('   -', d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
