export const CAR_MODELS_BY_BRAND: Record<string, string[]> = {
  Changan: ['A06 240', 'Q05 506'],
  Chevrolet: ['Captiva', 'Silverado'],
  Fiat: ['Ducato L2H2', 'Ulysse'],
  Geely: ['Coolray'],
  Hyundai: ['Elantra Elite Edition', 'Elantra Premium Edition', 'Tucson'],
  Jeep: ['Renegade Altitude Новый', 'Wrangler Gladiator Rubicon', 'Wrangler Rubicon'],
  KIA: ['KX1'],
  Mazda: ['BT-50 Double Cabine', 'CX-5 Comfort', 'CX-5 Elegance PRO', 'CX-5 Максималка (ТОП)', 'CX-5 Smart'],
  'Mercedes Benz': ['GLB 200 AmG LINE'],
  Mitsubishi: ['ASX', 'ASX ТОП', 'Eclipse Cross', 'L200 SINGLE CAB', 'Outlander III Enjoy'],
  Nissan: ['Qashqai', 'X-Trail Leading Edition'],
  Opel: ['Crossland X', 'Mokka'],
  Peugeot: ['3008', '5008 Allure', '5008 GT'],
  RAM: ['1500 Bighorn'],
  Suzuki: ['Jimny GL', 'Jimny GLX'],
  Toyota: ['Fortuner', 'Raize'],
};

export const CAR_MODELS = [...new Set(Object.values(CAR_MODELS_BY_BRAND).flat())]
  .sort((left, right) => left.localeCompare(right, 'ru'));

export const CAR_BRANDS = Object.keys(CAR_MODELS_BY_BRAND)
  .sort((left, right) => left.localeCompare(right, 'ru'));

export function modelSuggestions(brand?: string | null): string[] {
  return brand && CAR_MODELS_BY_BRAND[brand] ? CAR_MODELS_BY_BRAND[brand] : CAR_MODELS;
}
