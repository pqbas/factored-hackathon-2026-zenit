"""Build a public aggregate snapshot from reviewed evidence, without remote calls."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'back/server/src/data/fraud-dashboard.json'


def build():
    paths = {
        'profile': 'ml/reports/2026-09-28/profile_data.json',
        'features': 'ml/reports/2026-09-28/features_data.json',
        'model': 'agent/configs/fraud-model/manifest.json',
        'v8': 'ml/reports/2026-10-05/training_v8_digital_data.json',
        'v9': 'ml/reports/2026-10-05/training_v9_digital_data.json',
        'digital_audit': 'ml/reports/2026-10-05/digital_access_and_quality_report.md',
        'dimension_audit': 'ml/reports/2026-10-05/dimension_timing_audit_report.md',
    }
    evidence = {key: json.loads((ROOT / path).read_text()) for key, path in paths.items() if path.endswith('.json')}

    def audited_count(key, label):
        report = (ROOT / paths[key]).read_text()
        match = re.search(r'^\| ' + re.escape(label) + r' \| ([\d,]+) \|$', report, re.MULTILINE)
        if not match:
            raise ValueError(f'Missing reviewed audit measure: {label}')
        return int(match.group(1).replace(',', ''))

    def rows(label):
        result = next(r['data'] for r in evidence['profile']['results'] if r['label'] == label)
        assert result['state'] == 'SUCCEEDED' and not result['truncated']
        columns = [c['name'] for c in result['schema']['columns']]
        return [dict(zip(columns, row)) for chunk in result['external_links'] for row in chunk['data_array']]

    def segments(label, key):
        return [{'label': r[key], 'total': int(r['total']), 'fraud': int(r['fraud_count'])}
                for r in rows(label)]

    counts = rows('label_distribution')[0]
    missing = rows('missing_v1_features')[0]
    total = int(counts['total_rows'])
    model = evidence['model']
    versions = []
    for key, name in [('model', 'V7'), ('v8', 'V8'), ('v9', 'V9')]:
        r = evidence[key]
        metrics = r['validation_metrics']
        assert metrics['tp'] + metrics['fp'] == metrics['alerts']
        assert metrics['tp'] + metrics['fn'] == metrics['fraud']
        assert metrics['tp'] + metrics['fp'] + metrics['fn'] + metrics['tn'] == metrics['rows']
        versions.append({'id': name, 'metrics': metrics,
                         'role': 'serving' if key == 'model' else 'rejected',
                         'sourceLayer': 'silver' if key == 'v8' else 'gold',
                         'runId': r.get('run_id', r.get('mlflow_run_id'))})
    assert evidence['v9']['baseline_gold_replay_matches_manifest']
    monthly = [{'month': r['month'], 'v7': r['baseline'], 'v9': r['candidate']}
               for r in evidence['v9']['monthly']]
    assert sum(r['v7']['tp'] for r in monthly) == model['validation_metrics']['tp']
    normalized = next(r['data'] for r in evidence['features']['results']
                      if r['label'] == 'normalized_amount_missing')
    normalized_missing = int(normalized['external_links'][0]['data_array'][0][1])
    snapshot = {
        'schemaVersion': 1, 'publishedAt': '2026-10-05',
        'dataset': {
            'source': 'workspace.bank_silver.transactions', 'deltaVersion': 1,
            'profiledAt': '2026-09-28', 'total': total, 'fraud': int(counts['positives']),
            'nullIds': int(rows('row_counts')[0]['null_ids']), 'nullLabels': int(counts['null_labels']),
            'duplicates': int(rows('key_duplicates')[0]['duplicate_count']),
            'dateRange': rows('date_range')[0],
            'countries': segments('country_profile', 'country'),
            'channels': segments('channel_profile', 'channel'),
            'types': segments('type_profile', 'transaction_type'),
            'currencies': [{'label': r['currency'], 'total': int(r['total'])} for r in rows('currency_distribution')],
            # Only already-profiled training/validation months are published as a trend.
            'monthly': [{'month': r['month'][:7], 'total': int(r['total']), 'fraud': int(r['fraud_count'])}
                        for r in rows('monthly_totals') if r['month'][:7] < '2026-01'],
            'quality': [
                {'id': 'merchant_category', 'missing': int(missing['null_merchant_category']), 'total': total},
                {'id': 'amount_usd_raw', 'missing': int(missing['null_amount_usd']), 'total': total},
                {'id': 'amount_usd_normalized', 'missing': normalized_missing, 'total': total},
                {'id': 'labels', 'missing': int(counts['null_labels']), 'total': total},
                {'id': 'ids', 'missing': int(rows('row_counts')[0]['null_ids']), 'total': total},
            ],
            'audit': {
                'before': '2025-07-01', 'auditedAt': '2026-10-05',
                'transactions': audited_count('dimension_audit', 'Total'),
                'registrationAfter': audited_count('dimension_audit', 'Customer registration later than transaction'),
                'openingAfter': audited_count('dimension_audit', 'Product opening day later than transaction'),
                'digitalEvents': audited_count('digital_audit', 'Events'),
                'digitalUnlinked': audited_count('digital_audit', 'Events with null customer'),
                'processingBefore': audited_count('digital_audit', 'Processing date before event calendar date'),
            },
        },
        'model': {'version': model['model_version'], 'algorithm': 'CatBoost',
                  'threshold': model['threshold'], 'source': model['source_table'],
                  'deltaVersion': model['delta_version'], 'runId': model['run_id'],
                  'validationFrom': '2025-07-01', 'validationTo': '2025-12-31',
                  'experimental': True, 'automaticDecisionsEnabled': False,
                  'finalTestUsed': False, 'versions': versions, 'monthly': monthly,
                  'digitalCoverage': [
                      {'id': key.upper(), 'covered': next(r['rows'] for r in evidence[key]['coverage']
                        if r['period'] == 'validation' and r['digital_available'] == 1),
                       'total': model['validation_metrics']['rows']} for key in ['v8', 'v9']
                  ]},
        'evidence': [{'path': path, 'sha256': hashlib.sha256((ROOT / path).read_bytes()).hexdigest()}
                     for path in paths.values()],
    }
    assert sum(r['total'] for r in snapshot['dataset']['countries']) == total
    assert sum(r['fraud'] for r in snapshot['dataset']['countries']) == snapshot['dataset']['fraud']
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    build()
