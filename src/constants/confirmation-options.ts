import type { StructuredItem } from '@/types/item-schema';

export type ConfirmationOption = {
  id: string;
  label: string;
};

export const CONFIRM_ENUM_OPTIONS: Partial<Record<keyof StructuredItem, ConfirmationOption[]>> = {
  condition: [
    { id: 'New', label: 'New' },
    { id: 'Used', label: 'Used' },
    { id: 'Refurbished', label: 'Refurbished' },
    { id: 'For parts', label: 'For parts' },
    { id: 'Not working', label: 'Not working' },
  ],
  externalCondition: [
    { id: 'New', label: 'New' },
    { id: 'Good', label: 'Good' },
    { id: 'Acceptable', label: 'Acceptable' },
    { id: 'Poor', label: 'Poor' },
  ],
  workingCondition: [
    { id: 'Working', label: 'Working' },
    { id: 'Not working', label: 'Not working' },
    { id: 'Untested', label: 'Untested' },
  ],
  packaging: [
    { id: 'Original', label: 'Original' },
    { id: 'Generic', label: 'Generic' },
    { id: 'No packaging', label: 'No packaging' },
  ],
};

export const CONFIRM_AUTOCOMPLETE_FIELDS = [
  'manufacturer',
  'productNumber',
  'itemCategory',
  'storagePosition',
  'itemGroup',
] as const satisfies readonly (keyof StructuredItem)[];
