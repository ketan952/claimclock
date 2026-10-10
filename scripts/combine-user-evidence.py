#!/usr/bin/env python3
"""Build a reviewed research view while retaining the original collection passes."""
import argparse
import copy
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
paths = [ROOT / 'research/user-evidence.json', ROOT / 'research/user-evidence-additional.json']
extra = ROOT / 'research/user-evidence-final.json'
if extra.exists():
    paths.append(extra)
sources = [json.loads(path.read_text()) for path in paths]
posts = [copy.deepcopy(post) for source in sources for post in source.get('posts', [])]
by_id = {post['id']: post for post in posts}
assert len(by_id) == len(posts), 'Duplicate case ID'
amendments = []
for source in sources[1:]:
    for change in source.get('existing_record_amendments', []):
        post = by_id[change['existing_case_id']]
        assert post['url'].rstrip('/') == change['url'].rstrip('/')
        for field in ['published_date', 'created_utc', 'published_at_utc', 'date_evidence_url', 'date_evidence', 'within_180_day_window']:
            if field in change:
                post[field] = change[field]
        post['date_precision'] = 'day'
        post['target_eligible'] = change['recommended_target_eligible']
        if post['target_eligible']:
            post['scope'] = 'core'
        for field in ['snippet', 'failure_types', 'insurers_as_reported', 'tpa_as_reported']:
            if field in change:
                post[field] = change[field]
        post.setdefault('review_amendments', []).append(change['reason'])
        amendments.append({'id': post['id'], 'reason': change['reason']})
ids = [re.search(r'/comments/([^/]+)', post['url']).group(1) for post in posts]
assert len(set(ids)) == len(ids), 'Duplicate top-level Reddit post'
for post in posts:
    if 'created_utc' in post:
        assert datetime.fromtimestamp(post['created_utc'], timezone.utc).date().isoformat() == post['published_date']
eligible = [post for post in posts if post['target_eligible']]
for post in eligible:
    assert '2026-04-14' <= post['published_date'] <= '2026-10-10'
    assert post['first_person_experience'] is True

def clusters(items):
    insurers, tpas, failures = Counter(), Counter(), Counter()
    for post in items:
        insurers.update(post.get('insurers_as_reported', []))
        tpa = post.get('tpa_as_reported')
        if tpa:
            tpas.update(tpa if isinstance(tpa, list) else [tpa])
        failures.update(post.get('failure_types', []))
    return {'label': 'Most reported by users in this selected convenience sample; not an insurer judgment or failure rate',
            'insurer_mentions': dict(insurers.most_common()), 'tpa_mentions': dict(tpas.most_common()),
            'failure_type_mentions': dict(failures.most_common()),
            'unknown_insurer_cases': sum(not p.get('insurers_as_reported') for p in items),
            'unknown_tpa_cases': sum(not p.get('tpa_as_reported') for p in items)}

result = {'schema_version': 1, 'retrieved_on': '2026-10-10',
          'sources': [str(path.relative_to(ROOT)) for path in paths],
          'window': sources[0]['window'], 'eligibility_definition': sources[0]['eligibility_definition'],
          'status': 'target_met' if len(eligible) >= 30 else 'partial_target_not_met',
          'counts': {'reviewed': len(posts), 'strict_qualifying': len(eligible),
                     'exact_in_window': sum(p.get('within_180_day_window') is True and bool(p.get('published_date')) for p in posts),
                     'unresolved_dates': sum(not p.get('published_date') for p in posts)},
          'caution': 'Publication date is used, not medical-event date. Public experiences are unverified. Cross-posts and comments are not separate cases. Original collection files are retained unchanged.',
          'applied_amendments': amendments, 'strict_target_clusters': clusters(eligible), 'posts': posts}
output = ROOT / 'research/user-evidence-combined.json'
rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
if args.check:
    assert output.read_text() == rendered, 'Combined research view is stale'
else:
    output.write_text(rendered)
print(json.dumps(result['counts']))
