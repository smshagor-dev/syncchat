import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  private var privacyView: UIVisualEffectView?

  override func sceneWillResignActive(_ scene: UIScene) {
    super.sceneWillResignActive(scene)
    guard privacyView == nil,
          let windowScene = scene as? UIWindowScene,
          let window = windowScene.windows.first(where: { $0.isKeyWindow }) ?? windowScene.windows.first
    else { return }

    let view = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
    view.frame = window.bounds
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.isUserInteractionEnabled = false
    window.addSubview(view)
    privacyView = view
  }

  override func sceneDidBecomeActive(_ scene: UIScene) {
    super.sceneDidBecomeActive(scene)
    privacyView?.removeFromSuperview()
    privacyView = nil
  }
}
