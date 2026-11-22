// Low Tide City — make.fun entry program for gta6-01 ("Make GTA 6").
//
// The contract this file implements (from the competition kit):
//   * run with Node 22, standard library only;
//   * copy game/ and screenshots/ from this repository into the output
//     directory (MAKEFUN_OUTPUT_DIR, default /output);
//   * write dossier.json there with the kit library's buildDossier, using
//     the scorer's own caps, so the dossier on disk is byte for byte the
//     dossier the scorer rebuilds from the same files;
//   * running it twice over the same repository gives identical bytes.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDossier } from "./vendor/makefun-game.ts";

// The caps below are the scorer's caps for this competition. They are part
// of the dossier format, not tuning knobs: change one and the dossier this
// program writes stops matching the scorer's own rebuild.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Start from an empty output directory so a stale file from an earlier run
// can never leak into the dossier.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(repoDir, "game"), join(outDir, "game"), { recursive: true });
cpSync(join(repoDir, "screenshots"), join(outDir, "screenshots"), {
  recursive: true,
});

const dossier = buildDossier(outDir, DOSSIER_CAPS);
writeFileSync(join(outDir, "dossier.json"), dossier);
