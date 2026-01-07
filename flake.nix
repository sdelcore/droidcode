{
  description = "DroidCode Expo - React Native client for OpenCode";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        buildToolsVersion = "35.0.0";

        androidComposition = pkgs.androidenv.composeAndroidPackages {
          cmdLineToolsVersion = "11.0";
          toolsVersion = "26.1.1";
          platformToolsVersion = "35.0.2";
          buildToolsVersions = [ "36.0.0" buildToolsVersion "34.0.0" ];
          platformVersions = [ "36" "35" "34" ];
          abiVersions = [ "arm64-v8a" "x86_64" ];
          includeEmulator = true;
          includeSystemImages = true;
          includeNDK = true;
          # NDK 27.1.12297006 required by React Native 0.81+
          ndkVersions = [ "27.1.12297006" "26.1.10909125" ];
          # CMake required for native builds
          cmakeVersions = [ "3.22.1" ];
          includeSources = false;
          extraLicenses = [
            "android-googletv-license"
            "android-sdk-arm-dbt-license"
            "android-sdk-preview-license"
            "google-gdk-license"
            "intel-android-extra-license"
            "intel-android-sysimage-license"
            "mips-android-sysimage-license"
          ];
        };

        androidSdk = androidComposition.androidsdk;

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js for React Native (v22 required for mobile-mcp)
            nodejs_22
            nodePackages.npm

            # Android SDK
            androidSdk

            # Java for Android builds
            jdk17

            # Additional tools
            watchman
            gradle
          ];

          shellHook = ''
            export ANDROID_HOME="${androidSdk}/libexec/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
            export JAVA_HOME="${pkgs.jdk17}"

            # Override aapt2 for Gradle compatibility
            export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/${buildToolsVersion}/aapt2"

            # Add platform-tools to PATH
            export PATH="$ANDROID_HOME/platform-tools:$PWD/node_modules/.bin:$PATH"

            echo "DroidCode Expo development environment"
            echo ""
            echo "ANDROID_HOME: $ANDROID_HOME"
            echo "ANDROID_NDK:  $ANDROID_NDK_HOME"
            echo "JAVA_HOME:    $JAVA_HOME"
            echo ""
            echo "Commands:"
            echo "  npm start              - Start Expo dev server"
            echo "  npm run android        - Start on Android"
            echo "  npm test               - Run tests"
            echo "  npm run typecheck      - TypeScript check"
            echo "  ./scripts/push-update.sh  - Build and deploy APK"
            echo ""
          '';
        };
      }
    );
}
