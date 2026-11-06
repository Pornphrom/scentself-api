"""Purchase-only shared family eligibility; historical and owned scoring remain unchanged."""
from .engine_v2_3 import OPPOSITE, SennaEngineV23
from .family_eligibility import NoEligibleFragrances, PURCHASE_POLICY, select_family_candidates

ENGINE_VERSION = 'v2.4'


class SennaEngineV24(SennaEngineV23):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.purchase_family_gate = False

    def recommend(self, scenario, families=None, **kwargs):
        if not self.purchase_family_gate or not families:
            return super().recommend(scenario, families, **kwargs)
        count = kwargs.pop('k', 3)
        if count < 1:
            raise ValueError('Recommendation count must be positive')
        out = super().recommend(scenario, families, k=len(self.items), **kwargs)
        pool_size = None
        for method in ['A', 'B']:
            selected = select_family_candidates(self, out[method], families, count,
                favorite_id=kwargs.get('favorite_id'), banned_gender=OPPOSITE.get(self.gender_pref))
            if not selected:
                raise NoEligibleFragrances('ยังไม่พบขวดที่รองรับแนวกลิ่นที่เลือก กรุณาปรับความต้องการหรือเริ่มรอบใหม่')
            rows = []
            for tier, _, raw, matched in selected:
                row = dict(raw)
                complete = len(matched) == len(families)
                label = ('ตรงสองแนวที่ขอ: ' if complete and len(families) == 2 else
                         'ตรงบางแนวที่ขอ: ' if not complete else 'แนวที่ตรงคำขอ: ') + ' / '.join(matched)
                warnings = []
                if not complete:
                    warnings.append('ตรงเพียงบางแนว ยังไม่รองรับครบสองแนวที่เลือกตามโปรไฟล์ในฐานข้อมูล')
                elif row['family'] not in families:
                    warnings.append(f"แนวหลักคือ{row['family']} แต่มีโทนรองที่รองรับสองแนวตามโปรไฟล์ ไม่ใช่แนวหลักที่ตรงคำขอ")
                row.update(matched_families=matched, family_match_complete=complete,
                           family_match_label=label, family_match_tier=tier,
                           reasons=[label + ' ตามโปรไฟล์กลิ่นในฐานข้อมูล'] + warnings + list(row['reasons']))
                rows.append(row)
            out[method] = rows
            pool_size = len(rows) if pool_size is None else min(pool_size, len(rows))
        out['request']['family_eligibility_policy'] = PURCHASE_POLICY
        out['request']['family_profile_support'] = 0.15
        out['request']['fewer_than_requested'] = pool_size < count
        return out
