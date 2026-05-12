# Tolksyn

Expo app for turning product-label photos into reviewed structured item payloads.

## What It Does

- Captures a label image from camera or gallery.
- Reads visible barcodes when available.
- Sends the image to a configured vision model for extraction.
- Adds optional web-search enrichment.
- Lets the user edit fields before submitting to an ingest endpoint.
- Stores recent attempts and queues accepted payloads when offline.

## Setup

- Install Node.js and npm.
- Run `npm install`.
- Run `npm run start`.
- Choose Android, iOS, web, or Expo Go from the Expo terminal.

## App Settings

- Provider: OpenAI, Google, or GitHub Copilot where supported.
- Auth: OAuth or API key depending on provider.
- Ingest: endpoint URL plus `x-api-key`.

## Checks

- `npm run test`
- `npm run lint`
- `npm run typecheck`
