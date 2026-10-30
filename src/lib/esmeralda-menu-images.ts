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

export function esmeraldaMenuImage(isV2: boolean, brandId: string, comboId: string, productId: string) {
  if (!isV2 || brandId !== 'oeypKaMyYcQjIwaa1PtV' || comboId !== 'esmeralda-v2-pizzamenu-20261030') return undefined;
  const asset = assets[productId];
  return asset ? {src: `/images/esmeralda-v2/menu/${asset.file}.webp`, illustration: !!asset.illustration} : undefined;
}
