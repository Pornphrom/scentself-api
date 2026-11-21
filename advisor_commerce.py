"""Product-preview links only. Never used to rank the research recommendations."""
from urllib.parse import urlencode

VERIFIED_PRODUCTS = {
    ("Tom Ford", "Tobacco Vanille"): (
        "TOM FORD BEAUTY",
        "https://www.tomfordbeauty.com/products/tobacco-vanille-eau-de-parfum",
        "เว็บแบรนด์ต่างประเทศ",
    ),
    ("Xerjoff", "XJ 1861 Naxos"): (
        "Xerjoff",
        "https://www.xerjoff.com/en-eu/products/naxos-eau-de-parfum",
        "เว็บแบรนด์ต่างประเทศ",
    ),
    ("Maison Martin Margiela", "Coffee Break"): (
        "Maison Margiela",
        "https://www.maisonmargiela.com/en-th/replica-coffee-break-eau-de-toilette-S33YX0075S11917961.html",
        "เว็บแบรนด์",
    ),
    ("Jo Malone London", "Myrrh & Tonka Cologne Intense"): (
        "Central Online",
        "https://www.central.co.th/th/jomalonelondon-unisex-fragrance-myrrh-and-tonka-cologne-intense-30-ml-cds31483605",
        "ขนาด 30 มล.",
    ),
}


def shopping_links(item):
    match = VERIFIED_PRODUCTS.get((item["brand"], item["name"]))
    if match:
        merchant, url, note = match
        return [{"kind": "product", "merchant": merchant, "url": url,
                 "label": "ดูสินค้าและราคา · " + merchant,
                 "note": note + " · ตรวจรุ่น ขนาด ราคา และการจัดส่งก่อนซื้อ",
                 "checked_on": "2026-11-21"}]
    query = " ".join(filter(None, [item["brand"], item["name"], item.get("edition"), "น้ำหอม ซื้อ"]))
    return [{"kind": "search", "merchant": "Google", "url": "https://www.google.com/search?" + urlencode({"q": query}),
             "label": "ค้นหาร้านจำหน่ายรุ่นนี้",
             "note": "ผลค้นหา ไม่ใช่ร้านที่ Senna รับรอง · ตรวจรุ่นและผู้ขายก่อนซื้อ"}]
