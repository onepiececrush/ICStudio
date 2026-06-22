import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/icstudio_app.dart';
import 'package:icstudio_flutter/app/frame_log_standalone_app.dart';
import 'package:icstudio_flutter/src/rust/api/backend.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';
import 'package:icstudio_flutter/src/rust/frb_generated.dart';

Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();
  await RustLib.init();

  if (args.contains('--window=frame_log')) {
    runApp(const FrameLogStandaloneApp());
  } else {
    runApp(
      ICStudioApp(backendStatus: getBackendStatus(), snapshot: getAppSnapshot()),
    );
  }
}
