# P0/P1 Remaining Reliability Completion

This wave closes the two gaps found in the post-PR #99 audit:

- Normal chat messages now fan out to registered native Android FCM and iOS APNs standard tokens through the same notification-policy path already used by web push. Mute, push enablement, category notification preferences, and preview privacy are retained. Incoming-call native delivery remains on the dedicated CallKit/VoIP path and is not duplicated.
- Offline photo, video, document, and voice attachments are staged into app-private durable storage, represented in the encrypted outbox metadata, and uploaded/sent with the original client message id after connectivity returns. Successful replay removes the staged file.

CI must pass backend build/tests/audit plus Flutter analyze/tests before merge.
