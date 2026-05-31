import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createAttemptRepository } from '@/repositories/attempt-repository';
import { emptyStructuredItem } from '@/types/item-schema';

describe('attempt repository', () => {
  test('keeps only the latest 20 attempts in history order', async () => {
    const { db } = createTestDb();
    const repository = createAttemptRepository(db as any);

    for (let index = 1; index <= 22; index += 1) {
      await repository.create({
        id: `attempt-${index}`,
        source: 'camera',
        images: [{ imageUri: `file://image-${index}.jpg`, thumbnailUri: `file://thumb-${index}.jpg` }],
        createdAt: index,
      });
    }

    const recent = await repository.listRecent(20);

    expect(recent).toHaveLength(20);
    expect(recent[0].id).toBe('attempt-22');
    expect(recent[19].id).toBe('attempt-3');
  });

  test('persists extraction results and accepted revisions', async () => {
    const { db } = createTestDb();
    const repository = createAttemptRepository(db as any);

    await repository.create({
      id: 'attempt-1',
      source: 'gallery',
      images: [{ imageUri: 'file://image.jpg', thumbnailUri: 'file://thumb.jpg' }],
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
      extractionDiagnostics: {
        failed: false,
        attempts: [
          {
            attempt: 1,
            prompt: 'Extract product label data',
          },
        ],
      },
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
        extractionDiagnostics: expect.objectContaining({
          failed: false,
          attempts: [expect.objectContaining({ attempt: 1 })],
        }),
      }),
    );
  });

  test('lists recent attempts without parsing malformed JSON columns', async () => {
    const { db } = createTestDb();
    const repository = createAttemptRepository(db as any);

    await repository.create({
      id: 'attempt-bad-json',
      source: 'camera',
      images: [{ imageUri: 'file://image.jpg', thumbnailUri: 'file://thumb.jpg' }],
      createdAt: 200,
    });

    await db
      .update(schema.attemptsTable)
      .set({
        draftStructuredJson: '"unterminated',
        extractionResult: '{"structuredJson":',
      })
      .where(eq(schema.attemptsTable.id, 'attempt-bad-json'));

    const recent = await repository.listRecent(1);

    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('attempt-bad-json');
  });

  test('returns empty list when history query fails due to malformed sqlite row', async () => {
    const db = {
      select() {
        throw new SyntaxError('Unterminated string in JSON at position 36');
      },
      delete: jest.fn(() => Promise.resolve()),
    };

    const repository = createAttemptRepository(db as any);

    const recent = await repository.listRecent(20);

    expect(recent).toEqual([]);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('returns base attempt fallback when getById select fails', async () => {
    const db = {
      select() {
        throw new SyntaxError('Unterminated string in JSON at position 36');
      },
      query: {
        attemptsTable: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'attempt-fallback',
            source: 'gallery',
            imageUri: '["file://image.jpg"]',
            thumbnailUri: '["file://thumb.jpg"]',
            createdAt: 123,
            updatedAt: 124,
            status: 'ready_for_review',
            acceptedRevision: 0,
            draftStructuredJson: null,
            extractionResult: null,
            errorCode: null,
          }),
        },
      },
    };

    const repository = createAttemptRepository(db as any);
    const attempt = await repository.getById('attempt-fallback');

    expect(db.query.attemptsTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: expect.objectContaining({
          id: true,
          source: true,
          imageUri: true,
          thumbnailUri: true,
        }),
      }),
    );

    expect(attempt).toEqual(
      expect.objectContaining({
        id: 'attempt-fallback',
        source: 'gallery',
        images: [{ imageUri: 'file://image.jpg', thumbnailUri: 'file://thumb.jpg' }],
        status: 'ready_for_review',
      }),
    );
  });

  test('deserializes old plain-string image URIs without JSON array wrapping', async () => {
    const { db, sqlite } = createTestDb();
    const repository = createAttemptRepository(db as any);

    sqlite.exec(`
      insert into attempts (id, source, image_uri, thumbnail_uri, created_at, updated_at, status, accepted_revision)
      values ('old-style', 'camera', 'file://old-image.jpg', 'file://old-thumb.jpg', 300, 300, 'ready_for_review', 0)
    `);

    const result = await repository.getById('old-style');

    expect(result?.images).toEqual([
      { imageUri: 'file://old-image.jpg', thumbnailUri: 'file://old-thumb.jpg' },
    ]);
  });

  test('logs pruning failures as warning messages without error stack objects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = {
      insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
      select() {
        throw new SyntaxError('Unterminated string in JSON at position 36');
      },
    };
    const repository = createAttemptRepository(db as any, {} as any);

    await repository.create({
      id: 'attempt-prune-warning',
      source: 'gallery',
      images: [{ imageUri: 'file://image.jpg', thumbnailUri: 'file://thumb.jpg' }],
      createdAt: 123,
    });

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[tolksyn] Attempt pruning skipped:', 'Unterminated string in JSON at position 36');

    warn.mockRestore();
    error.mockRestore();
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

  return { db, sqlite };
}
