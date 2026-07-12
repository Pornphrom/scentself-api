# scentself.py
# ScentSelf — Full Pipeline (Single File)
# NIDA MADT IS · Palaloy
#
# รันทดสอบ: python scentself.py
# ต้องตั้งค่า: set GEMINI_API_KEY=...  (Windows)
#              export GEMINI_API_KEY=... (Mac/Linux)
#
# Pipeline ที่แปลงจาก JavaScript ใน HTML mockup มาเป็น Python:
#   JS updateDna()        →  build_scent_dna()
#   JS score (hardcoded)  →  score_fragrances()  ← cosine similarity จริง
#   JS mock reasons       →  explain_with_gemini() ← Gemini API จริง

import json
import math
import os
from typing import List, Dict, Any, Optional


# ══════════════════════════════════════════════════════════════════════════════
# 1. FRAGRANCE DATABASE — 53 รายการ แบ่ง 6 กลุ่มกลิ่น
# ══════════════════════════════════════════════════════════════════════════════

FAMILY_ORDER = [
    "Floral",
    "Fresh/Citrus",
    "Woody/Aromatic",
    "Amber/Spicy",
    "Gourmand/Fruity",
    "Aquatic/Marine",
]

FRAGRANCES: List[Dict[str, Any]] = [

    # ── FLORAL (9 items) ───────────────────────────────────────────────────
    {
        "id": 1, "name": "Chloé EDP", "brand": "Chloé",
        "family": "Floral", "price": 3800, "gender": "F",
        "notes": ["rose", "peony", "magnolia", "cedar"],
        "occasion": ["ทำงาน", "งาน", "เดต"],
        "mood": ["เรียบร้อย", "หวาน", "อ่อนโยน"],
        "intensity": "moderate",
    },
    {
        "id": 2, "name": "Miss Dior Blooming Bouquet EDT", "brand": "Dior",
        "family": "Floral", "price": 4200, "gender": "F",
        "notes": ["peony", "rose", "white musk"],
        "occasion": ["ทำงาน", "งาน", "ทุกวัน"],
        "mood": ["เรียบร้อย", "อ่อนโยน", "สะอาด"],
        "intensity": "light",
    },
    {
        "id": 3, "name": "Chance Eau Tendre EDP", "brand": "Chanel",
        "family": "Floral", "price": 5500, "gender": "F",
        "notes": ["grapefruit", "jasmine", "rose", "white musk"],
        "occasion": ["ทำงาน", "ทุกวัน", "เดต"],
        "mood": ["สะอาด", "สดชื่น", "หวาน"],
        "intensity": "light",
    },
    {
        "id": 4, "name": "Daisy EDT", "brand": "Marc Jacobs",
        "family": "Floral", "price": 2800, "gender": "F",
        "notes": ["strawberry", "violet", "jasmine", "musk"],
        "occasion": ["ทุกวัน", "เดต"],
        "mood": ["สดใส", "หวาน", "สบาย"],
        "intensity": "light",
    },
    {
        "id": 5, "name": "Flowerbomb EDP", "brand": "Viktor&Rolf",
        "family": "Floral", "price": 4500, "gender": "F",
        "notes": ["jasmine", "rose", "orchid", "patchouli"],
        "occasion": ["เดต", "งาน", "กลางคืน"],
        "mood": ["น่าค้นหา", "หวาน", "มั่นใจ"],
        "intensity": "heavy",
    },
    {
        "id": 6, "name": "La Vie Est Belle EDP", "brand": "Lancôme",
        "family": "Floral", "price": 3500, "gender": "F",
        "notes": ["iris", "patchouli", "praline", "vanilla"],
        "occasion": ["ทุกวัน", "งาน", "เดต"],
        "mood": ["อบอุ่น", "หวาน", "เรียบร้อย"],
        "intensity": "moderate",
    },
    {
        "id": 7, "name": "Peony & Blush Suede", "brand": "Jo Malone",
        "family": "Floral", "price": 5200, "gender": "U",
        "notes": ["peony", "rose", "red apple", "suede"],
        "occasion": ["ทุกวัน", "งาน", "เดต"],
        "mood": ["นุ่มนวล", "อ่อนโยน", "สะอาด"],
        "intensity": "light",
    },
    {
        "id": 8, "name": "Si EDP", "brand": "Giorgio Armani",
        "family": "Floral", "price": 4800, "gender": "F",
        "notes": ["blackcurrant", "rose", "vanilla", "musk"],
        "occasion": ["ทำงาน", "งาน", "เดต"],
        "mood": ["มั่นใจ", "เรียบเท่", "หวาน"],
        "intensity": "moderate",
    },
    {
        "id": 9, "name": "Mon Paris EDP", "brand": "YSL",
        "family": "Floral", "price": 4200, "gender": "F",
        "notes": ["white datura", "peony", "rose", "musk"],
        "occasion": ["เดต", "งาน"],
        "mood": ["โรแมนติก", "หวาน", "น่าค้นหา"],
        "intensity": "moderate",
    },

    # ── FRESH / CITRUS (9 items) ───────────────────────────────────────────
    {
        "id": 10, "name": "Light Blue EDT", "brand": "Dolce&Gabbana",
        "family": "Fresh/Citrus", "price": 3200, "gender": "F",
        "notes": ["apple", "cedar", "bamboo", "white rose"],
        "occasion": ["ทุกวัน", "ทำงาน", "เดต"],
        "mood": ["สะอาด", "สดชื่น", "เบาสบาย"],
        "intensity": "light",
    },
    {
        "id": 11, "name": "Acqua di Gio EDT", "brand": "Giorgio Armani",
        "family": "Fresh/Citrus", "price": 3800, "gender": "M",
        "notes": ["bergamot", "neroli", "jasmine", "cedar"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "สดชื่น", "ธรรมชาติ"],
        "intensity": "light",
    },
    {
        "id": 12, "name": "L'Eau d'Issey pour Femme EDT", "brand": "Issey Miyake",
        "family": "Fresh/Citrus", "price": 2500, "gender": "F",
        "notes": ["lotus", "rose", "musk", "cedarwood"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "เบาสบาย", "เรียบง่าย"],
        "intensity": "light",
    },
    {
        "id": 13, "name": "CK One EDT", "brand": "Calvin Klein",
        "family": "Fresh/Citrus", "price": 1400, "gender": "U",
        "notes": ["bergamot", "papaya", "jasmine", "musk"],
        "occasion": ["ทุกวัน"],
        "mood": ["สะอาด", "สดใส", "เรียบง่าย"],
        "intensity": "light",
    },
    {
        "id": 14, "name": "Versace Pour Homme EDT", "brand": "Versace",
        "family": "Fresh/Citrus", "price": 2800, "gender": "M",
        "notes": ["lemon", "neroli", "cedar", "musk"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "มั่นใจ", "สดชื่น"],
        "intensity": "moderate",
    },
    {
        "id": 15, "name": "Cool Water EDT", "brand": "Davidoff",
        "family": "Fresh/Citrus", "price": 1200, "gender": "M",
        "notes": ["seawater", "mint", "jasmine", "cedar"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สดชื่น", "สะอาด", "เบาสบาย"],
        "intensity": "moderate",
    },
    {
        "id": 16, "name": "Green Tea EDT", "brand": "Elizabeth Arden",
        "family": "Fresh/Citrus", "price": 900, "gender": "F",
        "notes": ["green tea", "bergamot", "jasmine", "oakmoss"],
        "occasion": ["ทุกวัน"],
        "mood": ["สะอาด", "เบาสบาย", "ธรรมชาติ"],
        "intensity": "light",
    },
    {
        "id": 17, "name": "Bright Crystal EDT", "brand": "Versace",
        "family": "Fresh/Citrus", "price": 3200, "gender": "F",
        "notes": ["pomegranate", "yuzu", "peony", "musk"],
        "occasion": ["ทุกวัน", "ทำงาน", "เดต"],
        "mood": ["สดใส", "หวาน", "สะอาด"],
        "intensity": "light",
    },
    {
        "id": 18, "name": "Escape for Men EDT", "brand": "Calvin Klein",
        "family": "Fresh/Citrus", "price": 1800, "gender": "M",
        "notes": ["sage", "basil", "spearmint", "cedar"],
        "occasion": ["ทุกวัน", "ท่องเที่ยว"],
        "mood": ["สดชื่น", "เบาสบาย", "ธรรมชาติ"],
        "intensity": "light",
    },

    # ── WOODY / AROMATIC (9 items) ─────────────────────────────────────────
    {
        "id": 19, "name": "Bleu de Chanel EDP", "brand": "Chanel",
        "family": "Woody/Aromatic", "price": 5500, "gender": "M",
        "notes": ["grapefruit", "incense", "vetiver", "cedar"],
        "occasion": ["ทำงาน", "งาน", "เดต"],
        "mood": ["เรียบเท่", "มั่นใจ", "น่าเชื่อถือ"],
        "intensity": "moderate",
    },
    {
        "id": 20, "name": "Explorer EDT", "brand": "Montblanc",
        "family": "Woody/Aromatic", "price": 2200, "gender": "M",
        "notes": ["bergamot", "vetiver", "oakmoss", "musk"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["น่าเชื่อถือ", "สุขุม", "เบาสบาย"],
        "intensity": "moderate",
    },
    {
        "id": 21, "name": "Sauvage EDT", "brand": "Dior",
        "family": "Woody/Aromatic", "price": 4800, "gender": "M",
        "notes": ["bergamot", "ambroxan", "cedar"],
        "occasion": ["ทำงาน", "งาน", "เดต"],
        "mood": ["เรียบเท่", "มั่นใจ", "น่าค้นหา"],
        "intensity": "moderate",
    },
    {
        "id": 22, "name": "Terre d'Hermès EDT", "brand": "Hermès",
        "family": "Woody/Aromatic", "price": 5200, "gender": "M",
        "notes": ["grapefruit", "flint", "vetiver", "cedar"],
        "occasion": ["ทำงาน", "งาน"],
        "mood": ["สุขุม", "เรียบเท่", "น่าเชื่อถือ"],
        "intensity": "moderate",
    },
    {
        "id": 23, "name": "Dior Homme Intense EDP", "brand": "Dior",
        "family": "Woody/Aromatic", "price": 4500, "gender": "M",
        "notes": ["iris", "lavender", "cedar", "patchouli"],
        "occasion": ["เดต", "งาน"],
        "mood": ["น่าค้นหา", "หรูหรา", "มั่นใจ"],
        "intensity": "heavy",
    },
    {
        "id": 24, "name": "Bvlgari Man Wood Neroli EDP", "brand": "Bvlgari",
        "family": "Woody/Aromatic", "price": 3800, "gender": "M",
        "notes": ["neroli", "cypress", "vetiver", "musk"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "สดชื่น", "สุขุม"],
        "intensity": "moderate",
    },
    {
        "id": 25, "name": "Polo Black EDT", "brand": "Ralph Lauren",
        "family": "Woody/Aromatic", "price": 2200, "gender": "M",
        "notes": ["mango", "patchouli", "sandalwood", "musk"],
        "occasion": ["ทุกวัน", "กลางคืน"],
        "mood": ["น่าค้นหา", "เรียบเท่"],
        "intensity": "moderate",
    },
    {
        "id": 26, "name": "Gentleman Reserve Privée EDP", "brand": "Givenchy",
        "family": "Woody/Aromatic", "price": 6500, "gender": "M",
        "notes": ["iris", "leather", "sandalwood", "vanilla"],
        "occasion": ["งาน", "เดต"],
        "mood": ["หรูหรา", "มั่นใจ", "น่าค้นหา"],
        "intensity": "heavy",
    },
    {
        "id": 27, "name": "The One EDT", "brand": "Dolce&Gabbana",
        "family": "Woody/Aromatic", "price": 3800, "gender": "M",
        "notes": ["cardamom", "ginger", "tobacco", "amber"],
        "occasion": ["เดต", "งาน"],
        "mood": ["น่าค้นหา", "อบอุ่น", "มั่นใจ"],
        "intensity": "heavy",
    },

    # ── AMBER / SPICY (9 items) ────────────────────────────────────────────
    {
        "id": 28, "name": "Black Opium EDP", "brand": "YSL",
        "family": "Amber/Spicy", "price": 4500, "gender": "F",
        "notes": ["coffee", "vanilla", "white flowers"],
        "occasion": ["เดต", "กลางคืน", "งาน"],
        "mood": ["น่าค้นหา", "มั่นใจ", "กล้า"],
        "intensity": "heavy",
    },
    {
        "id": 29, "name": "1 Million EDP", "brand": "Paco Rabanne",
        "family": "Amber/Spicy", "price": 3800, "gender": "M",
        "notes": ["cinnamon", "rose", "amber", "leather"],
        "occasion": ["เดต", "กลางคืน", "งาน"],
        "mood": ["มั่นใจ", "น่าค้นหา", "กล้า"],
        "intensity": "heavy",
    },
    {
        "id": 30, "name": "Alien EDP", "brand": "Mugler",
        "family": "Amber/Spicy", "price": 4800, "gender": "F",
        "notes": ["jasmine", "cashmeran wood", "amber"],
        "occasion": ["งาน", "เดต"],
        "mood": ["ล้ำ", "มั่นใจ", "น่าค้นหา"],
        "intensity": "heavy",
    },
    {
        "id": 31, "name": "La Nuit de L'Homme EDT", "brand": "YSL",
        "family": "Amber/Spicy", "price": 3800, "gender": "M",
        "notes": ["cardamom", "cedar", "coumarin"],
        "occasion": ["เดต", "กลางคืน"],
        "mood": ["โรแมนติก", "น่าค้นหา", "อบอุ่น"],
        "intensity": "moderate",
    },
    {
        "id": 32, "name": "Invictus EDT", "brand": "Paco Rabanne",
        "family": "Amber/Spicy", "price": 3200, "gender": "M",
        "notes": ["grapefruit", "marine accord", "ambergris", "guaiac wood"],
        "occasion": ["ทุกวัน", "งาน"],
        "mood": ["มั่นใจ", "สดชื่น", "กล้า"],
        "intensity": "moderate",
    },
    {
        "id": 33, "name": "Phantom EDT", "brand": "Paco Rabanne",
        "family": "Amber/Spicy", "price": 3800, "gender": "M",
        "notes": ["lemon", "lavender", "vanilla", "wood"],
        "occasion": ["ทุกวัน", "งาน"],
        "mood": ["ล้ำ", "สดชื่น", "อบอุ่น"],
        "intensity": "moderate",
    },
    {
        "id": 34, "name": "Good Girl EDP", "brand": "Carolina Herrera",
        "family": "Amber/Spicy", "price": 4200, "gender": "F",
        "notes": ["jasmine", "tuberose", "cocoa", "sandalwood"],
        "occasion": ["เดต", "งาน", "กลางคืน"],
        "mood": ["น่าค้นหา", "มั่นใจ", "หวาน"],
        "intensity": "heavy",
    },
    {
        "id": 35, "name": "Scandal EDP", "brand": "Jean Paul Gaultier",
        "family": "Amber/Spicy", "price": 3800, "gender": "F",
        "notes": ["blood orange", "gardenia", "honey", "vanilla"],
        "occasion": ["เดต", "งาน"],
        "mood": ["โรแมนติก", "หวาน", "น่าค้นหา"],
        "intensity": "heavy",
    },
    {
        "id": 36, "name": "Si Intense EDP", "brand": "Giorgio Armani",
        "family": "Amber/Spicy", "price": 5000, "gender": "F",
        "notes": ["blackcurrant", "rose", "patchouli", "vanilla"],
        "occasion": ["เดต", "งาน"],
        "mood": ["มั่นใจ", "น่าค้นหา", "หรูหรา"],
        "intensity": "heavy",
    },

    # ── GOURMAND / FRUITY (9 items) ────────────────────────────────────────
    {
        "id": 37, "name": "La Petite Robe Noire EDP", "brand": "Guerlain",
        "family": "Gourmand/Fruity", "price": 3800, "gender": "F",
        "notes": ["rose", "black cherry", "almond", "vanilla"],
        "occasion": ["เดต", "งาน"],
        "mood": ["หวาน", "น่าค้นหา", "โรแมนติก"],
        "intensity": "moderate",
    },
    {
        "id": 38, "name": "Be Delicious EDP", "brand": "DKNY",
        "family": "Gourmand/Fruity", "price": 2200, "gender": "F",
        "notes": ["green apple", "rose", "sandalwood", "musk"],
        "occasion": ["ทุกวัน", "เดต"],
        "mood": ["สดใส", "สดชื่น", "หวาน"],
        "intensity": "moderate",
    },
    {
        "id": 39, "name": "Narciso EDP", "brand": "Narciso Rodriguez",
        "family": "Gourmand/Fruity", "price": 4200, "gender": "F",
        "notes": ["orange blossom", "amber", "musk", "vetiver"],
        "occasion": ["ทำงาน", "ทุกวัน", "เดต"],
        "mood": ["นุ่มนวล", "สะอาด", "หวาน"],
        "intensity": "moderate",
    },
    {
        "id": 40, "name": "Miu Miu EDP", "brand": "Miu Miu",
        "family": "Gourmand/Fruity", "price": 3500, "gender": "F",
        "notes": ["lily of the valley", "iris", "musk"],
        "occasion": ["ทุกวัน", "งาน"],
        "mood": ["อ่อนโยน", "สะอาด", "น่ารัก"],
        "intensity": "light",
    },
    {
        "id": 41, "name": "Viva la Juicy EDP", "brand": "Juicy Couture",
        "family": "Gourmand/Fruity", "price": 2800, "gender": "F",
        "notes": ["mandarin", "honeysuckle", "jasmine", "vanilla"],
        "occasion": ["ทุกวัน", "เดต"],
        "mood": ["สดใส", "หวาน", "สบาย"],
        "intensity": "moderate",
    },
    {
        "id": 42, "name": "Princess EDT", "brand": "Vera Wang",
        "family": "Gourmand/Fruity", "price": 1800, "gender": "F",
        "notes": ["water lily", "apple", "apricot", "tuberose"],
        "occasion": ["ทุกวัน"],
        "mood": ["สดใส", "หวาน", "น่ารัก"],
        "intensity": "light",
    },
    {
        "id": 43, "name": "J'adore EDP", "brand": "Dior",
        "family": "Gourmand/Fruity", "price": 5200, "gender": "F",
        "notes": ["ylang-ylang", "rose", "jasmine", "peach"],
        "occasion": ["งาน", "เดต"],
        "mood": ["หรูหรา", "หวาน", "มั่นใจ"],
        "intensity": "heavy",
    },
    {
        "id": 44, "name": "Olympéa EDP", "brand": "Paco Rabanne",
        "family": "Gourmand/Fruity", "price": 3500, "gender": "F",
        "notes": ["grapefruit", "salted vanilla", "musk"],
        "occasion": ["ทุกวัน", "งาน"],
        "mood": ["มั่นใจ", "หวาน", "สดชื่น"],
        "intensity": "moderate",
    },
    {
        "id": 45, "name": "Idôle EDP", "brand": "Lancôme",
        "family": "Gourmand/Fruity", "price": 3800, "gender": "F",
        "notes": ["rose", "jasmine", "musk", "cedarwood"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "อ่อนโยน", "สดชื่น"],
        "intensity": "light",
    },

    # ── AQUATIC / MARINE (8 items) ─────────────────────────────────────────
    {
        "id": 46, "name": "Acqua di Gio Profumo EDP", "brand": "Giorgio Armani",
        "family": "Aquatic/Marine", "price": 6500, "gender": "M",
        "notes": ["marine accord", "bergamot", "incense", "vetiver"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "สุขุม", "เรียบเท่"],
        "intensity": "moderate",
    },
    {
        "id": 47, "name": "Aqva Pour Homme EDT", "brand": "Bvlgari",
        "family": "Aquatic/Marine", "price": 3200, "gender": "M",
        "notes": ["posidonia", "cyclamen", "woody notes"],
        "occasion": ["ทุกวัน", "ทำงาน", "กีฬา"],
        "mood": ["สดชื่น", "สะอาด", "เบาสบาย"],
        "intensity": "light",
    },
    {
        "id": 48, "name": "L'Eau par Kenzo EDT", "brand": "Kenzo",
        "family": "Aquatic/Marine", "price": 2500, "gender": "F",
        "notes": ["white flower", "aquatic accord", "musk"],
        "occasion": ["ทุกวัน"],
        "mood": ["สะอาด", "สดชื่น", "เบาสบาย"],
        "intensity": "light",
    },
    {
        "id": 49, "name": "Blue Seduction EDT", "brand": "Antonio Banderas",
        "family": "Aquatic/Marine", "price": 800, "gender": "M",
        "notes": ["violet", "fig", "sandalwood", "amber"],
        "occasion": ["ทุกวัน"],
        "mood": ["สดชื่น", "เบาสบาย", "สะอาด"],
        "intensity": "light",
    },
    {
        "id": 50, "name": "Nautica Voyage EDT", "brand": "Nautica",
        "family": "Aquatic/Marine", "price": 1200, "gender": "M",
        "notes": ["apple", "mimosa", "lotus", "cedar"],
        "occasion": ["ทุกวัน", "กีฬา"],
        "mood": ["สดชื่น", "สะอาด", "เบาสบาย"],
        "intensity": "light",
    },
    {
        "id": 51, "name": "H24 EDT", "brand": "Hermès",
        "family": "Aquatic/Marine", "price": 5200, "gender": "M",
        "notes": ["sage", "clary sage", "narcissus", "wood"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "สดชื่น", "สุขุม"],
        "intensity": "moderate",
    },
    {
        "id": 52, "name": "Chrome EDT", "brand": "Azzaro",
        "family": "Aquatic/Marine", "price": 1800, "gender": "M",
        "notes": ["bergamot", "neroli", "pineapple", "sandalwood"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สดชื่น", "สะอาด", "เบาสบาย"],
        "intensity": "light",
    },
    {
        "id": 53, "name": "Blue EDT", "brand": "Givenchy",
        "family": "Aquatic/Marine", "price": 3500, "gender": "M",
        "notes": ["sea notes", "labdanum", "cedar"],
        "occasion": ["ทุกวัน", "ทำงาน"],
        "mood": ["สะอาด", "สดชื่น", "เรียบเท่"],
        "intensity": "moderate",
    },
]


# ══════════════════════════════════════════════════════════════════════════════
# 2. BUILD SCENT DNA
#    แทน JS updateDna() — แปลง user selections → weight ของแต่ละ scent family
# ══════════════════════════════════════════════════════════════════════════════

# ตัวเลือก scent family จาก Step 2 → ชื่อ family จริงในฐานข้อมูล
_FAMILY_MAP = {
    "Fresh":    "Fresh/Citrus",
    "Floral":   "Floral",
    "Woody":    "Woody/Aromatic",
    "Aquatic":  "Aquatic/Marine",
    "Amber":    "Amber/Spicy",
    "Gourmand": "Gourmand/Fruity",
}

# occasion → กลุ่มกลิ่นที่เสริมให้
_OCCASION_BOOST = {
    "ทำงาน":     {"Fresh/Citrus": 0.25, "Floral": 0.15},
    "เดต":       {"Floral": 0.20, "Amber/Spicy": 0.20, "Gourmand/Fruity": 0.10},
    "ออกงาน":    {"Floral": 0.15, "Woody/Aromatic": 0.15, "Amber/Spicy": 0.10},
    "ทุกวัน":    {"Fresh/Citrus": 0.25, "Floral": 0.10},
    "ท่องเที่ยว": {"Fresh/Citrus": 0.20, "Aquatic/Marine": 0.20},
}

# mood → กลุ่มกลิ่นที่เสริมให้
_MOOD_BOOST = {
    "สะอาด":     {"Fresh/Citrus": 0.15},
    "เรียบง่าย":  {"Fresh/Citrus": 0.10, "Floral": 0.05},
    "อบอุ่น":    {"Amber/Spicy": 0.15, "Gourmand/Fruity": 0.10},
    "มั่นใจ":    {"Woody/Aromatic": 0.10, "Amber/Spicy": 0.10},
    "สดใส":      {"Fresh/Citrus": 0.15, "Floral": 0.10},
    "น่าค้นหา":  {"Amber/Spicy": 0.15, "Woody/Aromatic": 0.10},
}


def build_scent_dna(
    scent_family: List[str],
    occasion: str,
    mood: List[str],
) -> Dict[str, float]:
    """
    Step 3 ของ TO-BE flow: Build Scent Attributes
    รับ user selections → คืน DNA weight vector ของแต่ละ family (0.0–1.0)
    """
    dna = {f: 0.0 for f in FAMILY_ORDER}

    # primary: จาก scent_family ที่ผู้ใช้เลือก
    for choice in scent_family:
        if choice == "Not sure":
            continue
        family = _FAMILY_MAP.get(choice)
        if family:
            dna[family] += 0.60

    # boost จาก occasion
    for family, boost in _OCCASION_BOOST.get(occasion, {}).items():
        dna[family] = min(1.0, dna[family] + boost)

    # boost จาก mood
    for m in mood:
        for family, boost in _MOOD_BOOST.get(m, {}).items():
            dna[family] = min(1.0, dna[family] + boost)

    # fallback ถ้า user กด "Not sure" ทั้งหมด
    if sum(dna.values()) == 0:
        dna["Fresh/Citrus"] = 0.50
        dna["Floral"] = 0.30

    # normalize ให้ค่าสูงสุด = 1.0
    max_val = max(dna.values())
    if max_val > 0:
        dna = {k: round(v / max_val, 3) for k, v in dna.items()}

    return dna


# ══════════════════════════════════════════════════════════════════════════════
# 3. SCORE FRAGRANCES — Cosine Similarity
#    Step 4: Match Situation
#    แทน JS renderPerfumes() ที่ใช้ hardcoded mock perfumes
# ══════════════════════════════════════════════════════════════════════════════

def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    dot   = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a ** 2 for a in vec_a))
    norm_b = math.sqrt(sum(b ** 2 for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def score_fragrances(
    dna: Dict[str, float],
    occasion: str,
    budget: int,
    top_n: int = 6,
) -> List[Dict[str, Any]]:
    """
    Step 4: Match Situation
    คำนวณ cosine similarity ระหว่าง Scent DNA กับ fragrance vector
    กรอง budget → เรียง score → คืน top_n candidates
    """
    user_vec = [dna.get(f, 0.0) for f in FAMILY_ORDER]

    scored = []
    for frag in FRAGRANCES:
        # กรอง budget (ยืดหยุ่น 15%)
        if frag["price"] > budget * 1.15:
            continue

        # one-hot vector ตาม family
        frag_vec = [0.0] * len(FAMILY_ORDER)
        if frag["family"] in FAMILY_ORDER:
            frag_vec[FAMILY_ORDER.index(frag["family"])] = 1.0

        sim = _cosine_similarity(user_vec, frag_vec)
        occasion_bonus = 0.12 if occasion in frag.get("occasion", []) else 0.0
        total = round(sim + occasion_bonus, 4)

        scored.append({**frag, "similarity_score": total})

    scored.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
# 4. EXPLAIN WITH GEMINI API
#    Step 5–6: Recommend Top 3 + Explain Fit
#    แทน hardcoded reasons ใน JS — ใช้ Gemini API จริง ตอบภาษาไทย
# ══════════════════════════════════════════════════════════════════════════════

_SYSTEM_PROMPT = """\
คุณคือ Senna ที่ปรึกษาน้ำหอม AI สำหรับ ScentSelf — ระบบ prototype วิจัย IS ของ NIDA MADT

งานของคุณ: เลือก TOP 3 น้ำหอมจาก candidates และอธิบายเหตุผลเป็นภาษาไทย

กฎสำคัญ:
- ตอบเป็น JSON เท่านั้น ไม่มี markdown ไม่มีข้อความนอก JSON
- ฟิลด์ข้อความทั้งหมดต้องเป็นภาษาไทย
- match_score อยู่ระหว่าง 65–97 และลดลงตาม rank
- เลือกเฉพาะจาก candidates ที่ให้มา

รูปแบบ JSON ที่ต้องส่งกลับ:
{
  "top3": [
    {
      "rank": 1,
      "id": <int>,
      "name": "<ชื่อ>",
      "brand": "<แบรนด์>",
      "family": "<กลุ่มกลิ่น>",
      "price": <int>,
      "match_score": <int>,
      "reason": "<ประโยคภาษาไทย — ทำไมถึงเหมาะกับผู้ใช้คนนี้>",
      "fit_tags": ["<tag>", "<tag>", "<tag>"],
      "explanation": {
        "scent_fit": "<ภาษาไทย>",
        "situation_fit": "<ภาษาไทย>",
        "style_fit": "<ภาษาไทย>"
      }
    }
  ],
  "advisor_note": "<ภาษาไทย — สรุป 1 ประโยค>"
}
"""


def explain_with_gemini(
    candidates: List[Dict[str, Any]],
    dna: Dict[str, float],
    occasion: str,
    mood: List[str],
    lifestyle: List[str],
    outfit_description: str,
    budget: int,
    for_whom: str,
    api_key: str,
) -> Dict[str, Any]:
    """
    Step 5–6: Recommend Top 3 + Explain Fit
    ส่ง candidates + user context ไปให้ Gemini เลือก Top 3 พร้อม explanation ภาษาไทย
    """
    from google import genai  # import ที่นี่เพื่อ optional dependency
    from google.genai import types

    dna_summary = ", ".join(
        f"{k}: {round(v * 100)}%"
        for k, v in sorted(dna.items(), key=lambda x: -x[1])
        if v > 0.05
    )

    user_context = f"""
PROFILE:
- ซื้อสำหรับ: {for_whom}
- โอกาส: {occasion}
- Mood: {', '.join(mood) if mood else 'ไม่ระบุ'}
- ไลฟ์สไตล์: {', '.join(lifestyle) if lifestyle else 'ไม่ระบุ'}
- Outfit/บริบท: {outfit_description or 'ไม่ระบุ'}
- งบประมาณ: ฿{budget:,}
- Scent DNA: {dna_summary}

CANDIDATES (จาก cosine similarity):
{json.dumps(candidates, ensure_ascii=False, indent=2)}

เลือก TOP 3 และอธิบายเป็นภาษาไทย
"""

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents=user_context,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            response_mime_type="application/json",
            max_output_tokens=4096,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )

    raw = response.text.strip()
    # ลบ markdown code fence เผื่อ Gemini ใส่มาด้วย
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()

    return json.loads(raw)


# ══════════════════════════════════════════════════════════════════════════════
# 5. FULL PIPELINE
#    รัน 3 ขั้นตอนต่อเนื่อง: DNA → Score → Gemini Explain
# ══════════════════════════════════════════════════════════════════════════════

def run_pipeline(
    for_whom: str = "ใช้เอง",
    lifestyle: Optional[List[str]] = None,
    budget: int = 4000,
    occasion: str = "ทำงาน",
    mood: Optional[List[str]] = None,
    scent_family: Optional[List[str]] = None,
    outfit_description: str = "",
    api_key: str = "",
) -> Dict[str, Any]:
    """
    ScentSelf full pipeline
    คืนค่า dict พร้อมใช้เป็น API response หรือ print ดูในเทอร์มินัล
    """
    lifestyle = lifestyle or []
    mood = mood or []
    scent_family = scent_family or []

    print("▶ Step 3 — Building Scent DNA...")
    dna = build_scent_dna(scent_family, occasion, mood)
    for family, score in sorted(dna.items(), key=lambda x: -x[1]):
        bar = "█" * int(score * 20)
        print(f"  {family:<20} {bar:<20} {round(score * 100):>3}%")

    print(f"\n▶ Step 4 — Scoring fragrances (budget ฿{budget:,}, occasion: {occasion})...")
    candidates = score_fragrances(dna, occasion, budget, top_n=6)
    if not candidates:
        raise ValueError(f"ไม่มีน้ำหอมในงบ ฿{budget:,}")
    print(f"  พบ {len(candidates)} candidates จาก cosine similarity:")
    for c in candidates:
        print(f"  [{c['similarity_score']:.3f}] {c['name']} ({c['brand']}) ฿{c['price']:,}")

    print("\n▶ Step 5–6 — Calling Gemini API for Top 3 + Thai explanation...")
    result = explain_with_gemini(
        candidates=candidates,
        dna=dna,
        occasion=occasion,
        mood=mood,
        lifestyle=lifestyle,
        outfit_description=outfit_description,
        budget=budget,
        for_whom=for_whom,
        api_key=api_key,
    )

    result["scent_dna"] = dna
    result["candidates_evaluated"] = len(candidates)
    return result


# ══════════════════════════════════════════════════════════════════════════════
# DEMO — รันตรงจาก terminal
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    API_KEY = os.environ.get("GEMINI_API_KEY", "")
    if not API_KEY:
        print("❌ ยังไม่ได้ตั้งค่า GEMINI_API_KEY")
        print("   Windows : set GEMINI_API_KEY=...")
        print("   Mac/Linux: export GEMINI_API_KEY=...")
        exit(1)

    print("=" * 60)
    print("ScentSelf Pipeline Demo")
    print("=" * 60)

    # ตัวอย่าง: มนุษย์เงินเดือน ทำงาน ชอบกลิ่นสะอาด งบ 4,000
    result = run_pipeline(
        for_whom="ใช้เอง",
        lifestyle=["ทำงานออฟฟิศ", "แต่งตัวเรียบง่าย"],
        budget=4000,
        occasion="ทำงาน",
        mood=["สะอาด", "เรียบง่าย"],
        scent_family=["Fresh", "Floral"],
        outfit_description="เสื้อเชิ้ตสีขาว กางเกงทรงเรียบ ประชุมสำคัญ",
        api_key=API_KEY,
    )

    print("\n" + "=" * 60)
    print("TOP 3 RECOMMENDATIONS")
    print("=" * 60)
    for p in result["top3"]:
        print(f"\n#{p['rank']} {p['name']} — {p['brand']}")
        print(f"   Family  : {p['family']}  |  Match: {p['match_score']}%  |  ฿{p.get('price', '-'):,}")
        print(f"   เหตุผล  : {p['reason']}")
        print(f"   Tags    : {', '.join(p.get('fit_tags', []))}")

    print(f"\n💬 Advisor note: {result.get('advisor_note', '')}")
    print(f"\n📄 Full JSON saved to result.json")

    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
