{
  lib,
  buildNpmPackage,
  nodejs_24,
  makeWrapper,
}:

buildNpmPackage {
  pname = "x-media-tracker";
  version = (lib.importJSON ../package.json).version;
  src = lib.cleanSource ../.;

  nodejs = nodejs_24;
  npmDepsHash = import ./npm-deps-hash.nix;
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  nativeBuildInputs = [ makeWrapper ];

  # Node will not run .ts files from under a node_modules folder, so the app lives in lib/x-media-tracker.
  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save --ignore-scripts

    mkdir -p $out/lib/x-media-tracker/src $out/lib/x-media-tracker/out
    cp -r package.json node_modules $out/lib/x-media-tracker/
    cp -r out/web $out/lib/x-media-tracker/out/
    cp -r src/server src/shared $out/lib/x-media-tracker/src/

    makeWrapper ${lib.getExe nodejs_24} $out/bin/x-media-tracker \
      --add-flags "--disable-warning=ExperimentalWarning $out/lib/x-media-tracker/src/server/main.ts" \
      --set-default NODE_ENV production

    runHook postInstall
  '';

  meta = {
    description = "Movies and TV shows to watch, watching and watched, synced through your own server";
    license = lib.licenses.gpl3Plus;
    mainProgram = "x-media-tracker";
  };
}
