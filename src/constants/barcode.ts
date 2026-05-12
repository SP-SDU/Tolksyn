import type { BarcodeType } from 'expo-camera';

export const SUPPORTED_BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'codabar',
  'datamatrix',
  'aztec',
  'itf14',
  'qr',
  'pdf417',
];

export const EXPO_TO_WEB_BARCODE_TYPE: Record<string, string> = {
  aztec: 'aztec',
  codabar: 'codabar',
  code39: 'code_39',
  code93: 'code_93',
  code128: 'code_128',
  datamatrix: 'data_matrix',
  ean8: 'ean_8',
  ean13: 'ean_13',
  itf14: 'itf',
  pdf417: 'pdf417',
  qr: 'qr_code',
  upc_a: 'upc_a',
  upc_e: 'upc_e',
};

export const WEB_TO_EXPO_BARCODE_TYPE = new Map(
  Object.entries(EXPO_TO_WEB_BARCODE_TYPE).map(([expoType, webType]) => [webType, expoType]),
);
