import { serializeCsv } from '@/utils/serialize-csv';
import { emptyStructuredItem } from '@/types/item-schema';

describe('serializeCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const result = serializeCsv(emptyStructuredItem());
    expect(result.charCodeAt(0)).toBe(0xFEFF);
  });

  it('includes a header row with all field keys', () => {
    const result = serializeCsv(emptyStructuredItem());
    const lines = result.split('\n');
    const header = lines[0];

    expect(header).toContain('sku');
    expect(header).toContain('manufacturer');
    expect(header).toContain('productNumber');
    expect(header).toContain('quantity');
    expect(header).toContain('priceEur');
    expect(header).toContain('link');
  });

  it('outputs one data row', () => {
    const result = serializeCsv(emptyStructuredItem());
    const lines = result.split('\n');

    expect(lines).toHaveLength(2);
  });

  it('escapes fields containing commas', () => {
    const item = { ...emptyStructuredItem(), manufacturer: 'Siemens, AG' };
    const result = serializeCsv(item);

    expect(result).toContain('"Siemens, AG"');
  });

  it('escapes fields containing double quotes', () => {
    const item = { ...emptyStructuredItem(), productText: 'Length 12" unit' };
    const result = serializeCsv(item);
    const row = result.split('\n')[1];
    const cells = row.split(',');

    const productTextIndex = Object.keys(emptyStructuredItem()).indexOf('productText');
    const cell = cells[productTextIndex];

    expect(cell).toBe('"Length 12"" unit"');
  });

  it('escapes fields containing newlines', () => {
    const item = { ...emptyStructuredItem(), externalNote: 'Line 1\nLine 2' };
    const result = serializeCsv(item);

    expect(result).toContain('"Line 1');
    expect(result).toContain('Line 2"');
  });

  it('outputs null fields as empty cells', () => {
    const result = serializeCsv(emptyStructuredItem());
    const row = result.split('\n')[1];

    expect(row).not.toContain('null');
  });

  it('outputs numeric values as-is without quotes', () => {
    const item = { ...emptyStructuredItem(), quantity: 5, priceEur: 12.5 };
    const result = serializeCsv(item);
    const row = result.split('\n')[1];
    const keys = Object.keys(emptyStructuredItem());
    const quantityIndex = keys.indexOf('quantity');
    const priceIndex = keys.indexOf('priceEur');
    const cells = row.split(',');

    expect(cells[quantityIndex]).toBe('5');
    expect(cells[priceIndex]).toBe('12.5');
  });

  it('outputs text values without quotes when safe', () => {
    const item = { ...emptyStructuredItem(), manufacturer: 'Siemens' };
    const result = serializeCsv(item);
    const keys = Object.keys(emptyStructuredItem());
    const manufacturerIndex = keys.indexOf('manufacturer');
    const cells = result.split('\n')[1].split(',');

    expect(cells[manufacturerIndex]).toBe('Siemens');
  });
});
