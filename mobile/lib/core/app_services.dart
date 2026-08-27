import 'account_storage_repository.dart';
import 'api_client.dart';
import 'app_config.dart';
import 'auth_repository.dart';
import 'cached_repositories.dart';
import 'calling_repository.dart';
import 'channel_repository.dart' as live_channel;
import 'chat_cache.dart';
import 'chat_repository.dart';
import 'e2ee_service.dart';
import 'feature_repositories.dart';
import 'group_repository.dart';
import 'native_call_push.dart';
import 'public_app_config.dart';
import 'realtime_client.dart';
import 'session_store.dart';

class AppServices {
  AppServices({
    required this.config,
    required this.sessionStore,
    required this.api,
    required this.publicAppConfig,
    required this.auth,
    required this.realtime,
    required this.e2ee,
    required this.chatCache,
    required this.chat,
    required this.calling,
    required this.nativeCallPush,
    required this.inbox,
    required this.contacts,
    required this.statuses,
    required this.communities,
    required this.channels,
    required this.groups,
    required this.profile,
    required this.settings,
    required this.accountStorage,
  });

  factory AppServices.create({
    SyncChatConfig? config,
    SessionStore? sessionStore,
  }) {
    final resolvedConfig = config ?? SyncChatConfig.fromEnvironment();
    final resolvedSessionStore = sessionStore ?? SecureSessionStore();
    final api = ApiClient(
      config: resolvedConfig,
      sessionStore: resolvedSessionStore,
    );
    final auth = AuthRepository(api: api, sessionStore: resolvedSessionStore);
    final realtime = RealtimeClient(
      config: resolvedConfig,
      sessionStore: resolvedSessionStore,
    );
    final e2ee = E2eeService(api: api, sessionStore: resolvedSessionStore);
    final chatCache = ChatCache();
    final chat = CachedChatRepository(
      api: api,
      auth: auth,
      realtime: realtime,
      e2ee: e2ee,
      cache: chatCache,
    );
    final calling = CallingRepository(api: api, auth: auth, realtime: realtime);
    final nativeCallPush = NativeCallPushService(
      api: api,
      calling: calling,
      sessionStore: resolvedSessionStore,
      config: resolvedConfig,
    );

    return AppServices(
      config: resolvedConfig,
      sessionStore: resolvedSessionStore,
      api: api,
      publicAppConfig: PublicAppConfigRepository(api),
      auth: auth,
      realtime: realtime,
      e2ee: e2ee,
      chatCache: chatCache,
      chat: chat,
      calling: calling,
      nativeCallPush: nativeCallPush,
      inbox: CachedInboxRepository(api, chatCache),
      contacts: ContactRepository(api),
      statuses: StatusRepository(api),
      communities: CommunityRepository(api),
      channels: live_channel.ChannelRepository(
        api: api,
        auth: auth,
        realtime: realtime,
      ),
      groups: GroupRepository(api: api, auth: auth, realtime: realtime),
      profile: ProfileRepository(api),
      settings: SettingsRepository(api),
      accountStorage: AccountStorageRepository(api),
    );
  }

  SyncChatConfig config;
  final SessionStore sessionStore;
  final ApiClient api;
  final PublicAppConfigRepository publicAppConfig;
  final AuthRepository auth;
  final RealtimeClient realtime;
  final E2eeService e2ee;
  final ChatCache chatCache;
  final ChatRepository chat;
  final CallingRepository calling;
  final NativeCallPushService nativeCallPush;
  final InboxRepository inbox;
  final ContactRepository contacts;
  final StatusRepository statuses;
  final CommunityRepository communities;
  final live_channel.ChannelRepository channels;
  final GroupRepository groups;
  final ProfileRepository profile;
  final SettingsRepository settings;
  final AccountStorageRepository accountStorage;

  void applyPublicAppConfig(PublicAppConfig runtime) {
    config = config.copyWith(
      chatUploadLimitMb: runtime.chatUploadLimitMb,
      avatarUploadLimitMb: runtime.avatarUploadLimitMb,
    );
  }

  Future<void> dispose() async {
    await nativeCallPush.dispose();
    await realtime.dispose();
    api.close();
  }
}
