import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('responsive', Path(__file__).resolve().parents[2] / 'scripts/preview-responsive.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class ResponsiveTests(unittest.TestCase):
    def test_legal_patch_only_adds_scoped_mobile_wrapping(self):
        source = b'<html><head><script>untouched()</script><link rel="canonical" href="x"></head><body><h1>Same text</h1></body></html>'
        for route in patch.LEGAL:
            result, changes = patch.patch_responsive(source, route)
            added = ('<style data-esmeralda-responsive-patch="1">' + patch.LEGAL_CSS + '</style>').encode()
            self.assertEqual(result.replace(added, b''), source)
            self.assertEqual(changes, {'responsive_patch_version': 1})
            self.assertNotIn(b'overflow:hidden', result)

    def test_products_patch_repairs_grid_minimum_without_changing_existing_card_fallback(self):
        source = b'<head></head><body><img class="fmcg-product-image w-dyn-bind-empty"></body>'
        result, _ = patch.patch_responsive(source, '/produkter')
        self.assertIn(b'grid-template-columns:minmax(0,1fr)', result)
        self.assertTrue(result.endswith(source.split(b'</head>')[1]))

    def test_only_exact_empty_hero_becomes_honest_text(self):
        source = ('<head></head>' + patch.EMPTY_HERO + '<img src="valid.jpg" alt="Other">').encode()
        result, changes = patch.patch_responsive(source, '/produkter/tiramisu')
        self.assertEqual(result, source.replace(patch.EMPTY_HERO.encode(), patch.FALLBACK.encode()))
        self.assertEqual(changes['empty_image_fallbacks'], 1)
        for bad in [b'<head></head>', source + patch.EMPTY_HERO.encode()]:
            with self.assertRaises(ValueError): patch.patch_responsive(bad, '/produkter/tiramisu')

    def test_other_routes_are_byte_identical_and_double_patch_is_rejected(self):
        source = b'<head></head><body>Preserve me</body>'
        for route in ['/', '/kontakt', '/produkter/other', '/privatlivspolitik/']:
            self.assertEqual(patch.patch_responsive(source, route), (source, {}))
        once, _ = patch.patch_responsive(source, '/produkter')
        with self.assertRaises(ValueError): patch.patch_responsive(once, '/produkter')


if __name__ == '__main__': unittest.main()
