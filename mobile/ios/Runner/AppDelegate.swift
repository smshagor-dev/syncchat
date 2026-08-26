import Flutter
import UIKit
import CallKit
import AVFAudio
import PushKit
import flutter_callkit_incoming

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, PKPushRegistryDelegate, CallkitIncomingAppDelegate {
  private var voipRegistry: PKPushRegistry?
  private var pendingVoipToken: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let token = pendingVoipToken {
      SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
    }
  }

  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    pendingVoipToken = token
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    pendingVoipToken = nil
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }

    let raw = payload.dictionaryPayload
    let callId = raw["callId"] as? String ?? ""
    guard !callId.isEmpty else {
      completion()
      return
    }
    let fromName = raw["fromName"] as? String ?? ""
    let fromUsername = raw["fromUsername"] as? String ?? ""
    let caller = !fromName.isEmpty ? fromName : (!fromUsername.isEmpty ? "@\(fromUsername)" : "SyncChat caller")
    let handle = !fromUsername.isEmpty ? "@\(fromUsername)" : (raw["fromUserId"] as? String ?? caller)
    let isVideo = (raw["mediaType"] as? String ?? "audio") == "video"

    var extra: [String: Any] = [:]
    for (key, value) in raw {
      extra[String(describing: key)] = value
    }
    let data = flutter_callkit_incoming.Data(
      id: callId,
      nameCaller: caller,
      handle: handle,
      type: isVideo ? 1 : 0
    )
    data.extra = extra as NSDictionary
    data.supportsVideo = isVideo
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.showCallkitIncoming(data, fromPushKit: true) {
      completion()
    }
  }

  func onAccept(_ call: Call, _ action: CXAnswerCallAction) {
    action.fulfill()
  }

  func onDecline(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onEnd(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onTimeOut(_ call: Call) {}

  func didActivateAudioSession(_ audioSession: AVAudioSession) {}

  func didDeactivateAudioSession(_ audioSession: AVAudioSession) {}

  func providerDidReset() {}
}
