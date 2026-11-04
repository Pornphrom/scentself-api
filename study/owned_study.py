"""Opt-in decision pilots with task-specific consent, measures and exports."""
from datetime import datetime, timezone
import json
import secrets
import time
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import Field, StrictBool, field_validator

from .routes import compare_sets
from .schemas import LIKERT, Payload, Start, Viewed
from .store import StateConflict, Store
from .wardrobe import OWNED_POLICY, Alternatives, OwnedComparison, assess_owned, suggest_alternatives

PROTOCOL = "owned-use-ab-pilot-v1-20261104"
CONSENT = "owned-use-consent-pilot-v1-20261104"
CONFIDENCE = ["ฉันมั่นใจว่าจะเลือกขวดที่มีอยู่สำหรับสถานการณ์นี้ได้",
              "ฉันมั่นใจว่าจะอธิบายเหตุผลในการเลือกขวดที่จะใช้ได้",
              "ฉันตัดสินใจได้ว่าจะใช้ขวดใดจากขวดที่มีอยู่"]
FOLLOWUP = 'discovery_after_owned'
FOLLOWUP_PROTOCOL = 'after-owned-discovery-ab-pilot-v1-20261104'
FOLLOWUP_CONSENT = 'after-owned-discovery-consent-pilot-v1-20261104'
FOLLOWUP_POLICY = 'after-owned-discovery-ab-v1-20261104'
FOLLOWUP_CONFIDENCE = ['ฉันมั่นใจว่าจะเลือกน้ำหอมขวดใหม่ที่ตรงกับความต้องการครั้งนี้ได้',
                       'ฉันมั่นใจว่าจะอธิบายเหตุผลในการพิจารณาขวดใหม่ได้',
                       'ฉันตัดสินใจได้ว่าจะพิจารณาขวดใหม่ใดเป็นตัวเลือกเพิ่มเติม']


def task_config(task):
    if task == FOLLOWUP:
        return dict(protocol=FOLLOWUP_PROTOCOL, consent_version=FOLLOWUP_CONSENT,
                    confidence=FOLLOWUP_CONFIDENCE, policy_version=FOLLOWUP_POLICY)
    return dict(protocol=PROTOCOL, consent_version=CONSENT, confidence=CONFIDENCE, policy_version=OWNED_POLICY)


class OwnedStart(Start):
    task: Literal['owned_use', 'discovery_after_owned'] = 'owned_use'
    context: Alternatives
    prior_advice_seen: StrictBool = False

    @field_validator('context')
    @classmethod
    def needs_comparison(cls, value, info):
        if info.data.get('task') == 'owned_use' and len(value.owned_ids) < 2:
            raise ValueError('Ranking comparison requires at least two owned bottles')
        return value


class OwnedPre(Payload):
    scores: list[LIKERT] = Field(min_length=3, max_length=3)


class OwnedComplete(Payload):
    post: list[LIKERT] = Field(min_length=3, max_length=3)
    relevance_first: LIKERT
    relevance_second: LIKERT
    usefulness: LIKERT


