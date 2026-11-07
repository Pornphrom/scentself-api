"""Search and descriptive advice outside the frozen recommendation catalog."""
import json
import re
import unicodedata
from collections import Counter
from urllib.parse import urlsplit

from engine_v2.engine_v2 import SILLAGE_TH


def name_key(text):
    folded = unicodedata.normalize('NFKD', text.casefold())
    return ' '.join(''.join(ch for ch in folded if not unicodedata.combining(ch)).split())


def search_key(text):
    return re.sub(r'[^\w]+', ' ', name_key(text).replace('&', ' and ')).strip()


def item_label(item):
    brand, name = item['brand'], item['name']
    return name if name_key(name).startswith(name_key(brand) + ' ') else f'{brand} {name}'


class OwnedIndex:
    def __init__(self, catalog, path):
        data = json.loads(path.read_text(encoding='utf-8'))
        self.version = data['version']
        self.extra = {it['id']: it for it in data['items']}
        self.entries = []
        self.editions = {}
        all_items = [*catalog, *data['items']]
        counts = Counter(name_key(item_label(it)) for it in all_items)
        for item in all_items:
            brand, name = item['brand'], item['name']
            label = item_label(item)
            names = [label, name, *item.get('aliases', [])]
            year = data.get('years', {}).get(str(item['id']))
            if year:
                names += [f'{label} {year}', f'{name} {year}']
            edition = ''
            if counts[name_key(label)] > 1:
                match = re.search(r'-(\d+)\.html$', urlsplit(item['url']).path)
                edition = ' · '.join(filter(None, [year, f'#{match[1]}' if match else f"#{item['id']}"]))
                self.editions[item['id']] = edition
            exact = {name_key(n) for n in names}
            hay = search_key(' '.join(names))
            extra = item['id'] in self.extra
            if not extra:
                coverage = 'catalog'
            elif item['family'] or item['profile'] or item['sillage'] is not None:
                coverage = 'partial'
            else:
                coverage = 'name_only'
            self.entries.append((exact, hay, set(hay.split()), len(label),
                                 dict(id=item['id'], brand=brand, name=name, url=item['url'], edition=edition,
                                      coverage=coverage, research_eligible=not extra)))
        if len(self.entries) != len({entry[-1]['id'] for entry in self.entries}):
            raise ValueError('Duplicate wardrobe index ID')

    def search(self, query):
        q, exact_query = search_key(query), name_key(query)
        if len(q) < 2:
            return []
        words = q.split()
        hits = []
        for exact, hay, tokens, length, item in self.entries:
            same_name = exact_query in exact
            if same_name or all(any(t.startswith(w) for t in tokens) or (len(w) >= 4 and w in hay) for w in words):
                hits.append((not same_name, q not in hay, length, item['id'], {**item, 'exact_match': same_name}))
        return [hit[-1] for hit in sorted(hits)[:10]]


def describe_owned(item, families, sillage, explicit_families):
    family, strength = item['family'], item['sillage']
    reasons, cautions = [], []
    if family:
        reasons.append(f"โทน{family} จาก accord {item['accord']} ที่บันทึกไว้")
        if families:
            context = 'แนวที่เลือก' if explicit_families else 'แนวที่นิยมในโอกาสนี้'
            reasons.append(f"โทนนี้{'ตรงกับ' if family in families else 'ต่างจาก'}{context}")
    elif item['profile']:
        reasons.append(f"ตระกูลกลิ่นตามแหล่งข้อมูล: {item['profile']}")
        cautions.append('ยังไม่มีข้อมูล accords พอเทียบกับแนวกลิ่นที่เลือก')
    else:
        cautions.append('ยังไม่มีข้อมูลแนวกลิ่นสำหรับขวดนี้')
    if strength is None:
        cautions.append('ยังไม่ทราบการกระจายกลิ่น จึงเทียบระดับกลิ่นไม่ได้')
    elif sillage is not None:
        if strength == sillage:
            reasons.append(f'ระดับการกระจายกลิ่นจากโหวตตรงที่เลือก ({SILLAGE_TH[strength]})')
        else:
            cautions.append(f'การกระจายกลิ่นจากโหวตเป็น{SILLAGE_TH[strength]} ต่างจากระดับที่เลือก')
    partial = bool(family or item['profile'] or strength is not None)
    return {**{k: item[k] for k in ('id', 'brand', 'name', 'url', 'image_url')},
            'family': family or item['profile'] or 'ยังไม่ทราบแนวกลิ่น',
            'sillage': SILLAGE_TH[strength] if strength is not None else 'ยังไม่ทราบการกระจายกลิ่น',
            'sillage_estimated': False, 'reasons': reasons, 'cautions': cautions,
            'assessment': ('ดูได้เฉพาะข้อมูลที่มี ยังไม่จัดอันดับเทียบขวดอื่น' if partial
                           else 'พบชื่อรุ่น แต่ข้อมูลยังไม่พอประเมินขวดนี้'),
            'assessment_code': 'partial' if partial else 'name_only'}
