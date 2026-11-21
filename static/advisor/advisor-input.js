"use strict";

function parseAdvisorBudget(text) {
  const digits = "๐๑๒๓๔๕๖๗๘๙";
  const input = text.trim().replace(/[๐-๙]/g, digit => String(digits.indexOf(digit)));
  const amount = "(\\d{1,3}(?:,\\d{3})+|\\d+)";
  const prefix = "(?:(?:งบ(?:ประมาณ)?|ประมาณ|budget)\\s*)?";
  const unit = "(?:บาท|thb|฿)?";
  const read = value => Number(value.replaceAll(",", ""));
  const range = input.match(new RegExp("^" + prefix + "฿?\\s*" + amount + "\\s*" + unit
    + "\\s*(?:[-–—~]|ถึง|to)\\s*฿?\\s*" + amount + "\\s*" + unit + "$", "i"));
  if (range) {
    const min = read(range[1]), max = read(range[2]);
    return min >= 1 && min <= max && max <= 1000000 ? {min, max} : null;
  }
  const one = input.match(new RegExp("^" + prefix + "(ไม่เกิน|ต่ำกว่า|อย่างน้อย|ตั้งแต่|up to)?\\s*฿?\\s*"
    + amount + "\\s*" + unit + "$", "i"));
  if (!one) return null;
  const value = read(one[2]) - (one[1] === "ต่ำกว่า" ? 1 : 0);
  if (value < 1 || value > 1000000) return null;
  return /อย่างน้อย|ตั้งแต่/.test(one[1] || "") ? {min: value, max: null} : {min: null, max: value};
}

function findAdvisorOccasion(text) {
  const events = [
    ["wedding_morning", /(?:งานแต่ง|งานมงคลสมรส).{0,16}(?:เช้า|กลางวัน)|(?:เช้า|กลางวัน).{0,12}งานแต่ง|\bmorning wedding\b/i],
    ["afternoon_party", /(?:งานเลี้ยง|ปาร์ตี้|งานสังสรรค์).{0,16}(?:บ่าย|กลางวัน)|(?:บ่าย|กลางวัน).{0,12}(?:งานเลี้ยง|ปาร์ตี้)|\bafternoon party\b/i],
    ["concert", /คอนเสิร์ต|คอนเสิรต์|เทศกาลดนตรี|\bconcert\b/i],
    ["wedding", /งานแต่ง|งานมงคลสมรส|\bwedding\b/i],
    ["beach", /เที่ยวทะเล|ไปทะเล|ชายหาด|\bbeach\b/i],
    ["nature", /เที่ยวธรรมชาติ|เดินป่า|ขึ้นเขา|เที่ยวภูเขา|แคมป์ปิ้ง|\b(hiking|camping)\b/i],
    ["cafe", /คาเฟ่|ร้านกาแฟ|\bcaf[eé]\b/i],
    ["gym", /ออกกำลังกาย|ฟิตเนส|ไปยิม|\b(gym|workout)\b/i],
    ["interview", /สัมภาษณ์งาน|\bjob interview\b/i],
    ["ceremony", /ไปวัด|ทำบุญ|ร่วมพิธี|งานศพ|รับปริญญา|\b(funeral|graduation|ceremony)\b/i],
    ["date", /ไปเดต|ไปเดท|ออกเดต|ออกเดท|\bdate night\b/i],
    ["friends_meal", /(?:กินข้าว|กินอาหาร|ทานข้าว|ทานอาหาร|ดินเนอร์|มื้อเที่ยง|มื้อเย็น).{0,24}(?:กับ|เจอ|นัด)เพื่อน|\b(lunch|dinner|meal) with friends\b/i],
  ];
  const specific = events.find(([, pattern]) => pattern.test(text));
  if (specific) return specific[0];
  const matches = [
    ["C", /งานเลี้ยงเย็น|ดินเนอร์|ปาร์ตี้กลางคืน|\b(dinner|night out|evening party)\b/i],
    ["B", /พักผ่อน|วันหยุด|เดินเล่น|\b(weekend|casual|relax)\b/i],
    ["A", /ทำงาน|ออฟฟิศ|เรียน|ประชุม|\b(work|office|school|meeting)\b/i],
  ].filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : null;
}

