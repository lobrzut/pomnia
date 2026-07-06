import { fork } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "build/brain-core-runtime/embedded.js");
const execPath = join(root, "node_modules/electron/dist/electron.exe");
const cwd = dirname(entry);
const dataDir = mkdtempSync(join(tmpdir(), "continuum-brain-smoke-"));

console.log("[smoke] entry:", entry);
console.log("[smoke] execPath:", execPath);
console.log("[smoke] cwd:", cwd);
console.log("[smoke] dataDir:", dataDir);

const child = fork(entry, [], {
  stdio: ["ignore", "pipe", "pipe", "ipc"],
  cwd,
  execPath,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

let stderr = "";
child.stderr?.on("data", (d) => {
  const s = d.toString();
  stderr += s;
  process.stderr.write("[brain-core stderr] " + s);
});

const result = await new Promise((resolve) => {
  const t = setTimeout(() => {
    child.kill();
    resolve({ ok: false, error: "brain-core start timeout (20s)", stderr });
  }, 20_000);
  const onMsg = (m) => {
    console.log("[smoke] message:", JSON.stringify(m));
    if (m.type === "ready" && m.url) {
      clearTimeout(t);
      child.off("message", onMsg);
      resolve({ ok: true, url: m.url, stderr });
    } else if (m.type === "error") {
      clearTimeout(t);
      child.off("message", onMsg);
      resolve({ ok: false, error: m.message ?? "unknown", stderr });
    }
  };
  child.on("message", onMsg);
  child.send({
    type: "start",
    config: {
      dataDir,
      host: "127.0.0.1",
      port: 7862,
      ollamaUrl: "http://127.0.0.1:11434",
    },
  });
});

if (result.ok && child.connected) {
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      child.kill();
      resolve();
    }, 5000);
    child.once("message", (m) => {
      if (m.type === "stopped") {
        clearTimeout(t);
        resolve();
      }
    });
    child.send({ type: "stop" });
  });
}

console.log("[smoke] RESULT:", JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
