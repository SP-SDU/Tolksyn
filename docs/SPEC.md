# TOLKSYN CANONICAL SYSTEM SPEC

## Identity

Name: TOLKSYN
Purpose: Image capture → vision-language extraction + barcode capture → human validation → JSON ingest
Input: Image
Output: Structured JSON
Primary loop: Capture → Extract → Confirm → Send → Capture

---

## Platforms

iOS
Android
Web

---

## Product Purpose

Mobile-first Expo app that captures images, extracts structured data via vision-language models, allows human correction, and submits validated JSON to a configurable ingest endpoint.

---

## Core Capabilities

Camera capture and gallery import
Vision-language extraction to structured JSON
Barcode detection and decoding
Merge barcode data into extracted object
Local and remote provider routing
Human validation and editing
Retry and fallback logic
History of last 20 attempts
Configurable ingest endpoint
BYOK provider support
Offline send queue
Secure credential storage
No telemetry by default

---

## Capture Signals

A single capture operation may yield:
Image frame
Zero or more decoded barcodes

Barcode capture runs independently of vision-language extraction and is executed when enabled.

---

## Primary Tech Stack

### App Runtime and UI

Expo (TypeScript) with Expo Router
File-based routing under src/app
Camera and gallery access via Expo modules or Expo-compatible native packages
Local filesystem storage for images and attempt history
Secure storage via platform keychain/keystore through Expo secure storage
MVVM and layering are implicit in module boundaries, not enforced through top-level architecture folders

### Local Model Runtime

llama.rn for on-device inference
Local vision-language extraction model:
NuExtract or equivalent schema-oriented VL model compatible with llama.rn

### Remote Model Runtime

Remote vision-language endpoints (image → JSON), including Gemini VL and OpenAI-compatible APIs

---

## Expo Architecture and Folder Structure

This spec follows Expo Router organization best practices.

Canonical structure:

```
src/
  app/                 # Expo Router routes only
    _layout.tsx
    (tabs)/
    api/               # +api route files
  screens/             # screen implementations used by routes
  components/          # reusable UI components
  hooks/               # reusable React hooks
  utils/               # pure utilities and formatters
  server/              # code shared by api routes
tests/                 # project-level integration/e2e tests
```

### Organization Rules

Routes in src/app stay thin and primarily map URL segments to screen components
Complex page UI and feature-specific composition live in src/screens
Reusable UI stays in src/components; avoid route-specific leakage
API routes live in src/app/api and shared server logic lives in src/server
Prefer kebab-case filenames and use platform extensions (.web, .native, .ios, .android) where needed
Colocate styles with their component and avoid separate global style folders by default
Do not introduce a classic top-level layered tree such as presentation/domain/infrastructure in this app.
Do not scaffold top-level architecture folders such as presentation/, domain/, or infrastructure/
Do not place non-route helpers inside src/app; every file in src/app is treated as a route by Expo Router
Prefer route wrapper pattern: keep src/app route files small and render screen modules from src/screens
Place reusable logic in src/components, src/hooks, src/utils, and src/server based on responsibility
Keep tests in tests/ and colocated *.test.ts(x),*.test.ts or *.test.tsx files; avoid __tests__

### Architectural Intent

MVVM and layered separation are implementation constraints, not top-level folder names
ViewModels/state containers are the source of truth for screen state
Views are reactive and avoid business logic where practical
Business rules remain deterministic and testable

### State Management

Single state machine source of truth matching the PlantUML lifecycle
Event driven transitions with explicit events
No implicit state in UI components
Attempt objects treated as immutable snapshots
Persistence only through typed storage/repository boundaries

### Navigation

Capture
Confirm and Edit
History
Settings

### Native Boundary Contracts

Native integrations must expose typed interfaces with normalized error surfaces:
Camera
Gallery
Barcode detection
Secure storage
Filesystem
llama.rn local inference

### Concurrency Model

Barcode detection and VL extraction execute in parallel per capture id
Single in flight extraction per capture id
Cancellation supported on retry, deny, or navigation away
Backpressure applied to offline queue and retry worker
No retry storms

### Data Flow

Deterministic pipeline ordering:
Preprocess → Parallel (Barcode, VL) → Merge → Validate → Confirm → Send
All merges and validations are deterministic and pure in business logic

---

## Extraction Model

Vision-language first
No OCR tools

