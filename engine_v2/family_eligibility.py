"""Shared evidence tiers for explicit fragrance-family requests."""
PROFILE_SUPPORT = 0.15
PURCHASE_POLICY = 'explicit-family-eligibility-v1-20261107'


class NoEligibleFragrances(ValueError):
    pass


def family_match(engine, item, requested):
    if not requested:
        return 0, []
    index = engine.by_id[item['id']]
    matched = [family for family in requested
               if item['family'] == family or engine.P[index, engine.fams.index(family)] >= PROFILE_SUPPORT]
    if len(matched) == len(requested):
        return (0 if item['family'] in requested else 1), matched
    if item['family'] in requested:
        return 2, matched
    return None, matched


def select_family_candidates(engine, ranked, requested, count, favorite_id=None, banned_gender=None):
    candidates = []
    for rank, raw in enumerate(ranked):
        item = engine.items[engine.by_id[raw['id']]]
        if raw['id'] == favorite_id or (banned_gender and item.get('gender') == banned_gender):
            continue
        tier, matched = family_match(engine, item, requested)
        if tier is not None:
            candidates.append((tier, rank, raw, matched))
    candidates.sort(key=lambda row: row[:2])
    selected = candidates[:count]
    # Cover both requested families across the shelf when the shared pool permits it.
    if len(requested) == 2 and len(selected) >= 2:
        covered = set().union(*(set(row[3]) for row in selected))
        if not set(requested) <= covered:
            replacement = next((row for row in candidates if set(row[3]) - covered), None)
            if replacement is not None:
                for index in range(len(selected) - 1, -1, -1):
                    others = selected[:index] + selected[index + 1:]
                    if set(requested) <= set(replacement[3]).union(*(set(row[3]) for row in others)):
                        selected[index] = replacement
                        break
                selected.sort(key=lambda row: row[:2])
    return selected
