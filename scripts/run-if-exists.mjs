// Kør: node scripts/run-if-exists.mjs <sti-til-script.mjs>
// Hvis filen ikke findes, logges en info og vi fortsætter uden at fejle.

import fs from "node:fs";
import { spawn } from "node:child_process";

const target = process.argv[2];
if (!target) {
  console.log("[run-if-exists] Ingen sti angivet. Skipper.");
  process.exit(0);
}

if (!fs.existsSync(target)) {
  console.log(`[run-if-exists] Mangler: ${target} — skipper dette trin.`);
  process.exit(0);
}

const child = spawn(process.execPath, [target], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
