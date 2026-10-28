"""Recorded, route-scoped repairs for observed captured-source mobile defects."""

LEGAL = {'/handelsbetingelser', '/privatlivspolitik'}
LEGAL_CSS = '@media(max-width:767px){.section_policy .about_text :is(h1,h2,h3){max-width:100%;overflow-wrap:anywhere}}'
PRODUCT_CSS = '@media(max-width:767px){.fmcg-products-section .fmcg-product-auto-grid{grid-template-columns:minmax(0,1fr)}.fmcg-products-section .fmcg-product-auto-grid>.w-dyn-item{min-width:0}.fmcg-products-section .fmcg-product-card-title{overflow-wrap:anywhere}}'
EMPTY_HERO = '<img loading="lazy" alt="Esmeralda Tiramisu" class="fmcg-hero-image w-dyn-bind-empty"/>'
FALLBACK = '<p class="fmcg-image-fallback">Produktbillede ikke tilgængeligt</p>'


def patch_responsive(data, route):
    if route not in LEGAL | {'/produkter', '/produkter/tiramisu'}:
        return data, {}
    source = data.decode('utf-8')
    if 'data-esmeralda-responsive-patch' in source:
        raise ValueError('Responsive patch already present')
    changes = {'responsive_patch_version': 1}
    if route == '/produkter/tiramisu':
        if source.count(EMPTY_HERO) != 1:
            raise ValueError('Expected one exact captured empty Tiramisu hero')
        source = source.replace(EMPTY_HERO, FALLBACK)
        changes['empty_image_fallbacks'] = 1
    else:
        if source.count('</head>') != 1:
            raise ValueError('Expected one captured head')
        css = LEGAL_CSS if route in LEGAL else PRODUCT_CSS
        source = source.replace('</head>', '<style data-esmeralda-responsive-patch="1">' + css + '</style></head>')
    return source.encode('utf-8'), changes
