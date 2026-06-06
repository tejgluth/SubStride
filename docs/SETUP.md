# SubStride Setup

## Install

```bash
npm install
```

## Analytics and Simulator

```bash
npm test
npm run generate:sample-data
npm run validate:sample-data
```

This creates simulator `.sslog` files and JSON previews in `sample-data`.

## Firmware

Install PlatformIO, then:

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

If the VS Code PlatformIO extension installed the CLI but `pio` is not on your shell `PATH`, use:

```bash
~/.platformio/penv/bin/pio run
```

Edit `firmware/include/pin_map.h` for the actual pod wiring before upload.

## Mobile App

The app is Expo development-build based because BLE needs native modules.

```bash
cd mobile-app
npm run ios
```

The app starts in simulator mode and does not require hardware, login, or Supabase keys.

## Beta Cloud Backend

Supabase Auth, run sync, private run storage, and AI summaries are scaffolded in `supabase/`.

The mobile app only uses public Supabase values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The OpenAI key is stored as a Supabase Edge Function secret, not in the app. See `docs/SUPABASE_BETA_BACKEND.md`.
