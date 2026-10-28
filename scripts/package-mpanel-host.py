"""Package the reviewed Website #45 materialized artifact without fetching live content."""
import argparse, base64, gzip, hashlib, json
from pathlib import Path
from urllib.parse import urlsplit
parser = argparse.ArgumentParser()
parser.add_argument('artifact', type=Path)
args = parser.parse_args()
raw_manifest = (args.artifact / 'asset-manifest.json').read_bytes()
if hashlib.sha256(raw_manifest).hexdigest() != '14036d59e986867ba4977567c4db6011c68a4d9c89d9e0d1d21845f7b557338b':
    raise ValueError('Unreviewed mPanel asset manifest; no files written')
source = json.loads(raw_manifest)
assert len(source['pages']) == 7 and len(source['assets']) == 39
entries = {}
for row in source['pages'] + source['assets']:
    data = (args.artifact / 'public' / row['file']).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert digest == row.get('output_sha256', row.get('sha256'))
    path = urlsplit(row['source_url']).path if row in source['pages'] else '/' + row['file']
    entries[path] = dict(file=row['file'], sha256=digest, size=len(data), data=base64.b64encode(data).decode())
data = b'User-agent: *\nDisallow: /\n'
entries['/robots.txt'] = dict(file='robots.txt', sha256=hashlib.sha256(data).hexdigest(), size=len(data), data=base64.b64encode(data).decode())
payload = gzip.compress(json.dumps(entries, sort_keys=True, separators=(',', ':')).encode(), mtime=0)
output = Path(__file__).resolve().parents[1] / 'mpanel/esmeralda'
output.mkdir(parents=True, exist_ok=True)
(output / 'payload.json.gz').write_bytes(payload)
manifest = dict(source_repository='digiflydk/Esmeralda-Website', source_commit='c041fdedefd6ba8c950190943d6033f9e1dc5427', source_archive_sha256='d1399dfd5b141e9ec60994de255d7c447dbd61142c29817c015ba37c89987c1d', payload_sha256=hashlib.sha256(payload).hexdigest(), routes={k:{a:b for a,b in v.items() if a != 'data'} for k,v in entries.items()})
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
print(f'Packaged {len(entries)} exact routes; {len(payload)} compressed bytes')