def make_owned_study_router(settings, adapter, store=None):
    router = APIRouter(prefix='/v2/owned-study', tags=['Owned-use opt-in pilot'])
    if store is None and settings.mode == 'pilot':
        if settings.database_url:
            from .postgres_store import PostgresStore
            store = PostgresStore(settings.database_url, settings.mode, task='owned_use')
        else:
            store = Store(settings.data_dir / 'owned_sessions.sqlite3')

    def available():
        if settings.mode != 'pilot':
            raise HTTPException(503, 'การทดลองเลือกใช้เปิดเฉพาะ pilot จนกว่าจะทบทวนแผนวิจัยและ consent')

    def token(authorization):
        if not authorization or not authorization.startswith('Bearer ') or len(authorization) > 263:
            raise HTTPException(401, 'ต้องใช้รหัสเซสชันการทดลองเลือกใช้')
        return authorization[7:]

    def read(sid, authorization):
        available()
        secret = token(authorization)
        try:
            return store.get(sid, secret), secret
        except PermissionError:
            raise HTTPException(404, 'ไม่พบเซสชันการทดลองเลือกใช้') from None

    def move(sid, secret, expected, target, patch):
        try:
            return store.transition(sid, secret, expected, target, patch)
        except StateConflict:
            raise HTTPException(409, 'สถานะเปลี่ยนแล้ว กรุณาโหลดข้อมูลอีกครั้ง') from None

    def public(session):
        data = session['data']
        result = dict(session_id=session['id'], state=session['state'], task=data.get('task'), pilot=True)
        if session['state'] == 'withdrawn':
            return result
        result.update(context=data['context'], protocol=data['protocol'], pre=data.get('pre'))
        if session['state'] == 'recommended':
            result.update(sets=data['sets'], comparison=data['comparison'], viewed=data.get('viewed', {}))
        if session['state'] == 'complete':
            result.update(advice=data['advice'], receipt=session['id'])
            if data['task'] == FOLLOWUP:
                result['evaluated_sets'] = data['sets']
        return result

    @router.get('/config')
    def config(task: Literal['owned_use', 'discovery_after_owned'] = 'owned_use'):
        return dict(available=settings.mode == 'pilot', task=task, **task_config(task),
                    contact=settings.contact, retention_until=settings.retention_until)

    @router.post('/sessions')
    def start(body: OwnedStart):
        available()
        if any(i not in adapter.engine.by_id for i in body.context.owned_ids):
            raise HTTPException(422, 'ไม่พบขวดบางรุ่นในฐานข้อมูล')
        sid = str(body.request_id)
        context = body.context.model_dump(exclude={'budget'} if body.task == 'owned_use' else set())
        definition = task_config(body.task)
        payload = dict(task=body.task, pilot=True, consent=True, eligible=True, protocol=definition['protocol'],
                       consent_version=definition['consent_version'], confidence_items=definition['confidence'], retention_until=settings.retention_until,
                       ui_version=settings.ui_version, catalog_sha256=adapter.catalog_hash,
                       engine_version=adapter.engine_version, policy_version=definition['policy_version'],
                       prior_advice_seen=body.prior_advice_seen,
                       context=context, order_AB=secrets.choice(['AB', 'BA']), started_utc=datetime.now(timezone.utc).isoformat())
        try:
            session = store.create(sid, body.client_secret, payload)
        except PermissionError:
            raise HTTPException(409, 'รหัสคำขอนี้มีอยู่แล้ว') from None
        if (session['data'].get('context') != context or session['data'].get('task') != body.task
                or session['state'] == 'withdrawn'):
            raise HTTPException(409, 'รอบนี้ถูกบันทึกด้วยข้อมูลอื่นแล้ว กรุณาเริ่มรหัสใหม่')
        return public(session)

    @router.get('/sessions/{sid}')
    def get_session(sid: str, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        if session['state'] == 'generating' and time.time() - session['updated'] > 90:
            session = move(sid, secret, ['generating'], 'pre_ready', {})
        return public(session)

    @router.put('/sessions/{sid}/pre')
    def pre(sid: str, body: OwnedPre, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        values = body.model_dump()
        if session['state'] == 'pre_ready' and session['data'].get('pre') == values:
            return public(session)
        return public(move(sid, secret, ['intake'], 'pre_ready', {'pre': values}))

    @router.post('/sessions/{sid}/recommend')
    def recommend(sid: str, body: Payload, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        if session['state'] in {'recommended', 'complete'}:
            return public(session)
        if session['state'] not in {'pre_ready', 'generating'}:
            raise HTTPException(409, 'กรุณาตอบความรู้สึกก่อนใช้ให้ครบ หรือเริ่มรอบใหม่หากถอนตัวแล้ว')
        data = session['data']
        definition = task_config(data['task'])
        if (data['catalog_sha256'] != adapter.catalog_hash or data['engine_version'] != adapter.engine_version
                or data['policy_version'] != definition['policy_version'] or data['protocol'] != definition['protocol']):
            raise HTTPException(409, 'เวอร์ชันระบบเปลี่ยน กรุณาถอนตัวรอบเดิมก่อนเริ่มรอบใหม่')
        if session['state'] == 'generating' and time.time() - session['updated'] > 90:
            session = move(sid, secret, ['generating'], 'pre_ready', {})
        if session['state'] != 'pre_ready':
            raise HTTPException(409, 'กรุณาตอบความรู้สึกก่อนใช้ให้ครบ หรือรอคำขอเดิม')
        move(sid, secret, ['pre_ready'], 'generating', {})
        try:
            followup = data['task'] == FOLLOWUP
            context = Alternatives(**data['context']) if followup else OwnedComparison(**data['context'])
            rank = suggest_alternatives if followup else assess_owned
            outputs = {method: rank(adapter, context, method) for method in ['A', 'B']}
            count = 3 if followup else min(3, len(context.owned_ids))
            sets = [{'slot': slot, 'label': f'ชุดที่ {i+1}',
                     'items': [{**it, 'owned_use': not followup} for it in outputs[method]['items'][:count]]}
                    for i, (slot, method) in enumerate(zip(['first', 'second'], data['order_AB']))]
            comparison = compare_sets(sets)
        except Exception:
            move(sid, secret, ['generating'], 'pre_ready', {})
            raise HTTPException(503, 'ยังเตรียมชุดเปรียบเทียบไม่ได้ กรุณาลองอีกครั้ง') from None
        return public(move(sid, secret, ['generating'], 'recommended',
                           dict(sets=sets, comparison=comparison, advice=outputs['A'],
                                method_results=outputs, recommended_utc=datetime.now(timezone.utc).isoformat())))

    @router.post('/sessions/{sid}/view')
    def view(sid: str, body: Viewed, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        if session['state'] != 'recommended':
            raise HTTPException(409, 'ยังไม่มีชุดเปรียบเทียบให้บันทึก')
        try:
            session = store.mark_viewed(sid, secret, body.slot, datetime.now(timezone.utc).isoformat())
        except StateConflict:
            raise HTTPException(409, 'รอบนี้ไม่ได้อยู่ระหว่างแสดงคำแนะนำ') from None
        return {'viewed': session['data']['viewed']}

    @router.post('/sessions/{sid}/complete')
    def complete(sid: str, body: OwnedComplete, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        data, values = session['data'], body.model_dump()
        if session['state'] == 'complete':
            if values != data['completion']:
                raise HTTPException(409, 'ส่งผลประเมินแล้ว ไม่สามารถเขียนทับได้')
            return public(session)
        if session['state'] != 'recommended' or set(data.get('viewed', {})) != {'first', 'second'}:
            raise HTTPException(409, 'กรุณาดูทั้งสองชุดก่อนให้คะแนน')
        ratings = dict(zip(data['order_AB'], [body.relevance_first, body.relevance_second]))
        row = dict(participant_id=sid, task=data['task'], pilot=1, consent=1, protocol=data['protocol'],
                   ui_version=data['ui_version'], policy_version=data['policy_version'], scenario=data['context']['scenario'],
                   owned_count=len(data['context']['owned_ids']), relevance_A=ratings['A'], relevance_B=ratings['B'],
                   order_AB=data['order_AB'], usefulness=body.usefulness,
                   duration_sec=round(max(0, time.time()-session['started']), 3),
                   **{f'pre{i+1}': v for i, v in enumerate(data['pre']['scores'])},
                   **{f'post{i+1}': v for i, v in enumerate(body.post)},
                   **{k: int(data['comparison'][k]) for k in ['overlap_count', 'identical_items', 'identical_order']})
        row['prior_advice_seen'] = int(data['prior_advice_seen']) if 'prior_advice_seen' in data else None
        if data['task'] == FOLLOWUP:
            row['budget'] = data['context']['budget']
        return public(move(sid, secret, ['recommended'], 'complete',
                           dict(completion=values, analysis_row=row, completed_utc=datetime.now(timezone.utc).isoformat())))

    @router.delete('/sessions/{sid}')
    def withdraw(sid: str, authorization: str | None = Header(default=None)):
        session, secret = read(sid, authorization)
        store.withdraw(sid, secret)
        return {'state': 'withdrawn', 'task': session['data'].get('task', 'owned_use')}

    def export(authorization, task='owned_use'):
        available()
        if not settings.admin_token or not secrets.compare_digest(token(authorization), settings.admin_token):
            raise HTTPException(403, 'ไม่อนุญาตให้ส่งออกข้อมูล')
        return store.export(task=task)

    @router.get('/admin/export.csv')
    def export_csv(authorization: str | None = Header(default=None)):
        text, _ = export(authorization)
        return Response('\ufeff'+text, media_type='text/csv; charset=utf-8', headers={'Cache-Control': 'no-store'})

    @router.get('/admin/audit.json')
    def export_audit(authorization: str | None = Header(default=None)):
        _, audit = export(authorization)
        return Response(json.dumps(audit, ensure_ascii=False), media_type='application/json', headers={'Cache-Control': 'no-store'})

    @router.get('/admin/followup-export.csv')
    def followup_csv(authorization: str | None = Header(default=None)):
        text, _ = export(authorization, FOLLOWUP)
        return Response('\ufeff'+text, media_type='text/csv; charset=utf-8', headers={'Cache-Control': 'no-store'})

    @router.get('/admin/followup-audit.json')
    def followup_audit(authorization: str | None = Header(default=None)):
        _, audit = export(authorization, FOLLOWUP)
        return Response(json.dumps(audit, ensure_ascii=False), media_type='application/json', headers={'Cache-Control': 'no-store'})

    return router
