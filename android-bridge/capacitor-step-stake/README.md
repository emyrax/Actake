# Actake Capacitor Android Bridge (`capacitor-step-stake`)

Isolated native Kotlin Capacitor plugin for Solana Seeker & Android APK builds.
Keeps the primary Vite + React PWA untouched while enabling hardware step tracking and WorkManager background midnight check-ins once packaged with Capacitor.

## Included Native Components
- **`StepCounterBridge.kt`**: Registers `Sensor.TYPE_STEP_COUNTER`, persists 00:00 daily baselines in `EncryptedSharedPreferences` (`AES256_GCM`), guards against reboot/clock spoofing via `SystemClock.elapsedRealtime()` and `BOOT_COUNT`, and computes canonical SHA-256 `proof_hash` payloads.
- **`MidnightCheckinWorker.kt`**: Schedules a 15-minute `PeriodicWorkRequest` plus a high-priority `23:15` local-time cutoff worker. Fires a Seed Vault MWA deep-link notification (`actake://step-stake/checkin?...`) by default, or uses the user's opt-in scoped ephemeral session key authorized at pool join time.

## Capacitor Integration Steps (for Seeker APK Build)
1. Initialize Capacitor in a local build checkout (`npx cap init Actake app.actake.mobile --web-dir dist && npx cap add android`).
2. Copy `android-bridge/capacitor-step-stake` into your Android Gradle project and register `StepCounterBridge::class.java` in `MainActivity.onCreate()`.
3. Add the intent filter for scheme `actake`, host `step-stake` in your app's `AndroidManifest.xml` so tapping the midnight check-in notification opens directly to the MWA signing flow.
