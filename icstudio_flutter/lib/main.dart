import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/icstudio_app.dart';
import 'package:icstudio_flutter/src/rust/api/backend.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';
import 'package:icstudio_flutter/src/rust/frb_generated.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await RustLib.init();
  runApp(
    ICStudioApp(backendStatus: getBackendStatus(), snapshot: getAppSnapshot()),
  );
}
