from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

USAGE = ["6–7 วันต่อสัปดาห์", "3–5 วันต่อสัปดาห์", "1–2 วันต่อสัปดาห์", "น้อยกว่า 1 วันต่อสัปดาห์", "ไม่ได้ใช้เลย"]
EXPERIENCE = ["เคยดมหรือใช้ และมีน้ำหอมที่ชอบ", "เคยดมหรือใช้ แต่ยังไม่มีตัวที่ชอบ", "รู้จักชื่อหรือเคยเห็นข้อมูล แต่ยังไม่เคยดม", "ยังไม่มีประสบการณ์หรือไม่แน่ใจ"]
BUDGET = ["ต่ำกว่า 1,500 บาท", "1,500–4,000 บาท", "มากกว่า 4,000 บาท", "ยังไม่ได้กำหนดงบประมาณ"]
SCENARIOS = {"A": "A งาน/เรียน", "B": "B พักผ่อน", "C": "C งานเลี้ยงเย็น"}
FAMILIES = {"citrus": "ซิตรัส", "aquatic": "แนวน้ำ / ทะเล", "floral": "ดอกไม้", "woody": "ไม้", "green": "เขียว / ใบไม้ / ดิน", "gourmand": "หวานแนวขนม", "amber": "อำพัน / เรซิน", "spicy": "เครื่องเทศ", "musk": "มัสก์ / แนวสะอาด / แป้ง"}
IMAGES = ["สะอาด สดชื่น", "เป็นมืออาชีพ", "เป็นกันเอง", "อบอุ่น อ่อนโยน", "หรูหรา", "มีเอกลักษณ์", "มีเสน่ห์", "ไม่ได้ต้องการสื่อภาพลักษณ์เป็นพิเศษ", "ยังไม่แน่ใจ"]
STYLES = ["Minimal", "Casual", "Formal", "Romantic", "Streetwear", "Edgy", "Natural", "Sporty"]
CONFIDENCE = ["ฉันมั่นใจว่าจะเลือกน้ำหอมที่เหมาะกับตัวเองสำหรับสถานการณ์นี้ได้", "ฉันมั่นใจว่าน้ำหอมที่เลือกจะเหมาะกับโอกาสและภาพลักษณ์ที่ต้องการ", "ฉันมั่นใจพอที่จะตัดสินใจซื้อ แม้ไม่ได้ทดลองกลิ่นก่อน"]
LIKERT = Annotated[int, Field(strict=True, ge=1, le=5)]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Start(Payload):
    request_id: UUID
    client_secret: str = Field(pattern=r"^[a-f0-9]{64}$")
    consent: Literal[True]
    eligible: Literal[True]

    @field_validator("consent", "eligible", mode="before")
    @classmethod
    def explicit_boolean(cls, value):
        if value is not True:
            raise ValueError("Explicit consent and eligibility are required")
        return value


class Pre(Payload):
    q5_usage: str
    q6_experience: str
    q21_budget: str
    scenario: Literal["A", "B", "C"]
    scores: list[LIKERT] = Field(min_length=3, max_length=3)

    @field_validator("q5_usage", "q6_experience", "q21_budget")
    @classmethod
    def choices(cls, value, info):
        options = {"q5_usage": USAGE, "q6_experience": EXPERIENCE, "q21_budget": BUDGET}
        if value not in options[info.field_name]:
            raise ValueError("Unknown survey option")
        return value


class Preferences(Payload):
    families: list[str] = Field(default_factory=list, max_length=2)
    sillage: Annotated[int, Field(strict=True, ge=0, le=2)] | None = None
    image: str | None = None
    styles: list[str] = Field(default_factory=list, max_length=2)
    outfit: str = Field(default="", max_length=300)
    favorite_id: Annotated[int, Field(strict=True, ge=1)] | None = None

    @field_validator("families", "styles")
    @classmethod
    def options(cls, value, info):
        allowed = FAMILIES if info.field_name == "families" else STYLES
        if len(set(value)) != len(value) or any(v not in allowed for v in value):
            raise ValueError("Invalid or duplicate selection")
        return value

    @field_validator("image")
    @classmethod
    def image_choice(cls, value):
        if value is not None and value not in IMAGES:
            raise ValueError("Unknown image option")
        return value


class Completion(Payload):
    post: list[LIKERT] = Field(min_length=3, max_length=3)
    relevance_first: LIKERT
    relevance_second: LIKERT
    satisfaction: LIKERT
    clarity: LIKERT
    usefulness: LIKERT
    intention: LIKERT
    use_again: LIKERT
    attention_answer: LIKERT


class Viewed(Payload):
    slot: Literal["first", "second"]
