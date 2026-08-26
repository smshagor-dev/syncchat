import 'api_client.dart';
import 'app_config.dart';
import 'auth_repository.dart';
import 'calling_repository.dart';
import 'chat_repository.dart';
import 'e2ee_service.dart';
import 'feature_repositories.dart';
import 'native_call_push.dart';
import 'realtime_client.dart';
import 'session_store.dart';

class AppServices {
  AppServices({
    required this.config,
    required this.sessionStore,
    required this.api,
    required this.auth,
    required this.realtime,
    required this.e2ee,
    required this.chat,
    required this.calling,
    required this.nativeCallPush,
    required this.inbox,
    required this.contacts,
    required this.statuses,
    required this.communities,
    required this.channels,
    required this.profile,
    required this.settings,
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
    final chat = ChatRepository(
      api: api,
      auth: auth,
      realtime: realtime,
      e2ee: e2ee,
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
      auth: auth,
      realtime: realtime,
      e2ee: e2ee,
      chat: chat,
      calling: calling,
      nativeCallPush: nativeCallPush,
      inbox: InboxRepository(api),
      contacts: ContactRepository(api),
      statuses: StatusRepository(api),
      communities: CommunityRepository(api),
      channels: ChannelRepository(api),
      profile: ProfileRepository(api),
      settings: SettingsRepository(api),
    );
  }

  final SyncChatConfig config;
  final SessionStore sessionStore;
  final ApiClient api;
  final AuthRepository auth;
  final RealtimeClient realtime;
  final E2eeService e2ee;
  final ChatRepository chat;
  final CallingRepository calling;
  final NativeCallPushService nativeCallPush;
  final InboxRepository inbox;
  final ContactRepository contacts;
  final StatusRepository statuses;
  final CommunityRepository communities;
  final ChannelRepository channels;
  final ProfileRepository profile;
  final SettingsRepository settings;

  Future<void> dispose() async {
    await nativeCallPush.dispose();
    await realtime.dispose();
    api.close();
  }
}