function parseAdvisorBrief(text) {
  const scenario = findAdvisorOccasion(text);
  const cleaned = text.replace(/น้ำหอม/g, "");
  const wanted = cleaned.match(/(?:ขอ(?:แบบ)?|อยากได้|ชอบ)\s*([^,;\n]*?)(?=\s*(?:งบ|ไม่(?:เอา|ชอบ|ฟุ้ง|ฉุน|แรง))|[,;\n]|$)/)?.[1] || "";
  const rules = {musk: /สะอาด|สบู่|มัสก์|แป้ง/, citrus: /เปลือกส้ม|ซิตรัส|มะนาว/,
    aquatic: /ลมทะเล|ละอองน้ำ|แนวน้ำ/, gourmand: /วานิลลา|ขนม|หวาน/, floral: /ดอกไม้|กุหลาบ|มะลิ/,
    woody: /ไม้แห้ง|ซีดาร์|ไม้หอม/, green: /ใบไม้|ชาเขียว|หญ้า/, amber: /อำพัน|ยางไม้/, spicy: /เครื่องเทศ|อบเชย|กระวาน/};
  const matches = Object.keys(rules).filter(key => rules[key].test(wanted));
  const budgetText = text.match(/(?:งบ(?:ประมาณ)?\s*|(?=ไม่เกิน\s*[\d๐-๙]))[\s\S]+$/)?.[0].replace(/[.!。]$/, "");
  return {
    scenario,
    families: matches.length <= 2 && !/ไม่.*(?:เอา|ชอบ|หวาน)/.test(wanted) ? matches : [],
    sillage: /ใกล้ตัว|ไม่\s*(?:ฟุ้ง|ฉุน|แรง)|กลิ่นเบา/.test(text) ? 0
      : /กระจายปานกลาง|กลิ่นปานกลาง/.test(text) ? 1 : /กลิ่นชัด|กลิ่นฟุ้ง/.test(text) ? 2 : null,
    bounds: budgetText ? parseAdvisorBudget(budgetText) : null,
  };
}

function findOutfitStyles(text) {
  const choices = {
    Minimal: /มินิมอล|เรียบง่าย|\bminimal\b/i, Casual: /ลำลอง|สบาย\s*ๆ|เสื้อยืด|กางเกงยีนส์|\bcasual\b/i,
    Formal: /ทางการ|ชุดสูท|\b(formal|suit)\b/i, Romantic: /โรแมนติก|หวานละมุน|\bromantic\b/i,
    Streetwear: /สตรีท|\bstreetwear\b/i, Edgy: /เอดจี้|\bedgy\b/i,
    Natural: /แนวธรรมชาติ|\bnatural\b/i, Sporty: /สปอร์ต|ชุดกีฬา|\bsporty\b/i,
  };
  const positive = text.replace(/ไม่(?:ได้|ค่อย)?(?:แต่ง|ใส่|เอา|ชอบ)?\s*(?:เป็น|แบบ|แนว)?\s*(?:ทางการ|ชุดสูท|formal|suit)/gi, "");
  return Object.keys(choices).filter(style => choices[style].test(positive)).slice(0, 2);
}

const OUTFIT_PALETTES = {
  dark: {label: "สีเข้ม", families: ["woody", "amber"]},
  light: {label: "สีอ่อน", families: ["musk", "floral"]},
  neutral: {label: "สีกลาง", families: ["musk", "woody"]},
  warm: {label: "สีโทนอุ่น", families: ["amber", "gourmand"]},
  cool: {label: "สีโทนเย็น", families: ["aquatic", "musk"]},
  green: {label: "สีเขียว", families: ["green", "woody"]},
};

function outfitPalette(pixels) {
  const counts = Object.fromEntries(Object.keys(OUTFIT_PALETTES).map(key => [key, 0]));
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 180) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const high = Math.max(r, g, b), low = Math.min(r, g, b), spread = high - low;
    let key;
    if (high < 72) key = "dark";
    else if (spread < 38 || spread / high < 0.21) key = high > 190 ? "light" : "neutral";
    else if (g > r * 1.12 && g > b * 1.12) key = "green";
    else key = b >= r || (g > r && b >= r * 0.85) ? "cool" : "warm";
    counts[key]++;
    total++;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return total && ranked[0][1] / total >= 0.4 ? OUTFIT_PALETTES[ranked[0][0]] : null;
}

async function readOutfitPalette(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error("เลือกไฟล์ JPG, PNG หรือ WebP ไม่เกิน 8 MB ค่ะ");
  }
  const image = await createImageBitmap(file).catch(() => {
    throw new Error("เปิดรูปนี้ไม่ได้ค่ะ ลองเลือกรูปอื่นหรือเลือกแนวกลิ่นเองได้เลย");
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    ctx.drawImage(image, image.width * .15, image.height * .18, image.width * .7, image.height * .64, 0, 0, 48, 48);
    return {palette: outfitPalette(ctx.getImageData(0, 0, 48, 48).data), preview: canvas.toDataURL("image/jpeg", .8)};
  } finally {
    image.close();
  }
}

if (typeof module !== "undefined") module.exports = {parseAdvisorBudget, findAdvisorOccasion, parseAdvisorBrief, outfitPalette, findOutfitStyles};
