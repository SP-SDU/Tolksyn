import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '@/db/schema';
import { createAttemptRepository } from '@/repositories/attempt-repository';
import { emptyStructuredItem } from '@/types/item-schema';

describe('attempt repository', () => {
  test('keeps only the latest 20 attempts in history order', async () => {
    const db = createTestDb();
    const repository = createAttemptRepository(db as any);

    for (let index = 1; index <= 22; index += 1) {
      await repository.create({
        id: `attempt-${index}`,
        source: 'camera',
        imageUri: `file://image-${index}.jpg`,
        thumbnailUri: `file://thumb-${index}.jpg`,
        createdAt: index,
      });
    }

    const recent = await repository.listRecent(20);

    expect(recent).toHaveLength(20);
    expect(recent[0].id).toBe('attempt-22');
    expect(recent[19].id).toBe('attempt-3');
  });

  test('persists extraction results and accepted revisions', async () => {
    const db = createTestDb();
    const repository = createAttemptRepository(db as any);

    await repository.create({
      id: 'attempt-1',
      source: 'gallery',
      imageUri: 'file://image.jpg',
      thumbnailUri: 'file://thumb.jpg',
      createdAt: 100,
    });
    await repository.saveExtractionResult('attempt-1', {
      structuredJson: {
        ...emptyStructuredItem(),
        manufacturer: 'Siemens',
      },
      barcodes: [],
      barcodeEnrichment: {
        detected: [{ type: 'ean13', data: '4046356160483' }],
        primary: { type: 'ean13', data: '4046356160483' },
        relatedFieldSuggestions: { eanOrUpc: '4046356160483' },
        conflicts: [],
      },
      metadata: {
        provider: 'remote_openai_compatible',
        durationMs: 1400,
        imageWidth: 1200,
        imageHeight: 900,
      },
      auxiliaryText: 'Detected text',
    });
    await repository.markQueued('attempt-1', 1);

    const attempt = await repository.getById('attempt-1');

    expect(attempt).toEqual(
      expect.objectContaining({
        id: 'attempt-1',
        status: 'queued',
        acceptedRevision: 1,
        extractionResult: expect.objectContaining({
          structuredJson: expect.objectContaining({ manufacturer: 'Siemens' }),
        }),
      }),
    );
  });
});

function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE attempts (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      thumbnail_uri TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      accepted_revision INTEGER NOT NULL DEFAULT 0,
      draft_structured_json TEXT,
      extraction_result TEXT,
      error_code TEXT
    );
  `);

  return db;
}
