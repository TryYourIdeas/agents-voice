# Backlog

## Breeze TTS 2 and Step-Audio-EditX compose variants
- **Description:** two more variants of `whatsap-lfm3-stt-tts-vision-docker-compose.yml`, each with its own `/tts`-contract service, like `kokoro-tts`. Breeze TTS 2 is `BreezeBlue/Breeze-TTS-2` (weights non-commercial; confirm that is the intended model, not MediaTek's Breeze2-VITS/BreezyVoice). Step-Audio-EditX (3B) needs ~12 GB VRAM.
- **Value:** compare TTS quality/latency across models on the same bot.
- **If not done:** only LFM3-Audio and Kokoro are available for spoken replies.
- **Open decision:** how EditX shares a 12 GB GPU with the two llama-servers and lfm3-audio (drop the vision server, use the Int4 checkpoint, or run on CPU).

## Pass the reply language to TTS
- **Description:** whatsap's `lib/voice-reply.ts` sends only `text` and `voice`, so Kokoro (and lfm3-audio) read everything with the English voice.
- **Value:** correct pronunciation for Portuguese/Spanish/etc. replies (Kokoro already supports `language`).
- **If not done:** non-English voice notes are mispronounced.


## Replay: images and audio

- **Description:** logs keep `[image …]` placeholders, never the media, so a replay of a turn that carried an image or a voice note only sees text.
- **Value:** faithful replays of vision/voice turns.
- **If not done:** such replays answer a different (text-only) question; compare them with care.
