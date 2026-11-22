{
  lib,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  electron_45,
  makeWrapper,
  copyDesktopItems,
  makeDesktopItem,
}:

buildNpmPackage {
  pname = "x-media-tracker-desktop";
  version = (lib.importJSON ../package.json).version;
  src = lib.cleanSource ../.;

  nodejs = nodejs_24;
  # Read from package-lock.json, so there is no deps hash to keep in step with it.
  npmDeps = importNpmLock { npmRoot = ../.; };
  npmConfigHook = importNpmLock.npmConfigHook;
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  nativeBuildInputs = [
    makeWrapper
    copyDesktopItems
  ];

  npmBuildScript = "build:desktop";

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save --ignore-scripts
    mkdir -p $out/lib/x-media-tracker-desktop
    cp -r out package.json node_modules resources $out/lib/x-media-tracker-desktop/
    install -Dm644 resources/icon.png $out/share/icons/hicolor/512x512/apps/x-media-tracker.png
    makeWrapper ${lib.getExe electron_45} $out/bin/x-media-tracker-desktop \
      --add-flags $out/lib/x-media-tracker-desktop \
      --unset ELECTRON_RUN_AS_NODE

    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "x-media-tracker";
      desktopName = "X-Media-Tracker";
      comment = "Movies and TV shows to watch, watching and watched";
      exec = "x-media-tracker-desktop";
      icon = "x-media-tracker";
      categories = [ "Utility" ];
    })
  ];

  meta = {
    description = "X-Media-Tracker as a desktop app with its own database";
    license = lib.licenses.gpl3Plus;
    mainProgram = "x-media-tracker-desktop";
  };
}
