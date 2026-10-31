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

/** Other approved catalog photographs use the same exact-source safeguards as pizzas. */
const catalogAssets: Record<string, {source: string; categoryId: string; file: string}> = {
  "f2a4e977-7162-44ec-b20f-25630c831fd8": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Ff2a4e977-7162-44ec-b20f-25630c831fd8%2F1044ad54-5d38-454c-b808-983da1fbdcf6.avif",
    "categoryId": "RbHTbJlcCXQiQ3dgSQyw",
    "file": "catalog-f2a4e977-7162-44ec-b20f-25630c831fd8"
  },
  "0599c6d4-4474-4ee6-a127-ea4ba9c16018": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F0599c6d4-4474-4ee6-a127-ea4ba9c16018%2F9d13ace9-5deb-40d5-bf69-fbeba9d65556.avif",
    "categoryId": "RbHTbJlcCXQiQ3dgSQyw",
    "file": "catalog-f2a4e977-7162-44ec-b20f-25630c831fd8"
  },
  "d813fc0a-3334-4cb6-b445-109c977b17ae": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fd813fc0a-3334-4cb6-b445-109c977b17ae%2F7d25340d-fe38-4455-a00b-3988865d2327.avif",
    "categoryId": "0wJG1wPIDV4zGkjueiwd",
    "file": "catalog-d813fc0a-3334-4cb6-b445-109c977b17ae"
  },
  "7d861942-aa99-45a0-a041-b0907adf50dc": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F7d861942-aa99-45a0-a041-b0907adf50dc%2Fb32424b4-5cd7-4b97-bdd4-7f8dc7286316.avif",
    "categoryId": "3wEoIQkuOWSWiWXHwsGO",
    "file": "catalog-7d861942-aa99-45a0-a041-b0907adf50dc"
  },
  "ef1ece34-9522-43c3-b6eb-7adda0b4ac47": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fef1ece34-9522-43c3-b6eb-7adda0b4ac47%2F21f9719a-ce16-4432-b1e3-9870624c83e4.avif",
    "categoryId": "3wEoIQkuOWSWiWXHwsGO",
    "file": "catalog-ef1ece34-9522-43c3-b6eb-7adda0b4ac47"
  },
  "7b10d2be-136b-4d43-8ca6-bf8f94d5b19c": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F7b10d2be-136b-4d43-8ca6-bf8f94d5b19c%2F62879f48-6ef3-46bb-930a-a38c85a6732e.avif",
    "categoryId": "3wEoIQkuOWSWiWXHwsGO",
    "file": "catalog-7b10d2be-136b-4d43-8ca6-bf8f94d5b19c"
  },
  "7c9be71c-01f7-4c0a-ae01-a71ea9f5e2fd": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F7c9be71c-01f7-4c0a-ae01-a71ea9f5e2fd%2F53fe7e64-fb1a-4634-a575-8092b519b04f.avif",
    "categoryId": "3wEoIQkuOWSWiWXHwsGO",
    "file": "catalog-7c9be71c-01f7-4c0a-ae01-a71ea9f5e2fd"
  },
  "eb643661-bb1f-4311-b1cc-7bd65e6b46f5": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Feb643661-bb1f-4311-b1cc-7bd65e6b46f5%2F2050d999-7cc3-43c7-9440-8b0d1a834f1b.avif",
    "categoryId": "3wEoIQkuOWSWiWXHwsGO",
    "file": "catalog-eb643661-bb1f-4311-b1cc-7bd65e6b46f5"
  },
  "d34ab2d4-b960-453b-a8dd-48f1253972bf": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fd34ab2d4-b960-453b-a8dd-48f1253972bf%2F3f259bcb-1d7b-4e19-bb8c-b8f1861481fa.avif",
    "categoryId": "9tAvGBLwUSkpPlwyI2P9",
    "file": "catalog-d34ab2d4-b960-453b-a8dd-48f1253972bf"
  },
  "1565efb9-5fab-4883-a707-013a2db1e3db": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F1565efb9-5fab-4883-a707-013a2db1e3db%2F96d899f7-b29d-45d7-9afe-09676234ec67.avif",
    "categoryId": "9tAvGBLwUSkpPlwyI2P9",
    "file": "catalog-1565efb9-5fab-4883-a707-013a2db1e3db"
  },
  "94c130b4-cfda-4761-9089-52b8a9df3d8f": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F94c130b4-cfda-4761-9089-52b8a9df3d8f%2Fa5d8b330-2959-4445-bd74-527226c24793.avif",
    "categoryId": "9tAvGBLwUSkpPlwyI2P9",
    "file": "catalog-94c130b4-cfda-4761-9089-52b8a9df3d8f"
  },
  "98e74c6a-2749-4d54-a935-0d6bfd0bd499": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F98e74c6a-2749-4d54-a935-0d6bfd0bd499%2F078d1d25-2987-4811-b117-d27356f71873.avif",
    "categoryId": "9tAvGBLwUSkpPlwyI2P9",
    "file": "catalog-98e74c6a-2749-4d54-a935-0d6bfd0bd499"
  },
  "f1cad97e-e830-4b97-ac12-c0f76af43c7f": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Ff1cad97e-e830-4b97-ac12-c0f76af43c7f%2Fabe4816e-b57b-45b3-acac-61cf0a837ac8.avif",
    "categoryId": "7V66KNtkiLBCpEyyaKW3",
    "file": "catalog-f1cad97e-e830-4b97-ac12-c0f76af43c7f"
  },
  "ae41f7cc-2623-4af4-988b-fa0dc9704245": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fae41f7cc-2623-4af4-988b-fa0dc9704245%2Fd7ee6a90-7955-46ec-83cc-4a467701bb9b.avif",
    "categoryId": "7V66KNtkiLBCpEyyaKW3",
    "file": "catalog-ae41f7cc-2623-4af4-988b-fa0dc9704245"
  },
  "3f85e95b-948e-454d-adbb-19412b7fc298": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F3f85e95b-948e-454d-adbb-19412b7fc298%2Fa89810f2-8e0e-4678-b04a-4d8aaafc3e4d.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-3f85e95b-948e-454d-adbb-19412b7fc298"
  },
  "c9180edd-0a5a-4f57-add6-76ec9b85229a": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fc9180edd-0a5a-4f57-add6-76ec9b85229a%2F57415e07-2ad9-4b34-a5d3-3a03591adbac.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-c9180edd-0a5a-4f57-add6-76ec9b85229a"
  },
  "1263b216-64e2-416d-bf75-bb4dd9a56007": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F1263b216-64e2-416d-bf75-bb4dd9a56007%2F08af995e-9519-4c64-b20b-7121c358398e.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-1263b216-64e2-416d-bf75-bb4dd9a56007"
  },
  "783f365d-cbf2-499d-8d1a-01e106f43184": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F783f365d-cbf2-499d-8d1a-01e106f43184%2F8fb442cb-1b46-4131-a3ca-1eca01f190de.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-783f365d-cbf2-499d-8d1a-01e106f43184"
  },
  "729735bf-25e5-465f-8ecf-a2ae472bf2e9": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F729735bf-25e5-465f-8ecf-a2ae472bf2e9%2Fc3e0e486-da53-4f57-b719-e9565c93f8fb.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-729735bf-25e5-465f-8ecf-a2ae472bf2e9"
  },
  "37ce1c4b-5ee3-4695-b835-cef03d709b0e": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F37ce1c4b-5ee3-4695-b835-cef03d709b0e%2Fbf827d48-60aa-40d0-9faf-d24da8cba2a1.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-37ce1c4b-5ee3-4695-b835-cef03d709b0e"
  },
  "4053797d-9167-41d8-8f7f-db865db5997b": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F4053797d-9167-41d8-8f7f-db865db5997b%2F31227464-ddca-4218-a74b-e287382bb79a.avif",
    "categoryId": "yVIPNyszPTt8qCnvZNsF",
    "file": "catalog-4053797d-9167-41d8-8f7f-db865db5997b"
  },
  "65de460c-6278-421f-8d48-2fcb108f0fe5": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F65de460c-6278-421f-8d48-2fcb108f0fe5%2F13ce5b77-b855-4fd3-a747-a0c51987f9e2.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-65de460c-6278-421f-8d48-2fcb108f0fe5"
  },
  "da0e00aa-88d5-4320-8ca5-86235905916f": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fda0e00aa-88d5-4320-8ca5-86235905916f%2F03732999-004d-49a0-b727-29819dac4b51.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-da0e00aa-88d5-4320-8ca5-86235905916f"
  },
  "355a5db7-edb8-4165-a0a6-932b1cc2f43a": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F355a5db7-edb8-4165-a0a6-932b1cc2f43a%2F0b52f3b6-1341-4aae-8409-dbc7813060e0.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-355a5db7-edb8-4165-a0a6-932b1cc2f43a"
  },
  "6ed394d2-228d-4a3d-9716-c260e46f1f28": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F6ed394d2-228d-4a3d-9716-c260e46f1f28%2F537fa51d-cd00-46f0-b8c8-032c94642cbc.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-6ed394d2-228d-4a3d-9716-c260e46f1f28"
  },
  "5b844338-c03e-42a7-8a84-7662d007d0ce": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F5b844338-c03e-42a7-8a84-7662d007d0ce%2F07e880f5-994f-49d9-b4fb-69c8df426e44.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-5b844338-c03e-42a7-8a84-7662d007d0ce"
  },
  "43c64a04-f23e-4677-9800-5427f1029afc": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F43c64a04-f23e-4677-9800-5427f1029afc%2F16555f1f-b385-4c0d-8458-f19e57306e4b.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-43c64a04-f23e-4677-9800-5427f1029afc"
  },
  "d0fba39a-9064-49f0-8f73-22423c041d78": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Fd0fba39a-9064-49f0-8f73-22423c041d78%2Fad36c16c-81ac-49ad-8019-19b06a61d7ab.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-d0fba39a-9064-49f0-8f73-22423c041d78"
  },
  "f647a3c5-1826-4a1a-8ea8-25b5b768404a": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Ff647a3c5-1826-4a1a-8ea8-25b5b768404a%2Fc309aa10-a04e-46d2-bbb3-68746626146c.avif",
    "categoryId": "JWphgCCdogmHoNu9efSU",
    "file": "catalog-f647a3c5-1826-4a1a-8ea8-25b5b768404a"
  },
  "7695f60b-5712-4f85-8592-4138cdc8a59c": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F7695f60b-5712-4f85-8592-4138cdc8a59c%2Fdcb1dcba-e0d6-4495-93fd-fc25a8fe9318.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-7695f60b-5712-4f85-8592-4138cdc8a59c"
  },
  "f10a57a7-ecfa-4f70-86b0-b0b435120440": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2Ff10a57a7-ecfa-4f70-86b0-b0b435120440%2F1eb46d62-6335-442e-b2d0-1bcb25a774f1.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-f10a57a7-ecfa-4f70-86b0-b0b435120440"
  },
  "53102f7c-a218-4028-804b-61a10aa3e646": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F53102f7c-a218-4028-804b-61a10aa3e646%2Fddb08fd5-585a-4b5a-9dd2-9f6e420c551b.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-53102f7c-a218-4028-804b-61a10aa3e646"
  },
  "40adc2d6-2b59-4cc1-94b1-901e9758f5b0": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F40adc2d6-2b59-4cc1-94b1-901e9758f5b0%2F8c337179-2f20-4881-9311-d9c450525f37.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-40adc2d6-2b59-4cc1-94b1-901e9758f5b0"
  },
  "8d43f3df-69f5-4a7f-80ca-6303d7210e0d": {
    "source": "https://firebasestorage.googleapis.com/v0/b/studio-2819118380-ae26c.firebasestorage.app/o/brands%2FoeypKaMyYcQjIwaa1PtV%2Fproducts%2F8d43f3df-69f5-4a7f-80ca-6303d7210e0d%2Fda6961f0-6429-4ecc-a263-8cf3a3690ad3.avif",
    "categoryId": "hmzUpI5ZWzq2eeLYSL2p",
    "file": "catalog-8d43f3df-69f5-4a7f-80ca-6303d7210e0d"
  }
};

