// The page's side: with no code of its own it still gives the plugin its row under Settings → Plugins, to turn it on or off.

import { manifest } from "./manifest.js";

export default { ...manifest, start: () => {} };
