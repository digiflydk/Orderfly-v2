import type { ApiMapConfig } from '@/lib/docs/api-map-types';
export const brandWebsiteApiMap: ApiMapConfig = {
  module: 'brand-website', label: 'Brand Website · Takeaway',
  description: 'One native ordering flow. The separate website builder is retired (OF-221).',
  cms: {areas: [{id:'overview', label:'Webshops', actions:['getStorefrontOverview'], firestorePaths:['brands/{brandId}','locations/{locationId}'], notes:'Website-view scoped overview; brand editing uses existing catalog permissions.'}]},
  public: {areas: [
    {id:'menu', label:'Native menu', actions:['getBrandAndLocation','getMenuForRender'], firestorePaths:['brands/{brandId}','locations/{locationId}','products/{productId}','categories/{categoryId}']},
    {id:'links', label:'Existing footer links', actions:['getStorefrontLinks'], firestorePaths:['brands/{brandId}/website/config'], notes:'Read-only allowlisted social/legal fields. No CMS activation or template control.'},
  ]},
};