The image is interpreted directly by a vision-language model for semantic extraction.
Barcode detection runs in parallel on the same image or preview frame.
Results merged before validation and user confirmation.

---

## Barcode Stack

### Barcode Detection

Local only
Provider independent

Native barcode detection via Expo-compatible modules or custom native modules

Supported symbologies:
EAN 13
EAN 8
UPC A
UPC E
Code 128
Code 39
QR

Operates on:
Captured still image
Or live preview frame

No OCR dependency

---

## Provider Execution Modes

### Local VL

Image → llama.rn (NuExtract or equivalent) → JSON

### Remote VL

Image → Remote VL endpoint (OpenAI-compatible) → JSON

Barcode detection always runs locally and does not affect provider routing.

---

## Provider Router

Provider routing selects the VL execution mode based on settings and capability:
local_vl
remote_vl

Barcode detection is not routed.

---

## Unified Internal Contract

```
Extract(image) -> {
  structured_json,
  barcodes: [
    {
      value: string,
      symbology: string,
      bounding_box: optional
    }
  ],
  auxiliary_text_optional,
  metadata
}
```

---

## High Level Pipeline

```
Image
 → Preprocess
 → Parallel
    → Barcode Detector
    → Provider Router
        → Local VL
        OR
        → Remote VL
 → Merge Results
 → Validation
 → Human Confirm
 → Remote Ingest
```

---

## UI Wireframes (PlantUML Salt)

### Capture

See `docs/Wireframes/ui-capture.puml`.

### Confirm and Edit

See `docs/Wireframes/ui-confirm-edit.puml`.

### History

See `docs/Wireframes/ui-history.puml`.

### Settings

See `docs/Wireframes/ui-settings.puml`.

---

## App State Machine

See `docs/Diagrams/app-state-machine.puml`.

---

## Extraction Pipeline (Sequence)

See `docs/Diagrams/extraction-pipeline-sequence.puml`.

---

## Provider Router Logic

See `docs/Diagrams/provider-router-logic.puml`.

Barcode detection is not routed and does not influence provider selection.

---

## Ingest Pipeline

See `docs/Diagrams/ingest-pipeline.puml`.

---

## Schema, Merge, and Validation

### Schema Versioning

structured_json includes schema_version
Validator supports current and previous versions for migration
Schema evolution tolerant

### Deterministic Merge Policy

Merged output includes barcode records under a dedicated field:
structured_json.barcodes or structured_json.enrichment.barcodes
Merge order:

1. VL structured_json base object
2. Barcode records appended as enrichment
   Precedence:
   If VL output contains barcode like fields, barcode detector results override only within the dedicated barcode field. No other fields overridden.

### Normalization Rules

Dates normalized to ISO 8601
Numbers normalized to canonical decimal representation
Currencies normalized with explicit currency codes when present
Locale handling explicit and deterministic

---

## Provider and Adapter Contracts

### Provider Configuration

```
Provider {
  id: string
  label: string
  kind: local | remote
  base_url_default: string
  capabilities: { vision_language: bool }
  fields: [
    { name, type, required, default }
  ]
}
```

Local provider:

```
base_url = local://
```

### Error Taxonomy

All adapters must map errors into normalized codes:
permission_denied
timeout
network_unavailable
auth_failed
rate_limited
invalid_response
schema_violation
unsupported
internal

---

## Ingest Contract and Reliability

### Ingest API Requirements

POST JSON to ingest endpoint
Auth modes:
none
bearer_token
api_key_header
custom_header_secret

### Idempotency

Each send uses a stable idempotency key derived from attempt id
Retries must not create duplicate server side effects

### Offline Queue Semantics

FIFO ordering per device
Configurable max size with explicit eviction policy
Retry schedule includes jitter and cap
Queue worker drains when network is available
Queue persistence is crash safe

---

## Storage Model

Provider configuration stored as JSON
Secrets stored in OS secure storage
Attempt history stored locally
Images stored on device
Image retention policy defined and user controllable:
store full images
store thumbnails only
store none

---

## Security and Privacy Model

Secrets never stored in plaintext
HTTPS required for all remote calls
No telemetry by default
Optional encrypted offline queue
User controlled provider endpoints

Threat model concerns included:
User defined endpoints can exfiltrate data
Misconfiguration and credential leakage risk
Denial of service via retry storms avoided via backoff and caps
Diagnostics bundle redacts secrets

