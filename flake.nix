{
  description = "DroidCode - web-first client for Rivet sandbox-agent (Vite + Tauri 2)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    wagent.url = "github:sdelcore/wagent";
  };

  outputs = { self, nixpkgs, flake-utils, wagent }:
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
          # NDK 27.1.12297006 used by Tauri 2 Android target.
          ndkVersions = [ "27.1.12297006" ];
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

        # Tauri 2 Linux system deps (webkit2gtk 4.1 is Tauri 2's target).
        tauriBuildInputs = with pkgs; [
          at-spi2-atk
          atkmm
          cairo
          gdk-pixbuf
          glib
          gobject-introspection
          gtk3
          harfbuzz
          librsvg
          libsoup_3
          openssl
          pango
          webkitgtk_4_1
          glib-networking  # runtime TLS for webkit fetch()
        ];

      in {
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook3
          ];

          buildInputs = (with pkgs; [
            # Web toolchain
            nodejs_22
            nodePackages.npm

            # Tauri toolchain
            rustc
            cargo
            cargo-tauri
            rust-analyzer
            rustfmt
            clippy

            # Android (Tauri Android target)
            androidSdk
            jdk17
            gradle
          ]) ++ tauriBuildInputs ++ [
            # Rivet sandbox-agent daemon — pinned via the wagent flake.
            # Companion server spawns this as a child on startup so the app
            # ships with a working local host out of the box.
            wagent.packages.${system}.sandbox-agent
          ];

          shellHook = ''
            export ANDROID_HOME="${androidSdk}/libexec/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
            export JAVA_HOME="${pkgs.jdk17}"

            # Override aapt2 for Gradle compatibility
            export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/${buildToolsVersion}/aapt2"

            # Tauri runtime: webkit needs GIO modules (TLS) + GSettings schemas
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"

            # Add platform-tools + node_modules/.bin to PATH
            export PATH="$ANDROID_HOME/platform-tools:$PWD/node_modules/.bin:$PATH"

            echo "DroidCode dev environment (Vite + Tauri 2)"
            echo ""
            echo "  Web:      npm run dev"
            echo "  Tauri:    cargo tauri dev"
            echo "  Build:    npm run build && cargo tauri build"
            echo "  Server:   cd server && npm run start"
            echo ""
          '';
        };
      }
    );
}