export function esmeraldaProductImage(isV2: boolean, product: PizzaImageProduct) {
  const pizza = esmeraldaPizzaImage(isV2, product);
  if (pizza) return {...pizza, kind: 'pizza' as const};
  if (!isV2 || product.brandId !== 'oeypKaMyYcQjIwaa1PtV') return undefined;
  const asset = catalogAssets[product.id];
  if (!asset || product.categoryId !== asset.categoryId || !product.imageUrl) return undefined;
  if (product.imageUrl.split('?')[0] !== asset.source) return undefined;
  return {src: `/images/esmeralda-v2/menu/${asset.file}.webp`, kind: 'catalog' as const};
}

export const ESMERALDA_MENU_IMAGE_PATHS = [
  ...Object.values(assets).map(asset => `/images/esmeralda-v2/menu/${asset.file}.webp`),
  ...Object.values(catalogAssets).map(asset => `/images/esmeralda-v2/menu/${asset.file}.webp`),
  ...Object.keys(pizzaAssets).map(id => `/images/esmeralda-v2/menu/pizza-${id}.webp`),
];

export function esmeraldaMenuImage(isV2: boolean, brandId: string, comboId: string, productId: string) {
  if (!isV2 || brandId !== 'oeypKaMyYcQjIwaa1PtV' || comboId !== 'esmeralda-v2-pizzamenu-20261030') return undefined;
  const asset = assets[productId];
  return asset ? {src: `/images/esmeralda-v2/menu/${asset.file}.webp`, illustration: !!asset.illustration} : undefined;
}