---

## Observability and Diagnostics

Local diagnostics bundle export includes:
Last N attempt metadata
Redacted logs
Config snapshot without secrets
Performance timings for extract and send

Structured user facing error messages use normalized error codes.

---

## Performance Targets

Local extraction under 2 seconds device dependent
Remote extraction under 6 seconds network dependent
UI response under 100 ms
Cold start under 3 seconds

---

## Quality and Testing Requirements

### Development Method

Test driven development required for production code paths
Work proceeds by writing a failing test for externally visible behavior, then implementing to pass

### Test Strategy

Preference for higher level tests:
Integration tests for pipeline components and adapters
End to end tests for the primary loop: Capture → Extract → Confirm → Send → Capture
Contract tests for provider adapters and ingest client behavior
Minimal unit tests only where higher level tests are impractical

### Coverage Target

Approximately 80% line coverage target
Coverage is an indicator, not a gate
Priority is risk based coverage of critical paths and failure modes

### Adversarial Testing

Tests must attempt to break the system by exercising:
Network failures, timeouts, partial responses
Malformed JSON, schema drift, missing fields
Large images, corrupt images, unsupported formats
Conflicting barcode sets, duplicates, empty scans
Offline queue overflow and replay ordering
Secure storage missing, denied permissions
Provider misconfiguration and credential rotation
Race conditions between barcode and VL completion
Retry storms and backoff behavior
History truncation and persistence consistency

### E2E Harness Requirements

Mock providers and mock ingest server
Network shaping: offline, slow, flaky
Permission toggles in test runs
Golden fixtures for deterministic expectations

### Property Based Testing

Merger and validator tested with generated combinations of:
Partial structured_json
Barcode lists
Missing fields
Extra fields
Invalid types

---

## Code Standards

### Readability and Structure

Code must be readable without relying on comments
Control flow should be sequential and easy to follow
Complexity minimized by separating concerns behind small interfaces
Avoid implicit coupling and scattered configuration

### Commenting Policy

Comments explain why, not how
Comments capture intent, tradeoffs, invariants, and constraints
No comments that restate code

---

## LLM Extraction Guidance

### Prompt Contract Requirements

Model must return JSON only
Model output must conform to the provided JSON schema
Model must not hallucinate missing fields
Unknown fields omitted or set to null per schema rules
Confidence per field included if supported by the provider

### Input Packaging

Image plus:
Schema definition
Extraction instructions
Normalization rules
Merge note that barcode detection results are authoritative for barcode field

### Output Normalization

Normalize dates, numbers, currency, and identifiers deterministically before validation

---

## Dependency Management

Expo and JavaScript package management via standard JS tooling
Local model assets versioned and securely bundled or downloaded
Minimal native dependencies beyond camera, storage, barcode, and llama.rn bindings

---

## Extensibility

New VL providers added via JSON configuration
Additional barcode symbologies supported without pipeline changes
Schema evolution tolerant via versioned validation
Future remote barcode enrichment possible without architecture changes

---

## Documentation Stack

PlantUML Salt for UI wireframes
PlantUML Sequence for pipelines
PlantUML State for lifecycle
Optional C4 diagrams for system context and containers
Glossary section required in documentation:
attempt, provider, mode, schema_version, offline queue, idempotency key

### Glossary

attempt: A single capture-to-send execution record with status, metadata, and outputs
provider: A configured VL backend used for extraction (local or remote)
mode: Provider execution mode selected by routing logic (local_vl or remote_vl)
schema_version: The version identifier for the structured_json contract
offline queue: Persistent FIFO queue of accepted payloads waiting for network delivery
idempotency key: Stable key derived from attempt id to prevent duplicate ingest side effects

### Functional Requirements

