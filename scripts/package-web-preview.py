"""Package reviewed Website PR59 output; no network, no source rewriting."""
import base64, gzip, hashlib, json, sys
from pathlib import Path
source = Path(sys.argv[1]); dest = Path('preview/esmeralda')
report = json.loads((source / 'preview-manifest.json').read_text())
assert report['source_manifest_sha256'] == 'd4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc'
assert len(report['pages']) == 104
source_manifest = Path(sys.argv[2]).read_bytes()
assert hashlib.sha256(source_manifest).hexdigest() == report['source_manifest_sha256']
source_inventory = json.loads(source_manifest)
expected_assets = {a['file']:a for a in source_inventory['assets']}
assert len(expected_assets) == 269
routes = {p['route']: p['output'] for p in report['pages']}
assets = sorted((source/'dist/_assets').iterdir()); assert len(assets) == 269
assert set(expected_assets) == {'_assets/'+p.name for p in assets}
routes.update({'/_assets/'+p.name: '_assets/'+p.name for p in assets})
routes['/robots.txt'] = 'robots.txt'
entries = {}
for route, name in sorted(routes.items()):
    data = (source/'dist'/name).read_bytes()
    if name in expected_assets:
        expected = expected_assets[name]
        assert len(data) == expected['bytes']
        assert hashlib.sha256(data).hexdigest() == expected['output_sha256']
    entries[route] = {'data': base64.b64encode(data).decode(), 'sha256': hashlib.sha256(data).hexdigest(), 'file': name, 'size': len(data)}
for p in report['pages']: assert entries[p['route']]['sha256'] == p['sha256']
payload = gzip.compress(json.dumps(entries, separators=(',',':')).encode(), mtime=0)
dest.mkdir(parents=True, exist_ok=True)
for index, start in enumerate(range(0, len(payload), 6 * 1024 * 1024)):
    (dest/f'payload.json.gz.part-{index:03d}').write_bytes(payload[start:start+6*1024*1024])
assert len(payload) <= 18 * 1024 * 1024
manifest = {'source_manifest_sha256': report['source_manifest_sha256'], 'payload_sha256': hashlib.sha256(payload).hexdigest(), 'routes': {k:{a:b for a,b in v.items() if a!='data'} for k,v in entries.items()}}
(dest/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(len(entries),len(payload),manifest['payload_sha256'])
