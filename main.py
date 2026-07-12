# main.py
# ScentSelf FastAPI — NIDA MADT IS Project
#
# รันด้วย: uvicorn main:app --reload
# Docs:    http://localhost:8000/docs

import csv
import json
import os
import uuid
from typing import List, Optional
from datetime import datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from scentself import run_pipeline, FRAGRANCES, FAMILY_ORDER

load_dotenv()

# ── Registration storage (CSV) ──────────────────────────────────────────────

CSV_PATH = os.path.join(os.path.dirname(__file__), "registrations.csv")
CSV_FIELDS = [
    "id", "timestamp", "for_whom", "age", "lifestyle", "budget",
    "occasion", "mood", "scent_family", "outfit_description", "pre_confidence",
]


def _append_registration(row: dict):
    file_exists = os.path.isfile(CSV_PATH)
    with open(CSV_PATH, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ScentSelf API",
    description="AI-Powered Fragrance Advisor — NIDA MADT IS · Palaloy",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # เปิด CORS ให้ HTML mockup เรียกได้
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response Models ─────────────────────────────────────────────────

class UserProfile(BaseModel):
    for_whom: str = Field(default="ใช้เอง", description="ใช้เอง | เป็นของขวัญ")
    age: Optional[str] = Field(default="25–34")
    lifestyle: List[str] = Field(default=[], description="เช่น ['ทำงานออฟฟิศ', 'แต่งตัวเรียบง่าย']")
    budget: int = Field(default=4000, ge=500, le=20000, description="งบประมาณ (บาท)")
    occasion: str = Field(default="ทำงาน", description="ทำงาน | เดต | ทุกวัน | ออกงาน | ท่องเที่ยว")
    mood: List[str] = Field(default=[], description="เช่น ['สะอาด', 'เรียบง่าย']")
    scent_family: List[str] = Field(default=[], description="Fresh | Floral | Woody | Aquatic | Amber | Gourmand | Not sure")
    outfit_description: str = Field(default="", description="อธิบาย outfit หรือบริบทเพิ่มเติม")
    pre_confidence: int = Field(default=2, ge=1, le=5, description="ความมั่นใจก่อนใช้ระบบ (1–5)")

    class Config:
        json_schema_extra = {
            "example": {
                "for_whom": "ใช้เอง",
                "age": "25–34",
                "lifestyle": ["ทำงานออฟฟิศ", "แต่งตัวเรียบง่าย"],
                "budget": 4000,
                "occasion": "ทำงาน",
                "mood": ["สะอาด", "เรียบง่าย"],
                "scent_family": ["Fresh", "Floral"],
                "outfit_description": "เสื้อเชิ้ตสีขาว กางเกงทรงเรียบ ประชุมสำคัญ",
                "pre_confidence": 2,
            }
        }


class RecommendResponse(BaseModel):
    session_id: str
    timestamp: str
    profile_summary: dict
    scent_dna: dict
    candidates_evaluated: int
    top3: list
    advisor_note: str


class RegisterResponse(BaseModel):
    registration_id: str
    timestamp: str
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/", tags=["Info"])
def root():
    return {
        "service": "ScentSelf API",
        "version": "1.0.0",
        "project": "NIDA MADT IS — AI-Powered Fragrance Advisor",
        "docs": "/docs",
        "endpoints": {
            "POST /register": "บันทึกข้อมูลผู้ใช้งานลงไฟล์ CSV",
            "GET  /recommend": "รับ user profile (query params) → คืน Top 3 recommendation (ไม่บันทึกข้อมูล)",
            "GET  /fragrances": "ดู fragrance database ทั้งหมด (กรองด้วย ?family=Floral)",
            "GET  /health": "health check",
        },
    }


@app.get("/health", tags=["Info"])
def health():
    api_key_set = bool(os.environ.get("GEMINI_API_KEY"))
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "gemini_api_key": "set" if api_key_set else "NOT SET — ต้องตั้งค่าก่อน",
        "fragrances_loaded": len(FRAGRANCES),
    }


@app.get("/fragrances", tags=["Database"])
def list_fragrances(family: Optional[str] = None, max_price: Optional[int] = None):
    """
    ดู fragrance database
    - ?family=Floral  → กรองตาม family
    - ?max_price=3000 → กรองตามราคา
    """
    result = FRAGRANCES
    if family:
        result = [f for f in result if f["family"].lower() == family.lower()]
    if max_price:
        result = [f for f in result if f["price"] <= max_price]
    return {"count": len(result), "fragrances": result}


@app.get("/families", tags=["Database"])
def list_families():
    """ดูหมวดหมู่กลิ่นน้ำหอมทั้งหมดในระบบ"""
    from collections import Counter
    counts = Counter(f["family"] for f in FRAGRANCES)
    return {
        "families": FAMILY_ORDER,
        "counts": {f: counts.get(f, 0) for f in FAMILY_ORDER},
        "total": len(FRAGRANCES),
    }


@app.post("/register", response_model=RegisterResponse, tags=["Advisor"])
def register(profile: UserProfile):
    """
    **บันทึกข้อมูลผู้ใช้งาน** — เก็บ user profile ลงไฟล์ `registrations.csv`

    ต่างจาก `/recommend` ตรงที่ endpoint นี้จะบันทึกข้อมูลทุกครั้งที่เรียก
    ใช้สำหรับเก็บข้อมูลตอนเริ่มต้นใช้งาน (Step 1–2 ของ flow)
    """
    registration_id = str(uuid.uuid4())[:8]
    timestamp = datetime.utcnow().isoformat()

    _append_registration({
        "id": registration_id,
        "timestamp": timestamp,
        "for_whom": profile.for_whom,
        "age": profile.age,
        "lifestyle": json.dumps(profile.lifestyle, ensure_ascii=False),
        "budget": profile.budget,
        "occasion": profile.occasion,
        "mood": json.dumps(profile.mood, ensure_ascii=False),
        "scent_family": json.dumps(profile.scent_family, ensure_ascii=False),
        "outfit_description": profile.outfit_description,
        "pre_confidence": profile.pre_confidence,
    })

    return {
        "registration_id": registration_id,
        "timestamp": timestamp,
        "message": "บันทึกข้อมูลผู้ใช้งานสำเร็จ",
    }


@app.get("/recommend", response_model=RecommendResponse, tags=["Advisor"])
async def recommend(profile: UserProfile = Depends()):
    """
    **Main endpoint** — รับ user profile (query params) → รัน full pipeline → คืน Top 3

    ไม่มีการบันทึกข้อมูลลงตาราง (อ่าน/คำนวณอย่างเดียว) — ถ้าต้องการบันทึกข้อมูลผู้ใช้ ให้เรียก `/register` แยกต่างหาก

    Pipeline (Python):
    1. `build_scent_dna()`     — แปลง selections → DNA weights
    2. `score_fragrances()`    — cosine similarity ranking
    3. `explain_with_gemini()` — Gemini API → Thai explanation
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY ยังไม่ได้ตั้งค่า — ดู .env.example"
        )

    try:
        result = run_pipeline(
            for_whom=profile.for_whom,
            lifestyle=profile.lifestyle,
            budget=profile.budget,
            occasion=profile.occasion,
            mood=profile.mood,
            scent_family=profile.scent_family,
            outfit_description=profile.outfit_description,
            api_key=api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    return {
        "session_id": str(uuid.uuid4())[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "profile_summary": {
            "for_whom": profile.for_whom,
            "occasion": profile.occasion,
            "budget": profile.budget,
            "mood": profile.mood,
            "pre_confidence": profile.pre_confidence,
        },
        **result,
    }
