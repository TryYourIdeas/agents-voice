# API Reference

This describes the HTTP APIs exposed by the three backend services, plus the Nuxt UI's proxy routes
that front them. A machine-readable OpenAPI 3.0 description of the three backend services is in
[`api.yml`](./api.yml) (import it into Swagger UI, Postman, Insomnia, etc.).

Default ports (see [`config.md`](./config.md) for how to change them):

| Service | Base URL (default) |
|---|---|
| `text-to-speech` | `http://localhost:8000` |
| `whisper-speech-to-text` | `http://localhost:8001` |
| `qwen-speech-to-text` | `http://localhost:8002` |
| `ui` (Nuxt proxy) | `http://localhost:3000/api` |

All request/response bodies are JSON unless noted otherwise (audio uploads are
`multipart/form-data`; synthesized audio is returned as `audio/wav`).

---

## `text-to-speech` service (port 8000)

### `GET /health`

Readiness probe.

**Response `200`**
```json
{
  "status": "ok",
  "custom_model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
  "base_model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
  "device": "cuda:0",
  "dtype": "bfloat16",
  "cloned_voices": 2
}
```
`status` is `"loading"` until the model(s) finish initializing. `base_model` is `null` when
`QWEN_TTS_ENABLE_CLONE=false`.

### `GET /voices`

List available speakers.

**Response `200`**
```json
{
  "speakers": ["Aiden", "Dylan", "Eric", "Ono_Anna", "Ryan", "Serena", "Sohee", "Uncle_Fu", "Vivian"],
  "cloned": ["my-voice"],
  "languages": ["Auto", "Chinese", "English", "French", "German", "Italian", "Japanese", "Korean", "Portuguese", "Russian", "Spanish"],
  "clone_enabled": true
}
```

### `POST /tts`

Synthesize speech from text. Request body (JSON):

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | 1–4000 characters. |
| `language` | string | no (default `"Auto"`) | Must be one of `GET /voices` → `languages`. |
| `speaker` | string | no (default `"Ryan"`) | A preset speaker name or a cloned `voice_id`. |
| `instruct` | string | no (default `""`) | Free-text style instruction; applies to preset speakers. |

**Response `200`** — `audio/wav` body, with header `X-Sample-Rate: <hz>`.

**Errors**
- `400` — unsupported `language`, or unknown `speaker`.
- `503` — required model not loaded yet.
- `500` — synthesis failed.

### `POST /voices/clone`

Create a new cloned voice from reference audio. `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | file | yes | Reference speech, any `ffmpeg`-decodable format; needs ≥ ~0.5s. |
| `ref_text` | string | yes | Exact transcript of the reference audio. |
| `voice_id` | string | no | `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`; auto-generated (`clone-xxxxxxxx`) if omitted. Cannot match a preset speaker name. |

**Response `200`**
```json
{ "voice_id": "my-voice", "ref_text": "Hello, this is my voice." }
```

**Errors**
- `400` — invalid/reserved `voice_id`, empty upload, or reference audio too short.
- `500` — clone prompt creation or persistence failed.
- `503` — voice cloning disabled (`QWEN_TTS_ENABLE_CLONE=false`) or clone model not loaded.

### `DELETE /voices/{voice_id}`

Remove a cloned voice (and its persisted files).

**Response `200`**
```json
{ "voice_id": "my-voice", "deleted": true }
```

**Errors**
- `400` — invalid `voice_id` format.
- `404` — no such cloned voice.

---

## `whisper-speech-to-text` service (port 8001)

### `GET /health`

```json
{ "status": "ok", "model": "openai/whisper-large-v3-turbo", "device": "cuda:0" }
```

### `POST /stt`

Transcribe or translate speech. `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | file | yes | Any `ffmpeg`-decodable format; needs ≥ ~250ms. |
| `language` | string | no | Lowercase language name (e.g. `english`, `spanish`) or omitted/`auto` for auto-detect. |
| `task` | string | no (default `transcribe`) | `transcribe` or `translate` (translate → English). |
| `return_timestamps` | boolean | no (default `false`) | Include per-segment timestamps. |

**Response `200`**
```json
{
  "text": "Hello, how are you?",
  "task": "transcribe",
  "language": "english",
  "chunks": [{ "text": "Hello, how are you?", "timestamp": [0.0, 1.8] }]
}
```
`language` is only present if an explicit (non-auto) language was supplied. `chunks` is only present
when `return_timestamps=true`.

**Errors**
- `400` — invalid `task`, empty upload, audio too short, or decode failure.
- `503` — model not loaded.
- `500` — transcription failed.

---

## `qwen-speech-to-text` service (port 8002)

### `GET /health`

```json
{ "status": "ok", "model": "Qwen/Qwen3-ASR-1.7B", "device": "cuda:0" }
```

### `POST /stt`

Transcribe speech (no translation mode). Same field names as the Whisper service for
drop-in compatibility, with two differences: `language` uses full language names (not lowercase
codes), and `task` only accepts `transcribe`.

`multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | file | yes | Any `ffmpeg`-decodable format; needs ≥ ~250ms. |
| `language` | string | no (default `Auto`) | Full language name, e.g. `English`, `Chinese`, `Cantonese`, ... (see `api.yml` for the full 30+ list), or `Auto` for automatic language ID. Case-insensitive — normalized to title case server-side. |
| `task` | string | no (default `transcribe`) | Only `transcribe` is accepted. |
| `return_timestamps` | boolean | no (default `false`) | Include per-segment timestamps. |

**Response `200`**
```json
{
  "text": "Hello, how are you?",
  "task": "transcribe",
  "language": "English",
  "chunks": [{ "text": "Hello, how are you?", "timestamp": [0.0, 1.8] }]
}
```
`language` always reflects what the model detected/used (unlike the Whisper service, it's always
present). `chunks` is only present when `return_timestamps=true` and the model returned timestamps.

**Errors**
- `400` — `task` other than `transcribe`, unsupported `language`, empty upload, audio too short, or
  decode failure.
- `503` — model not loaded.
- `500` — transcription failed.

---

## UI proxy routes (Nuxt server, port 3000)

These are thin server-side proxies (`ui/server/api/*`) — same request/response shape as the backend
endpoints they forward to, just under `/api` on the UI's own origin so the browser never needs the
backend URLs directly.

| UI route | Method | Proxies to |
|---|---|---|
| `/api/tts` | `POST` | `text-to-speech` `POST /tts` |
| `/api/voices` | `GET` | `text-to-speech` `GET /voices` |
| `/api/voices/clone` | `POST` | `text-to-speech` `POST /voices/clone` |
| `/api/voices/{id}` | `DELETE` | `text-to-speech` `DELETE /voices/{id}` |
| `/api/stt` | `POST` | `whisper-speech-to-text` `POST /stt`, or `qwen-speech-to-text` `POST /stt` |

### `POST /api/stt` engine selection

`/api/stt` additionally reads an `engine` query parameter to choose which STT backend handles the
request — it does **not** read this from the form body, so the multipart stream is proxied through
untouched:

```
POST /api/stt?engine=qwen
POST /api/stt?engine=whisper   # default if omitted
```

The rest of the request (the `multipart/form-data` body: `audio`, `language`, `task`,
`return_timestamps`) is identical to calling the target service's `/stt` directly.
