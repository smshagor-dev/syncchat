# Mobile P0/P1 conflict resolution

PR #95 was based on a stale pre-refactor mobile tree and conflicted with the merged P0/P1 architecture.

Resolution strategy:

- Preserve current `main` as the source of truth.
- Keep the refactored chat entry wrapper in `mobile/lib/screens/live_chat_room_screen.dart`.
- Keep the realtime/message runtime in `mobile/lib/screens/live_chat_room_core_screen.dart`.
- Keep contextual Friend / Group / Channel info through `live_entity_profile_screen.dart`.
- Keep rich Location / Contact / Poll / Quiz / Event / Sticker actions through `live_room_context_tools.dart`.
- Keep the current `ChannelRepository` admin/edit contracts from the verification hotfix.
- Drop the stale duplicate monolithic chat-room and rich-action implementation from the old PR #95 branch.

`mobile/test/p0_p1_conflict_resolution_test.dart` protects these resolved contracts from regressing.
