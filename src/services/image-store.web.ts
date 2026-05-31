import * as ImageManipulator from 'expo-image-manipulator';

import { RuntimeLimits } from '@/constants/runtime';

type PersistedImage = {
    imageUri: string;
    thumbnailUri: string;
    imageBase64: string;
    mimeType: string;
    width: number;
    height: number;
};

export function createImageStore() {
    return {
        async persistImages(input: { inputUris: string[]; attemptId: string }): Promise<PersistedImage[]> {
            return persistImages(input);
        },

        async deleteAttemptImages(_attemptId: string): Promise<void> {
            return;
        },

        async deleteAllImages(): Promise<void> {
            return;
        },
    };
}

async function persistImages({
    inputUris,
}: {
    inputUris: string[];
    attemptId: string;
}): Promise<PersistedImage[]> {
    if (inputUris.length === 0) {
        throw new Error('At least one image is required.');
    }

    return Promise.all(inputUris.map((inputUri) => persistSingleImage(inputUri)));
}

async function persistSingleImage(inputUri: string): Promise<PersistedImage> {
    const normalized = await renderImage(inputUri, RuntimeLimits.normalizedImageWidth, 0.78, true);
    const thumbnail = await renderImage(normalized.uri, RuntimeLimits.thumbnailImageWidth, 0.68, true);

    const imageUri = toDataUri(normalized.base64, normalized.uri);
    const thumbnailUri = toDataUri(thumbnail.base64, imageUri);

    return {
        imageUri,
        thumbnailUri,
        imageBase64: normalized.base64,
        mimeType: 'image/webp',
        width: normalized.width,
        height: normalized.height,
    };
}

function toDataUri(base64: string, fallbackUri: string): string {
    if (!base64) {
        return fallbackUri;
    }

    if (base64.startsWith('data:')) {
        return base64;
    }

    return `data:image/webp;base64,${base64}`;
}

async function renderImage(
    inputUri: string,
    maxWidth: number,
    compress: number,
    base64: boolean,
): Promise<{
    uri: string;
    base64: string;
    width: number;
    height: number;
}> {
    const saved = await ImageManipulator.manipulateAsync(
        inputUri,
        [{ resize: { width: maxWidth } }],
        {
            base64,
            compress,
            format: ImageManipulator.SaveFormat.WEBP,
        },
    );

    return {
        uri: saved.uri,
        base64: saved.base64 ?? '',
        width: saved.width,
        height: saved.height,
    };
}