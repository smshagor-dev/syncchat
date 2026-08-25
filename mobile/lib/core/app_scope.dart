import 'package:flutter/widgets.dart';

import 'app_services.dart';

class AppServicesScope extends InheritedWidget {
  const AppServicesScope({
    super.key,
    required this.services,
    required super.child,
  });

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppServicesScope>();
    assert(scope != null, 'AppServicesScope is missing above this context.');
    return scope!.services;
  }

  static AppServices? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<AppServicesScope>()?.services;
  }

  @override
  bool updateShouldNotify(AppServicesScope oldWidget) =>
      oldWidget.services != services;
}

extension AppServicesContext on BuildContext {
  AppServices get services => AppServicesScope.of(this);
  AppServices? get maybeServices => AppServicesScope.maybeOf(this);
}
