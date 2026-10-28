import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('contact', ROOT / 'scripts/preview-contact.py')
contact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contact)


def fixture(extra='', form_extra=''):
    return ('<html><head><script>const s="<form data-wf-element-id=ignored>";</script></head><body>'
            '<form id="email-form" data-name="Cookies"><input type="submit"></form>' + extra +
            '<form id="email-form" method="get" action="/old" data-wf-page-id="page" '
            f'data-wf-element-id="{contact.FORM_ID}" data-turnstile-sitekey="unowned" {form_extra}>'
            '<input name="Email"><label for="Visitors">Besked</label><textarea name="Besked"></textarea><input type="submit"/>'
            '</form></body></html>').encode()


class ContactTests(unittest.TestCase):
    def test_exact_form_and_cookie_preservation(self):
        source = fixture()
        result = contact.patch_contact(source)
        self.assertIn(b'<form id="email-form" data-name="Cookies"><input type="submit"></form>', result)
        self.assertIn(b'method="post" data-website-contact=""', result)
        self.assertIn(b'<input type="submit" disabled/>', result)
        self.assertIn(b'<label for="contact-message">Besked</label>', result)
        for removed in (b'data-wf-page-id', b'data-turnstile-sitekey', b'action="/old"', contact.FORM_ID.encode()):
            self.assertNotIn(removed, result)
        self.assertNotIn(b'data-website-contact-enabled', result)
        self.assertNotIn(b'data-website-contact-sitekey', result)
        self.assertEqual(contact.patch_contact(source), result)

    def test_first_head_script_and_original_scripts_unchanged(self):
        source = fixture()
        result = contact.patch_contact(source)
        self.assertIn(b'<head><script src="/_assets/website-contact-adapter.js"></script><script>const s=', result)
        self.assertIn(b'<script>const s="<form data-wf-element-id=ignored>";</script>', result)

    def test_fake_markup_in_comments_rcdata_and_scripts_is_untouched(self):
        fake = f'<form data-wf-element-id="{contact.FORM_ID}"><input type="submit"></form>'
        for extra in (f'<!--{fake}-->', f'<textarea>{fake}</textarea>', f'<title>{fake}</title>', f'<script>"{fake}"</script>'):
            self.assertIn(extra.encode(), contact.patch_contact(fixture(extra)))

    def test_missing_duplicate_and_preconfigured_target_fail_closed(self):
        with self.assertRaises(ValueError):
            contact.patch_contact(fixture().replace(contact.FORM_ID.encode(), b'other'))
        for attrs in ('method="get"', 'data-website-contact-enabled="true"', 'data-website-contact-sitekey="fake"'):
            with self.assertRaises(ValueError):
                contact.patch_contact(fixture(form_extra=attrs))
        with self.assertRaises(ValueError):
            contact.patch_contact(fixture().replace(b'<input type="submit"/>', b''))
        with self.assertRaises(ValueError):
            contact.patch_contact(contact.patch_contact(fixture()))


if __name__ == '__main__':
    unittest.main()
