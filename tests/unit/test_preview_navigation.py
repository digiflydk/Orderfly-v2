import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('nav', Path(__file__).parents[2]/'scripts/preview-navigation.py')
nav = importlib.util.module_from_spec(spec); spec.loader.exec_module(nav)

class NavigationTests(unittest.TestCase):
    routes = {'/', '/kontakt', '/menu/pizza', '/dishes/example'}

    def test_known_hosts_and_query_fragment_preserved(self):
        for origin in ['https://esmeraldapizza.dk', 'http://www.esmeraldapizza.dk', '//www.esmeraldapizza.dk', 'https://ESMERALDAPIZZA.DK']:
            self.assertEqual(nav.local_href(origin+'/menu/pizza?a=%2F&b=1#dish', self.routes), '/menu/pizza?a=%2F&b=1#dish')
        self.assertEqual(nav.local_href('https://esmeraldapizza.dk?x=1#top',self.routes), '/?x=1#top')
        self.assertEqual(nav.local_href('https://esmeraldapizza.dk/?#',self.routes), '/?#')

    def test_external_private_unknown_and_lookalikes_unchanged(self):
        for href in ['https://esmeralda.orderfly.dk/club', 'mailto:a@esmeraldapizza.dk', 'tel:123', '/kontakt', '#kontaktformular', 'javascript:alert(1)', 'https://esmeraldapizza.dk.evil.test/kontakt', 'https://evil.test@esmeraldapizza.dk/kontakt', 'https://esmeraldapizza.dk:443/kontakt', 'https://esmeraldapizza.dk/mpanel', 'https://esmeraldapizza.dk/unknown', 'https://esmeraldapizza.dk/../kontakt', 'https://esmeraldapizza.dk/%6bontakt', 'https://esmeraldapizza.dk\\@evil.test/kontakt', 'https://esmeraldapizza.dk/kon\ntakt']:
            self.assertIsNone(nav.local_href(href,self.routes),href)

    def test_only_anchor_values_change_not_canonical_script_or_attribute_text(self):
        untouched='<link rel="canonical" href="https://esmeraldapizza.dk/kontakt"><script>const x="<a href=\'https://esmeraldapizza.dk/kontakt\'>";</script><!-- <a href="https://esmeraldapizza.dk/kontakt"> -->'
        untouched += '<textarea><a href="https://esmeraldapizza.dk/kontakt">example</textarea><title><a href="https://esmeraldapizza.dk/kontakt"></title>'
        page=untouched+'\n<a data-note="href=\'https://esmeraldapizza.dk/kontakt\'" href="https://esmeraldapizza.dk/kontakt?x=1&amp;b=%2F#form">Hi</a>'
        result,patch=nav.patch_page(page.encode(), '/',self.routes)
        self.assertTrue(result.decode().startswith(untouched))
        self.assertIn('data-note="href=\'https://esmeraldapizza.dk/kontakt\'"',result.decode())
        self.assertIn('href="/kontakt?x=1&amp;b=%2F#form"',result.decode())
        self.assertEqual(patch['internal_links'],1)

    def test_quoted_unquoted_entities_and_injection_stay_attributes(self):
        source='<A HREF=https://esmeraldapizza.dk/kontakt>x</A><a href=\'https://esmeraldapizza.dk/kontakt?q=&quot;&apos;&lt;script&gt;#x\'>y</a>'
        result,_=nav.patch_page(source.encode(), '/',self.routes)
        self.assertEqual(result.count(b'<script>'),0)
        self.assertIn(b'HREF="/kontakt"',result)
        self.assertIn(b'&quot;&#x27;&lt;script&gt;',result)

    def test_contact_section_anchor_and_form_ids_preserved(self):
        source='<section class="x contact-form-section-dark"><form id="email-form"><input id="First-name"></form></section>'
        result,patch=nav.patch_page(source.encode(),'/kontakt',self.routes)
        self.assertIn(b'<section class="x contact-form-section-dark" id="kontaktformular">',result)
        self.assertIn(b'<form id="email-form"><input id="First-name">',result)
        self.assertTrue(patch['contact_anchor_added'])
        second,patch2=nav.patch_page(result,'/kontakt',self.routes)
        self.assertEqual(result,second)
        self.assertFalse(patch2['contact_anchor_added'])

    def test_ambiguous_markup_fails_closed(self):
        for page in ['<div id="kontaktformular"></div><section class="contact-form-section-dark"></section>', '<section id="other" class="contact-form-section-dark"></section>', '<section class="contact-form-section-dark"></section>'*2, '<form></form>']:
            with self.assertRaises(ValueError):nav.patch_page(page.encode(),'/kontakt',self.routes)
        with self.assertRaises(ValueError):nav.patch_page(b'<a href="/" href="https://esmeraldapizza.dk/">','/',self.routes)

if __name__=='__main__':unittest.main()
