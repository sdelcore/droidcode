/**
 * Expo config plugin that adds the SSE foreground service native module.
 * This plugin:
 * 1. Adds the native Kotlin files (SseService, SseServiceModule, SseServicePackage)
 * 2. Registers the package in MainApplication.kt
 * 3. Adds required permissions and service declaration to AndroidManifest.xml
 */

const {
  withMainApplication,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Native Kotlin source code for the SSE Service
const SSE_SERVICE_KT = `package com.droid.code

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps SSE connections alive when the app is backgrounded.
 * Shows a persistent notification indicating active connections.
 */
class SseService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "sse-service"
        private const val CHANNEL_NAME = "Background Connection"

        const val ACTION_START = "com.droid.code.action.START_SSE_SERVICE"
        const val ACTION_STOP = "com.droid.code.action.STOP_SSE_SERVICE"
        const val ACTION_UPDATE = "com.droid.code.action.UPDATE_SSE_SERVICE"
        const val EXTRA_CONNECTION_COUNT = "connection_count"

        @Volatile
        var isRunning = false
            private set
    }

    private var connectionCount = 0

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                connectionCount = intent.getIntExtra(EXTRA_CONNECTION_COUNT, 1)
                startForegroundService()
            }
            ACTION_UPDATE -> {
                connectionCount = intent.getIntExtra(EXTRA_CONNECTION_COUNT, connectionCount)
                updateNotification()
            }
            ACTION_STOP -> {
                stopForegroundService()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps connections alive when app is in background"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundService() {
        isRunning = true
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun stopForegroundService() {
        isRunning = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun updateNotification() {
        if (!isRunning) return

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        // Intent to open the app when notification is tapped
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val connectionText = if (connectionCount == 1) {
            "1 connection active"
        } else {
            "\$connectionCount connections active"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DroidCode")
            .setContentText(connectionText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }
}
`;

const SSE_SERVICE_MODULE_KT = `package com.droid.code

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native native module to control the SSE foreground service.
 * Exposes methods to JavaScript for starting, stopping, and updating the service.
 */
class SseServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SseServiceModule"

    @ReactMethod
    fun startService(connectionCount: Int) {
        val context = reactApplicationContext
        val intent = Intent(context, SseService::class.java).apply {
            action = SseService.ACTION_START
            putExtra(SseService.EXTRA_CONNECTION_COUNT, connectionCount)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        val context = reactApplicationContext
        val intent = Intent(context, SseService::class.java).apply {
            action = SseService.ACTION_STOP
        }
        context.startService(intent)
    }

    @ReactMethod
    fun updateConnectionCount(count: Int) {
        if (!SseService.isRunning) return

        val context = reactApplicationContext
        val intent = Intent(context, SseService::class.java).apply {
            action = SseService.ACTION_UPDATE
            putExtra(SseService.EXTRA_CONNECTION_COUNT, count)
        }
        context.startService(intent)
    }

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(SseService.isRunning)
    }
}
`;

const SSE_SERVICE_PACKAGE_KT = `package com.droid.code

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native package that registers the SseServiceModule.
 */
class SseServicePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(SseServiceModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

/**
 * Add native Kotlin files to the Android project
 */
function withSseServiceFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageDir = path.join(
        projectRoot,
        'android/app/src/main/java/com/droid/code'
      );

      // Ensure directory exists
      fs.mkdirSync(packageDir, { recursive: true });

      // Write Kotlin files
      fs.writeFileSync(path.join(packageDir, 'SseService.kt'), SSE_SERVICE_KT);
      fs.writeFileSync(path.join(packageDir, 'SseServiceModule.kt'), SSE_SERVICE_MODULE_KT);
      fs.writeFileSync(path.join(packageDir, 'SseServicePackage.kt'), SSE_SERVICE_PACKAGE_KT);

      console.log('[withSseService] Added native Kotlin files');
      return config;
    },
  ]);
}

/**
 * Register SseServicePackage in MainApplication.kt
 */
function withSseServicePackage(config) {
  return withMainApplication(config, (config) => {
    const contents = config.modResults.contents;

    // Add import if not present
    if (!contents.includes('import com.droid.code.SseServicePackage')) {
      // This package is in the same package, so no import needed
    }

    // Add package registration
    if (!contents.includes('SseServicePackage()')) {
      // Find the packages apply block and add our package
      const packagesPattern = /PackageList\(this\)\.packages\.apply\s*\{([^}]*)\}/;
      const match = contents.match(packagesPattern);

      if (match) {
        const newContents = contents.replace(
          packagesPattern,
          `PackageList(this).packages.apply {$1
              add(SseServicePackage())
            }`
        );
        config.modResults.contents = newContents;
        console.log('[withSseService] Registered SseServicePackage in MainApplication');
      }
    }

    return config;
  });
}

/**
 * Add permissions and service declaration to AndroidManifest.xml
 */
function withSseServiceManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    const permissions = manifest['uses-permission'] || [];

    const requiredPermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    ];

    for (const perm of requiredPermissions) {
      if (!permissions.some(p => p.$['android:name'] === perm)) {
        permissions.push({ $: { 'android:name': perm } });
      }
    }
    manifest['uses-permission'] = permissions;

    // Add service declaration
    const application = manifest.application[0];
    const services = application.service || [];

    if (!services.some(s => s.$['android:name'] === '.SseService')) {
      services.push({
        $: {
          'android:name': '.SseService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }
    application.service = services;

    console.log('[withSseService] Added permissions and service to AndroidManifest');
    return config;
  });
}

/**
 * Main plugin function that combines all modifications
 */
function withSseService(config) {
  config = withSseServiceFiles(config);
  config = withSseServicePackage(config);
  config = withSseServiceManifest(config);
  return config;
}

module.exports = withSseService;
