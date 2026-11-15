# -*- coding: utf-8 -*-
"""Собирает data.js для приложения из данных бота — один источник правды.

Данные живут в папке бота (menu_rows.json, recipes_final.json, cards_master.json),
разделы заказа и техкарт — в order_core.py. Этот скрипт собирает из них data.js
и заодно проверяет данные.

Запуск из папки mini-app-git:
    python tools/build_data.py              # найдёт папку бота сам
    python tools/build_data.py --bot PATH   # указать папку бота вручную
    python tools/build_data.py --check      # только проверки, data.js не трогать
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from add_out_units import fill_rows  # noqa: E402

PREFIX = 'window.DATA = '
CANDIDATES = [
    os.environ.get('KITCHEN_BOT', ''),
    os.path.join(os.path.dirname(REPO), 'бот'),          # рядом с репозиторием
    r'C:\Users\pchel\Desktop\Кухня\бот',                 # копия на рабочем столе
    '/opt/zakaz-bot',                                    # сервер
]


def find_bot():
    for p in CANDIDATES:
        if p and os.path.isfile(os.path.join(p, 'order_core.py')):
            return p
    return None


def build(bot):
    sys.path.insert(0, bot)
    import order_core as oc

    oc.load()          # заполняет UNITS и PIECE (вес штуки) из папки бота

    data_dir = os.path.join(bot, 'data')
    menu = json.loads(io.open(os.path.join(data_dir, 'menu_rows.json'), encoding='utf-8').read())
    recipes = json.loads(io.open(os.path.join(data_dir, 'recipes_final.json'), encoding='utf-8').read())
    cards = json.loads(io.open(os.path.join(data_dir, 'cards_master.json'), encoding='utf-8').read())

    changed, stats, skipped = fill_rows(menu)

    # то, что готовят сами, в заказ не идёт — вырезаем и из данных приложения
    skip_products = set(oc.SKIP_PRODUCTS)
    recipes_out = {}
    for key, r in recipes.items():
        ings = [i for i in r['ingredients'] if i['product'] not in skip_products]
        recipes_out[key] = {'display': r.get('display', ''), 'ingredients': ings}
    recipes = recipes_out

    units = {}
    for r in recipes.values():
        for ing in r['ingredients']:
            units[ing['product']] = ing['unit']

    out_cards = []
    for c in cards:
        out_cards.append({
            'page': c['page'],
            'dish': c['dish'],
            'output': c.get('output', ''),
            'per': c.get('per', 1),
            'ing': c['ing'],
        })

    data = {
        'menu': menu,
        'recipes': recipes,
        'categories': [[name, prods] for name, prods in oc.CATEGORIES],
        'units': units,
        'cards': out_cards,
        'card_categories': [[name, pages] for name, pages in oc.CARD_CATEGORIES],
        'piece_g': dict(oc.PIECE),
    }
    return data, oc, stats, skipped


def check(data, oc):
    """Проверки данных. Возвращает (ошибки, предупреждения)."""
    errors, warns = [], []

    # 1. у каждого блюда меню есть рецептура
    missing = sorted({r['dish'] for r in data['menu'] if oc.norm(r['dish']) not in data['recipes']})
    if missing:
        errors.append('блюда без рецептуры: ' + ', '.join(missing))

    # 2. продукты рецептур описаны в категориях заказа
    known = {p for _, prods in oc.CATEGORIES for p in prods}
    extra = sorted({p for p, _ in data['units'].items()} - known)
    if extra:
        warns.append('продукты вне категорий (попадут в «ПРОЧЕЕ»): ' + ', '.join(extra))

    # 3. единицы выхода на месте
    bad_units = [r['dish'] for r in data['menu']
                 if r.get('out') and not (isinstance(r.get('out_units'), list)
                                          and len(r['out_units']) == len(str(r['out']).split('/')))]
    if bad_units:
        errors.append('без единиц выхода: ' + ', '.join(sorted(set(bad_units))))

    # 4. разделы техкарт ссылаются на существующие карты
    pages = {c['page'] for c in data['cards']}
    bad_pages = sorted({p for _, lst in oc.CARD_CATEGORIES for p in lst if p not in pages})
    if bad_pages:
        errors.append('в разделах техкарт нет страниц: ' + ', '.join(map(str, bad_pages)))

    # 5. карты без выхода
    no_out = [c['dish'] for c in data['cards'] if not str(c.get('output') or '').strip()]
    if no_out:
        warns.append('техкарты без выхода: ' + ', '.join(no_out))

    return errors, warns


def main():
    args = sys.argv[1:]
    check_only = '--check' in args
    bot = args[args.index('--bot') + 1] if '--bot' in args else find_bot()
    if not bot:
        print('Не нашёл папку бота. Укажи: python tools/build_data.py --bot ПУТЬ')
        return 1

    data, oc, stats, skipped = build(bot)
    errors, warns = check(data, oc)

    print('данные бота:', bot)
    print('меню: %d строк, рецептур: %d, техкарт: %d, продуктов: %d'
          % (len(data['menu']), len(data['recipes']), len(data['cards']), len(data['units'])))
    print('единицы выхода:', ', '.join(f'{k} — {v}' for k, v in sorted(stats.items())))
    if skipped:
        print('без единиц (оставлены как есть):', len(skipped))
    for w in warns:
        print('ПРЕДУПРЕЖДЕНИЕ:', w)
    for e in errors:
        print('ОШИБКА:', e)
    if errors:
        print('\nНе собираю data.js: сначала исправь ошибки выше')
        return 1
    if check_only:
        print('\nПроверки пройдены (файл не тронут)')
        return 0

    text = PREFIX + json.dumps(data, ensure_ascii=False) + ';'
    path = os.path.join(REPO, 'data.js')
    old = io.open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if text == old:
        print('\ndata.js уже совпадает с данными бота')
    else:
        io.open(path, 'w', encoding='utf-8', newline='').write(text)
        print('\ndata.js пересобран: %d символов -> %d' % (len(old), len(text)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
