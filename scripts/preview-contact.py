"""Minimal byte-range patches for the captured contact form, never cookie forms."""
import re
from html.parser import HTMLParser

FORM_ID = '6f9737ee-d6c8-8a30-938d-d30bd92e6335'
ADAPTER_ROUTE = '/_assets/website-contact-adapter.js'
ATTRIBUTE = re.compile(r'''\s+(?P<name>[^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?''')


class ContactPatch(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0] + [m.end() for m in re.finditer('\n', source)]
        self.edits = []
        self.forms = self.buttons = self.heads = 0
        self.message_labels = 0
        self.inside = False
        self.rcdata = None

    def handle_starttag(self, tag, attrs):
        if self.rcdata:
            return
        if tag in {'textarea', 'title'}:
            self.rcdata = tag
        raw = self.get_starttag_text()
        row, col = self.getpos()
        start = self.offsets[row - 1] + col
        pairs = dict(attrs)
        if tag == 'head':
            self.heads += 1
            at = start + len(raw)
            # Synchronous first-head script installs the capture guard before Webflow.
            self.edits.append((at, at, f'<script src="{ADAPTER_ROUTE}"></script>'))
        if tag == 'form':
            if self.inside:
                raise ValueError('Nested contact form')
            if pairs.get('data-wf-element-id') != FORM_ID:
                return
            if len(attrs) != len(pairs):
                raise ValueError('Duplicate contact form attribute')
            self.forms += 1
            self.inside = True
            remove = {'method', 'action', 'data-wf-page-id', 'data-wf-element-id', 'data-turnstile-sitekey'}
            if any(k.startswith('data-website-contact') for k in pairs):
                raise ValueError('Unexpected preconfigured contact adapter')
            for token in ATTRIBUTE.finditer(raw):
                if token['name'].lower() in remove:
                    self.edits.append((start + token.start(), start + token.end(), ''))
            at = start + raw.rfind('>')
            self.edits.append((at, at, ' method="post" data-website-contact=""'))
        if self.inside and tag in {'input', 'button'} and pairs.get('type', '').lower() == 'submit':
            self.buttons += 1
            if 'disabled' not in pairs:
                at = start + raw.rfind('/>') if raw.endswith('/>') else start + raw.rfind('>')
                self.edits.append((at, at, ' disabled'))
        if self.inside and tag == 'label' and pairs.get('for') == 'Visitors':
            self.message_labels += 1
            for token in ATTRIBUTE.finditer(raw):
                if token['name'].lower() == 'for':
                    self.edits.append((start + token.start(), start + token.end(), ' for="contact-message"'))

    handle_startendtag = handle_starttag

    def handle_endtag(self, tag):
        if self.rcdata:
            if tag == self.rcdata:
                self.rcdata = None
            return
        if tag == 'form':
            self.inside = False

    def finish(self):
        if (self.forms, self.buttons, self.heads, self.message_labels) != (1, 1, 1, 1) or self.inside:
            raise ValueError('Expected exactly one complete contact form, submit and head')
        result = self.source
        for start, end, text in sorted(self.edits, reverse=True):
            result = result[:start] + text + result[end:]
        return result.encode('utf-8')


def patch_contact(data):
    parser = ContactPatch(data.decode('utf-8'))
    parser.feed(parser.source)
    parser.close()
    return parser.finish()
