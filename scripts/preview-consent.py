"""Replace only hash-pinned captured tracking/consent blocks; preserve v8 input."""
import hashlib
import re
from pathlib import Path

ADAPTER_ROUTE = '/_assets/website-consent.js'
META = '70d344c677854fc562f7b6c821e4796d62b318c3290981685c1b0d7b2843d3cf'
GTM = '5f95e223f22c531a75cd3bb7f7558b5a9c183cffa34fcdecba22b0aaefb0bc8a'
COMMON = 'a0dd4a9f5c4a857e4f0662970983c859e7e7dd2bbdf3ce9a7c5c36c1a4d3b256'
OMNI = 'be819c3b95d421f67c1a6e3b4e4042fa81353a65c3ab55791e73b9bb96acd98d'
OMNI_ROUTES = {'/book-bord','/faq','/kontakt','/menu','/nyhedsbrev','/om-esmeralda-pizza'}
NEWSLETTER = '<div id="omnisend-embedded-v2-69676d920d7f53dc4d707a29"></div>'
FALLBACK = '<p data-newsletter-consent-fallback=""><span data-newsletter-consent-message="">Tilmeldingsformularen er ikke indlæst uden marketingcookies.</span> <button type="button" flowappz-cookie-command="manage-settings">Åbn cookieindstillinger</button></p>'


def patch_consent(data, route):
    source = data.decode('utf-8')
    found = {META:0,GTM:0,COMMON:0,OMNI:0}
    def script(match):
        raw = match.group()
        pin = hashlib.sha256(raw.encode()).hexdigest()
        if pin not in found:
            return raw
        found[pin] += 1
        if pin == COMMON:
            return Path(__file__).with_name('website-ui-preserved.html').read_text()
        return ''
    source = re.sub(r'<script\b[^>]*>.*?</script>', script, source, flags=re.S)
    if any(found[pin] != 1 for pin in [META,GTM,COMMON]) or found[OMNI] != int(route in OMNI_ROUTES):
        raise ValueError('Captured consent/tracking script inventory changed: '+route)
    # The captured Meta noscript pixel bypasses JS consent altogether.
    pixels = [p for p in re.findall(r'<noscript>.*?</noscript>', source, re.S) if 'https://www.facebook.com/tr?' in p]
    if len(pixels) != 1 or not re.fullmatch(r'<noscript>\s*<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr\?id=773544982454626&ev=PageView&noscript=1" alt="" />\s*</noscript>',pixels[0]):
        raise ValueError('Captured Meta noscript pixel changed: '+route)
    source = source.replace(pixels[0], '')
    if source.count('<head>') != 1 or ADAPTER_ROUTE in source:
        raise ValueError('Expected one unpatched captured head')
    source = source.replace('<head>', '<head><script src="'+ADAPTER_ROUTE+'"></script>')
    if route == '/nyhedsbrev':
        if source.count(NEWSLETTER) != 1:
            raise ValueError('Expected exact newsletter mount')
        source = source.replace(NEWSLETTER, NEWSLETTER+FALLBACK)
    return source.encode(), {'consent_patch_version':1,'removed_eager_omnisend':found[OMNI]}
