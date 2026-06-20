import 'package:flutter/material.dart';
import 'package:icstudio_flutter/app/app_shell.dart';
import 'package:icstudio_flutter/app/app_theme.dart';
import 'package:icstudio_flutter/src/rust/api/backend.dart';
import 'package:icstudio_flutter/src/rust/api/snapshot.dart';

class ICStudioApp extends StatelessWidget {
  const ICStudioApp({
    required this.backendStatus,
    required this.snapshot,
    super.key,
  });

  final BackendStatus backendStatus;
  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ICStudio',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AppShell(backendStatus: backendStatus, snapshot: snapshot),
    );
  }
}
