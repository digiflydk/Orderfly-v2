"""Byte-range HTML navigation patches for the isolated Esmeralda preview."""
import html
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit

_ATTRIBUTE = re.compile(r'''(?P<name>[^\s=/>]+)(?:\s*=\s*(?P<value>"[^"]*"|'[^']*'|[^\s>]+))?''')
_OLD_ORIGIN = re.compile(r'^(?:https?:)?//(?:www\.)?esmeraldapizza\.dk(?=[/?#]|$)', re.I)


def local_href(value, routes):
    """Only known public paths on the two original website hosts are local."""
    if not _OLD_ORIGIN.match(value) or '\\' in value or any(ord(c) < 33 for c in value):
        return None
    parts = urlsplit(value)
    if parts.netloc.lower() not in {'esmeraldapizza.dk', 'www.esmeraldapizza.dk'}:
        return None
    if (parts.path or '/') not in routes:
        return None
    suffix = _OLD_ORIGIN.sub('', value, count=1)
    return suffix if suffix.startswith('/') else '/' + suffix


class NavigationPatch(HTMLParser):
    def __init__(self, source, routes, contact):
        super().__init__(convert_charrefs=False)
        self.source, self.routes, self.contact = source, routes, contact
        self.line_offsets = [0]
        for match in re.finditer('\n', source):
            self.line_offsets.append(match.end())
        self.edits = []
        self.links = 0
        self.contact_sections = []
        self.contact_ids = 0
        self.rcdata = None

    def handle_starttag(self, tag, attrs):
        if self.rcdata is not None:
            return
        if tag in {'textarea', 'title'}:
            self.rcdata = tag
        raw = self.get_starttag_text()
        row, col = self.getpos()
        start = self.line_offsets[row - 1] + col
        pairs = dict(attrs)
        self.contact_ids += sum(k == 'id' and v == 'kontaktformular' for k, v in attrs)
        if self.contact and tag == 'section' and 'contact-form-section-dark' in pairs.get('class', '').split():
            self.contact_sections.append((start, raw, pairs))
        if tag != 'a':
            return
        tokens = list(_ATTRIBUTE.finditer(raw, re.match(r'<\s*[^\s/>]+', raw).end()))
        hrefs = [token for token in tokens if token['name'].lower() == 'href']
        if len(hrefs) > 1:
            raise ValueError('Ambiguous duplicate href')
        if not hrefs or hrefs[0]['value'] is None:
            return
        token = hrefs[0]
        value = token['value']
        quote = value[0] if value[0] in "\"'" else ''
        decoded = html.unescape(value[1:-1] if quote else value)
        replacement = local_href(decoded, self.routes)
        if replacement is None:
            return
        # Always quote rewritten values, including originally unquoted attributes.
        quote = quote or '"'
        encoded = html.escape(replacement, quote=True)
        self.edits.append((start + token.start('value'), start + token.end('value'), quote + encoded + quote))
        self.links += 1

    handle_startendtag = handle_starttag

    def handle_endtag(self, tag):
        if tag == self.rcdata:
            self.rcdata = None

    def finish(self):
        anchor_added = False
        if self.contact:
            if len(self.contact_sections) != 1:
                raise ValueError('Expected one contact form section')
            start, raw, attrs = self.contact_sections[0]
            if self.contact_ids:
                if self.contact_ids != 1 or attrs.get('id') != 'kontaktformular':
                    raise ValueError('Contact anchor belongs to another element or is duplicated')
            else:
                if 'id' in attrs:
                    raise ValueError('Do not replace an existing contact section id')
                at = start + raw.rfind('>')
                self.edits.append((at, at, ' id="kontaktformular"'))
                anchor_added = True
        patched = self.source
        for start, end, replacement in sorted(self.edits, reverse=True):
            patched = patched[:start] + replacement + patched[end:]
        return patched, {'internal_links': self.links, 'contact_anchor_added': anchor_added}


def patch_page(data, route, public_routes):
    parser = NavigationPatch(data.decode('utf-8'), public_routes, route == '/kontakt')
    parser.feed(parser.source)
    parser.close()
    result, changes = parser.finish()
    return result.encode('utf-8'), changes
