/** Source-based cutouts and explicitly labelled illustrations for the approved V2 menu only. */
const assets: Record<string, {file: string; illustration?: boolean}> = {
  'f10a57a7-ecfa-4f70-86b0-b0b435120440': {file: 'pepsi'},
  '53102f7c-a218-4028-804b-61a10aa3e646': {file: 'pepsi-max'},
  '40adc2d6-2b59-4cc1-94b1-901e9758f5b0': {file: 'faxe-kondi'},
  '8d43f3df-69f5-4a7f-80ca-6303d7210e0d': {file: 'faxe-kondi-free'},
  'eb643661-bb1f-4311-b1cc-7bd65e6b46f5': {file: 'garlic'},
  'esmeralda-v2-combo-dip-chili-20261030': {file: 'chili-illustration', illustration: true},
  'esmeralda-v2-combo-dip-dressing-20261030': {file: 'dressing-illustration', illustration: true},
  'esmeralda-v2-combo-dip-pesto-20261030': {file: 'pesto-illustration', illustration: true},
};

/** Exact source identity keeps a later catalog photo upload authoritative.
 * Public download-token rotation does not represent a different photograph. */
const pizzaAssets: Record<string, {source: string; categoryId: string}> = {
  "a401ceb4-3638-4bad-9a39-0088827eade4": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fa401ceb4-3638-4bad-9a39-0088827eade4%2F508a1f46-b9eb-4b46-b8d5-55d046b1fc3a.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "29438e4e-031b-4db0-a685-f00c663970be": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F29438e4e-031b-4db0-a685-f00c663970be%2F44839b6d-8f70-4e0f-9bff-14426bb269e1.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "4421b54e-6dc6-4e03-9871-f3abe1046498": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F4421b54e-6dc6-4e03-9871-f3abe1046498%2Fde5fe3e2-68ce-431a-a08d-7c5f347d8536.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "9e6202ff-1f3a-4ed8-81f8-1615c13be554": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F9e6202ff-1f3a-4ed8-81f8-1615c13be554%2F36cc94c5-f8f4-4279-aba6-5f3802d996b4.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "c90c5f41-09ec-459f-8125-3cc18c44a34b": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fc90c5f41-09ec-459f-8125-3cc18c44a34b%2F4b39af53-109b-4315-9092-6a784ae2aaee.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "4a663f7b-4137-4f3c-b9f2-8f58485f278c": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F4a663f7b-4137-4f3c-b9f2-8f58485f278c%2Fd977a06c-79f7-4c65-8792-f35cad4a5206.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "9093764d-3e09-4426-b3b6-c786a6000d26": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F9093764d-3e09-4426-b3b6-c786a6000d26%2F48745e92-379b-4583-9941-26d723afc482.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "2840ec1c-e8eb-410b-ace6-5ab1b8627204": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F2840ec1c-e8eb-410b-ace6-5ab1b8627204%2F90245a11-a101-4afe-9b5b-775f1f1ce943.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "deb2547a-e459-4825-8185-039a7d4a77db": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fdeb2547a-e459-4825-8185-039a7d4a77db%2F38d9d562-5595-4abc-a927-dae7f64ce9b2.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "cbdefe9c-c780-4d47-aeed-953314bb6562": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fcbdefe9c-c780-4d47-aeed-953314bb6562%2F96f20bba-d566-4d56-9094-aaa0054291d0.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "bd132f04-bf7d-43c7-9ed8-aa4fe6cfad21": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fbd132f04-bf7d-43c7-9ed8-aa4fe6cfad21%2F6b7bac7c-a4dc-4199-8bc3-db97380875fa.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "4e830bb7-fe85-43fd-95b3-ecef14097818": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F4e830bb7-fe85-43fd-95b3-ecef14097818%2F88e7f421-f993-4745-99f6-2c519f8efe3b.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "b83e124e-987c-4953-a3c1-5576daf8fb72": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fb83e124e-987c-4953-a3c1-5576daf8fb72%2F9f3383fe-44b3-4fc7-bf4b-e5f48563dd6d.avif",
    "categoryId": "1GI7k6LbgpPuTzRBXXxb"
  },
  "84229e93-2f15-4497-9257-6bbd2d028278": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F84229e93-2f15-4497-9257-6bbd2d028278%2F3f66824d-15eb-497a-be8b-0c3178f7c51f.avif",
    "categoryId": "RbHTbJlcCXQiQ3dgSQyw"
  },
  "2f17066f-6773-4808-908a-f1e60793ed38": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F2f17066f-6773-4808-908a-f1e60793ed38%2Ffa35a74b-2714-43f0-9767-80e001b89aee.avif",
    "categoryId": "RbHTbJlcCXQiQ3dgSQyw"
  }
};

export type PizzaImageProduct = {id: string; brandId: string; categoryId?: string; imageUrl?: string | null; productName?: string};

export function esmeraldaPizzaImage(isV2: boolean, product: PizzaImageProduct) {
  if (!isV2 || product.brandId !== 'oeypKaMyYcQjIwaa1PtV') return undefined;
  const asset = pizzaAssets[product.id];
  if (!asset || product.categoryId !== asset.categoryId || !product.imageUrl) return undefined;
  // Deliberately do not match by product name, URL suffix or category alone.
  if (product.imageUrl.split('?')[0] !== asset.source) return undefined;
  return {src: `/images/esmeralda-v2/menu/pizza-${product.id}.webp`};
}

export const ESMERALDA_MENU_IMAGE_PATHS = [
  ...Object.values(assets).map(asset => `/images/esmeralda-v2/menu/${asset.file}.webp`),
  ...Object.keys(pizzaAssets).map(id => `/images/esmeralda-v2/menu/pizza-${id}.webp`),
];

export function esmeraldaMenuImage(isV2: boolean, brandId: string, comboId: string, productId: string) {
  if (!isV2 || brandId !== 'oeypKaMyYcQjIwaa1PtV' || comboId !== 'esmeralda-v2-pizzamenu-20261030') return undefined;
  const asset = assets[productId];
  return asset ? {src: `/images/esmeralda-v2/menu/${asset.file}.webp`, illustration: !!asset.illustration} : undefined;
}
