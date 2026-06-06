# SubStride Lab Mobile App

React Native + Expo development-build foundation for iOS-first beta testing.

```bash
cd mobile-app
npm install
npm run ios
```

BLE requires a development build, not Expo Go. The app is local-first and works without cloud keys by using simulator sessions from `@substride/analytics`.

Beta cloud keys:

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `mobile-app/.env`
- OpenAI runs through the Supabase `explain-run` Edge Function; never put an OpenAI key in this app

See `docs/SUPABASE_BETA_BACKEND.md` for backend deploy steps.
