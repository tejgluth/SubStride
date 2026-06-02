# SubStride Lab Mobile App

React Native + Expo development-build foundation for iOS-first beta testing.

```bash
cd mobile-app
npm install
npm run ios
```

BLE requires a development build, not Expo Go. The app is local-first and works without cloud keys by using simulator sessions from `@substride/analytics`.

Optional later keys:

- Supabase URL and anon key in `app.json`/Expo config for cloud sync
- OpenAI API key for AI explanations; deterministic metrics work without it
