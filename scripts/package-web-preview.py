"""Package pinned v8 source with deterministic, recorded preview navigation patches."""
import base64, gzip, hashlib, importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('preview_navigation', Path(__file__).with_name('preview-navigation.py'))
navigation = importlib.util.module_from_spec(spec); spec.loader.exec_module(navigation)
spec = importlib.util.spec_from_file_location('preview_contact', Path(__file__).with_name('preview-contact.py'))
contact = importlib.util.module_from_spec(spec); spec.loader.exec_module(contact)
spec = importlib.util.spec_from_file_location('preview_responsive', Path(__file__).with_name('preview-responsive.py'))
responsive = importlib.util.module_from_spec(spec); spec.loader.exec_module(responsive)
source = Path(sys.argv[1]); dest = Path('preview/esmeralda')
report = json.loads((source / 'preview-manifest.json').read_text())
assert report['source_manifest_sha256'] == 'd4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc'
assert len(report['pages']) == 104
source_manifest = Path(sys.argv[2]).read_bytes()
assert hashlib.sha256(source_manifest).hexdigest() == report['source_manifest_sha256']
source_inventory = json.loads(source_manifest)
expected_pages = {p['file']: p['sha256'] for p in source_inventory['pages']}
assert len(expected_pages) == 104
assert {p['source'] for p in report['pages']} == set(expected_pages)
for p in report['pages']: assert p['sha256'] == expected_pages[p['source']]
expected_assets = {a['file']:a for a in source_inventory['assets']}
assert len(expected_assets) == 269
routes = {p['route']: p['output'] for p in report['pages']}
assets = sorted((source/'dist/_assets').iterdir()); assert len(assets) == 269
assert set(expected_assets) == {'_assets/'+p.name for p in assets}
routes.update({'/_assets/'+p.name: '_assets/'+p.name for p in assets})
routes['/robots.txt'] = 'robots.txt'
entries = {}
page_inventory = {p['route']:p for p in report['pages']}
patches = {}
for route, name in sorted(routes.items()):
    data = (source/'dist'/name).read_bytes()
    if name in expected_assets:
        expected = expected_assets[name]
        assert len(data) == expected['bytes']
        assert hashlib.sha256(data).hexdigest() == expected['output_sha256']
    if route in page_inventory:
        original_sha = hashlib.sha256(data).hexdigest()
        assert original_sha == page_inventory[route]['sha256']
        data, changes = navigation.patch_page(data, route, set(page_inventory))
        if route == '/kontakt':
            data = contact.patch_contact(data)
            changes['contact_adapter_version'] = 1
        data, responsive_changes = responsive.patch_responsive(data, route)
        changes.update(responsive_changes)
        patches[route] = {'source_sha256': original_sha, **changes}
    entries[route] = {'data': base64.b64encode(data).decode(), 'sha256': hashlib.sha256(data).hexdigest(), 'file': name, 'size': len(data)}
adapter = Path('preview/esmeralda/adapters/website-contact-adapter.js').read_bytes()
adapter_sha = hashlib.sha256(adapter).hexdigest()
assert adapter_sha == 'eb6ec999568ddea7e312638f3c46bdc58672cbe6566fd1569ce856953acd3ef9'
entries[contact.ADAPTER_ROUTE] = {'data': base64.b64encode(adapter).decode(), 'sha256': adapter_sha, 'file': '_assets/website-contact-adapter.js', 'size': len(adapter)}
payload = gzip.compress(json.dumps(entries, separators=(',',':')).encode(), mtime=0)
dest.mkdir(parents=True, exist_ok=True)
for index, start in enumerate(range(0, len(payload), 6 * 1024 * 1024)):
    (dest/f'payload.json.gz.part-{index:03d}').write_bytes(payload[start:start+6*1024*1024])
assert len(payload) <= 18 * 1024 * 1024
manifest = {'source_manifest_sha256': report['source_manifest_sha256'], 'navigation_patch_version': 1, 'page_patches': patches, 'payload_sha256': hashlib.sha256(payload).hexdigest(), 'routes': {k:{a:b for a,b in v.items() if a!='data'} for k,v in entries.items()}}
manifest['added_assets'] = {contact.ADAPTER_ROUTE: {'sha256': adapter_sha, 'source': 'preview/esmeralda/adapters/website-contact-adapter.js', 'upstream': 'Esmeralda-Website#46; esmeralda-restaurant-operations/webflow/website-contact-adapter.js', 'activation': 'disabled'}}
(dest/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(len(entries),len(payload),manifest['payload_sha256'])
