"""Plain-language scent sketches from catalog evidence, without a note timeline."""

ACCORDS = {
    "woody": "ไม้แห้งนุ่ม ๆ", "aromatic": "สมุนไพรหอมสดชื่น", "citrus": "ความสดซ่าแบบเปลือกส้ม",
    "fresh spicy": "เครื่องเทศสดที่ให้ความรู้สึกโปร่ง", "sweet": "ความหวานชัด",
    "powdery": "ความนุ่มฟุ้งคล้ายแป้ง", "fruity": "ความหอมแบบผลไม้",
    "white floral": "ความหอมของดอกไม้ขาว", "amber": "ความอุ่นลึกแบบอำพัน",
    "floral": "โทนดอกไม้", "musky": "ความนุ่มละมุนแบบมัสก์",
    "warm spicy": "เครื่องเทศอุ่น ๆ", "vanilla": "ความหวานนุ่มแบบวานิลลา",
    "green": "ความเขียวสดคล้ายใบไม้", "fresh": "ความสดชื่นโปร่ง ๆ", "rose": "โทนกุหลาบ",
    "leather": "โทนหนัง", "patchouli": "ความเขียวลึกแบบแพตชูลี",
    "lavender": "โทนลาเวนเดอร์", "earthy": "โทนคล้ายดิน", "animalic": "โทนสาบอุ่น ๆ",
    "soft spicy": "เครื่องเทศนุ่ม ๆ", "iris": "ความนุ่มคล้ายแป้งของไอริส",
    "aquatic": "ความสดโปร่งแบบละอองน้ำ", "balsamic": "ความอุ่นแบบยางไม้หอม",
    "violet": "โทนดอกไวโอเลต", "marine": "โทนไอทะเล", "tuberose": "โทนดอกซ่อนกลิ่น",
    "ozonic": "ความโปร่งคล้ายอากาศเย็น", "oud": "โทนไม้กฤษณา",
    "tobacco": "โทนใบยาสูบ", "cinnamon": "โทนอบเชย", "aldehydic": "ความซ่าโปร่งแบบอัลดีไฮด์",
    "herbal": "กลิ่นสมุนไพร", "caramel": "ความหวานคล้ายน้ำตาลเคี่ยว", "mossy": "โทนมอสชื้น",
    "almond": "ความหอมมันแบบอัลมอนด์", "smoky": "โทนควัน",
    "coconut": "ความหอมมันแบบมะพร้าว", "lactonic": "โทนครีมนม",
    "yellow floral": "โทนดอกไม้สีเหลือง", "nutty": "ความหอมมันคล้ายถั่ว",
    "tropical": "โทนผลไม้เมืองร้อน", "rum": "โทนรัม", "honey": "ความหวานแบบน้ำผึ้ง",
    "mineral": "โทนคล้ายหินและแร่", "metallic": "โทนคล้ายโลหะ", "salty": "โทนเค็มแบบไอเกลือ",
}

