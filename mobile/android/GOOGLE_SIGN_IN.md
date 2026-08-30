# Google Sign-In Android configuration

SyncChat Android package:

`com.syncchat.live`

Signing certificate fingerprints currently used for the Android Google Sign-In configuration:

- SHA-1: `E7:40:54:93:52:9D:42:72:A7:7D:18:27:D2:0B:6B:59:8A:FD:0E:C1`
- SHA-256: `16:8C:8F:5C:D8:4C:C6:22:EF:B5:57:E8:B9:01:F8:FF:5D:F5:8F:09:98:68:A7:74:E0:36:95:DF:CF:FB:B1:7E`

These fingerprints must be registered on the Firebase Android app for `com.syncchat.live` (Project settings -> Your apps -> Android app -> SHA certificate fingerprints). Google authentication must also be enabled in Firebase Authentication.

After registering or changing a signing certificate, download a fresh `google-services.json` from Firebase and replace `mobile/android/app/google-services.json`.

Do not manually add SHA fingerprints to `google-services.json`; Firebase generates the OAuth client entries after the certificate fingerprints are registered server-side.