| ID     | User story                                                                                                                  | MoSCoW | Acceptance criteria                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | As a staff member, I want to capture a photo of a product label so that it can be processed automatically.                  | Must   | Given the app is open and camera permission is granted<br>When the user captures an image<br>Then the image is stored locally and extraction starts.   |
| FR-002 | As a staff member, I want to select an existing image from the gallery so that previously taken photos can be processed.    | Must   | Given the user is on the Capture screen<br>When a gallery image is selected<br>Then the image is stored and extraction starts.                         |
| FR-003 | As the system, I want to preprocess images so that extraction accuracy is improved.                                         | Should | Given an image is selected<br>When preprocessing runs<br>Then a normalized image is sent to the vision model.                                          |
| FR-004 | As a staff member, I want structured data extracted from the label so that registration fields are auto-filled.             | Must   | Given an image and configured provider<br>When extraction is triggered<br>Then valid JSON is returned by the vision model.                             |
| FR-005 | As the system, I want to reject invalid responses so that only usable data proceeds.                                        | Must   | Given the provider returns non-JSON or invalid JSON<br>When validation runs<br>Then extraction fails and an error state is shown.                      |
| FR-006 | As an admin, I want provider fallback so that outages do not block extraction.                                              | Should | Given the primary provider fails<br>When fallback is configured<br>Then extraction retries using the fallback provider.                                |
| FR-007 | As a staff member, I want extracted fields mapped to Buy2Sell registration fields so that data matches the internal system. | Must   | Given extracted JSON contains relevant fields<br>When mapping runs<br>Then manufacturer, model, serial number, and origin are shown in mapped fields.  |
| FR-008 | As a staff member, I want to review and edit extracted data so that errors are corrected before submission.                 | Must   | Given the Confirm screen is displayed<br>When the user edits values and accepts<br>Then the edited JSON is used for ingest.                            |
| FR-009 | As a staff member, I want to retry extraction so that poor results can be improved.                                         | Should | Given the Confirm screen is shown<br>When the user selects Try Again<br>Then extraction reruns with the same image and retry count increases.          |
| FR-010 | As a staff member, I want confirmed data sent to the registration system so that items are registered automatically.        | Must   | Given the device is online and data is accepted<br>When JSON is posted to the ingest endpoint<br>Then a successful response marks the attempt as sent. |
| FR-011 | As a staff member, I want offline submissions queued so that work can continue without connectivity.                        | Must   | Given the device is offline<br>When the user accepts extracted data<br>Then the payload is queued and marked pending.                                  |
| FR-012 | As a staff member, I want to see recent attempts so that I can review or resend them.                                       | Must   | Given the History screen is opened<br>When attempts exist<br>Then the last 20 attempts are displayed with status.                                      |
| FR-013 | As an admin, I want to configure providers and endpoints so that the app fits our environment.                              | Must   | Given Settings is opened<br>When provider or ingest values are saved<br>Then they persist and are used for future runs.                                |
| FR-014 | As an admin, I want API keys stored securely so that credentials are protected.                                             | Must   | Given an API key is saved<br>When storage occurs<br>Then it is stored only in OS secure storage.                                                       |

---

### Non-Functional Requirements

| ID      | Requirement            | MoSCoW | Acceptance criteria                                                                                                                    |
| ------- | ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Extraction performance | Must   | Given stable network conditions<br>When extraction starts<br>Then results reach the Confirm screen within 6 seconds for most attempts. |
| NFR-002 | UI responsiveness      | Must   | Given normal device load<br>When the user interacts with the UI<br>Then visible feedback occurs within 100 ms.                         |
| NFR-003 | Cold start time        | Should | Given the app is not running<br>When launched<br>Then the Capture screen is usable within 3 seconds.                                   |
| NFR-004 | Offline reliability    | Must   | Given a submission is queued offline<br>When the app is restarted<br>Then the queued data remains intact and pending.                  |
| NFR-005 | Transport security     | Must   | Given any remote request is made<br>When the connection is established<br>Then HTTPS is enforced and insecure endpoints are rejected.  |
| NFR-006 | Data minimization      | Should | Given an attempt is stored<br>When local storage is inspected<br>Then only image, JSON, and required metadata are present.             |
| NFR-007 | Auditability           | Should | Given an extraction completes<br>When the attempt is stored<br>Then provider id, model, timestamps, and status are recorded.           |
| NFR-008 | Compatibility          | Must   | Given supported iOS and Android versions<br>When the app runs<br>Then all core flows operate without platform-specific failures.       |
| NFR-009 | Maintainability        | Should | Given a new OpenAI-compatible provider is added<br>When configured<br>Then no code changes are required beyond configuration.          |
| NFR-010 | Data retention limits  | Must   | Given more than 20 attempts exist<br>When a new attempt is created<br>Then the oldest attempts and images are removed.                 |