# Descriptors translate a recorded note, not a claim about ingredients or prominence.
NOTES = {
    "musk": ("มัสก์", "musky"), "white musk": ("ไวต์มัสก์", "musky"),
    "patchouli": ("แพตชูลี", "patchouli"), "indian patchouli": ("แพตชูลีอินเดีย", "patchouli"),
    "bergamot": ("เบอร์กามอต (ส้มกลิ่นสด)", "citrus"), "lemon": ("เลมอน", "citrus"),
    "grapefruit": ("เกรปฟรุต", "citrus"), "mandarin orange": ("ส้มแมนดาริน", "citrus"),
    "orange": ("ส้ม", "citrus"), "blood mandarin": ("ส้มแมนดารินแดง", "citrus"),
    "amber": ("อำพัน", "amber"), "ambergris": ("แอมเบอร์กริส", "marine"),
    "jasmine": ("มะลิ", "white floral"), "jasmine sambac": ("มะลิลา", "white floral"),
    "orange blossom": ("ดอกส้ม", "white floral"), "neroli": ("เนโรลี (ดอกส้ม)", "white floral"),
    "tuberose": ("ซ่อนกลิ่น", "white floral"), "lily-of-the-valley": ("ลิลลีออฟเดอะวัลเลย์", "white floral"),
    "rose": ("กุหลาบ", "rose"), "peony": ("โบตั๋น", "floral"), "freesia": ("ฟรีเซีย", "floral"),
    "magnolia": ("แมกโนเลีย", "floral"), "lavender": ("ลาเวนเดอร์", "lavender"),
    "iris": ("ไอริส", "iris"), "violet": ("ไวโอเลต", "violet"), "ylang-ylang": ("กระดังงา", "yellow floral"),
    "sandalwood": ("ไม้จันทน์หอม", "woody"), "cedar": ("ไม้ซีดาร์", "woody"),
    "virginia cedar": ("ซีดาร์เวอร์จิเนีย", "woody"), "vetiver": ("หญ้าแฝก", "earthy"),
    "guaiac wood": ("ไม้กวายัค", "woody"), "agarwood (oud)": ("ไม้กฤษณา", "oud"),
    "oakmoss": ("โอ๊กมอส", "mossy"), "leather": ("หนัง", "leather"), "incense": ("ธูปหอม", "smoky"),
    "tobacco": ("ใบยาสูบ", "tobacco"), "benzoin": ("กำยานเบนโซอิน", "balsamic"),
    "vanilla": ("วานิลลา", "vanilla"), "tonka bean": ("ถั่วตองกา", "sweet"),
    "caramel": ("คาราเมล", "caramel"), "coconut": ("มะพร้าว", "coconut"),
    "honey": ("น้ำผึ้ง", "honey"), "almond": ("อัลมอนด์", "almond"),
    "mint": ("มิ้นต์", "herbal"), "basil": ("โหระพา", "herbal"), "rosemary": ("โรสแมรี", "aromatic"),
    "green tea": ("ชาเขียว", "green"), "sea notes": ("โน้ตทะเล", "marine"),
    "sea salt": ("เกลือทะเล", "salty"), "water notes": ("โน้ตละอองน้ำ", "aquatic"),
    "cinnamon": ("อบเชย", "cinnamon"), "cardamom": ("กระวาน", "warm spicy"),
    "nutmeg": ("ลูกจันทน์เทศ", "warm spicy"), "ginger": ("ขิง", "fresh spicy"),
    "pink pepper": ("พริกไทยชมพู", "fresh spicy"), "black pepper": ("พริกไทยดำ", "fresh spicy"),
    "pear": ("ลูกแพร์", "fruity"), "peach": ("พีช", "fruity"), "apple": ("แอปเปิล", "fruity"),
    "raspberry": ("ราสป์เบอร์รี", "fruity"), "black currant": ("แบล็กเคอร์แรนต์", "fruity"),
    "pineapple": ("สับปะรด", "tropical"), "mango": ("มะม่วง", "tropical"), "plum": ("พลัม", "fruity"),
}


REDUNDANT = (
    {"sweet", "vanilla", "caramel", "honey"},
    {"floral", "white floral", "yellow floral", "rose", "tuberose", "violet"},
    {"fresh", "citrus", "aquatic", "marine", "ozonic"},
    {"powdery", "iris"},
    {"warm spicy", "cinnamon"},
    {"nutty", "almond"},
)
GENERIC = {"sweet", "floral", "fresh", "powdery", "warm spicy", "nutty"}


def scent_description(item):
    accords = sorted(item.get("accords", []), key=lambda pair: -pair[1])
    # Archived identities can have a single sourced accord and no note list.
    if not accords and item.get("accord"):
        accords = [(item["accord"], 100)]
    labels = [label for label, weight in accords if label in ACCORDS and weight >= 25]
    selected = []
    for label in labels:
        group = next((g for g in REDUNDANT if label in g), {label})
        if label in GENERIC and any(other in group - GENERIC for other in labels):
            continue
        if not group.intersection(selected):
            selected.append(label)
    selected = selected[:3]
    note_keys = [note for note in item.get("notes", []) if note in NOTES]
    accord_order = {label: i for i, label in enumerate(selected)}
    note_keys.sort(key=lambda note: accord_order.get(NOTES[note][1], len(selected)))
    notes = list(dict.fromkeys(NOTES[note][0] for note in note_keys))[:4]
    if selected:
        phrases = [ACCORDS[label] for label in selected]
        sketch = f"ภาพรวมเป็น{phrases[0]}"
        if len(phrases) > 1:
            sketch += " เสริมด้วย" + "และ".join(phrases[1:])
    elif item.get("family") or item.get("profile"):
        sketch = f"ข้อมูลระบุแนว {item.get('family') or item['profile']} แต่ยังบรรยายรายละเอียดของกลิ่นไม่ได้"
    else:
        sketch = "ยังไม่มีข้อมูลพอจะบรรยายกลิ่นของขวดนี้"
    return {"summary": sketch, "notes": notes, "tones": [ACCORDS[label] for label in selected]}


def compare_scents(items):
    """Contrast recorded tones, not intensity or the order in which notes appear."""
    if len(items) < 2:
        return None
    cards = items[:3]
    profiles = [card["scent"]["tones"] for card in cards]
    shared = [tone for tone in profiles[0] if all(tone in profile for profile in profiles[1:])]
    contrasts = []
    for index, (card, profile) in enumerate(zip(cards, profiles)):
        others = {tone for i, other in enumerate(profiles) if i != index for tone in other}
        different = [tone for tone in profile if tone not in others][:2]
        contrasts.append({"id": card["id"], "tones": different, "has_profile": bool(profile)})
    return {"contrasts": contrasts, "shared": shared[:2], "partial_set": len(items) > len(cards)}
