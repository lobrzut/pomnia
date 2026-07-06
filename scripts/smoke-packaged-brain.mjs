import { fork } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "release/win-unpacked/resources/brain-core/embedded.js");
const execPath = join(root, "release/win-unpacked/Reliqua.exe");
const cwd = dirname(entry);
const dataDir = mkdtempSync(join(tmpdir(), "continuum-packaged-brain-"));

async function runSmoke() {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

  console.log("[smoke-packaged] entry:", entry);
  console.log("[smoke-packaged] execPath:", execPath);
  console.log("[smoke-packaged] cwd:", cwd);
  console.log("[smoke-packaged] dataDir:", dataDir);
  console.log(
    "[smoke-packaged] ELECTRON_RUN_AS_NODE:",
    env.ELECTRON_RUN_AS_NODE ?? "(unset)",
  );

  let child;
  try {
    child = fork(entry, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      cwd,
      execPath,
      env,
    });
  } catch (err) {
    return {
      ok: false,
      error: `fork failed: ${err instanceof Error ? err.message : String(err)}`,
      stderr: "",
      };
  }

  let stderr = "";
  child.stderr?.on("data", (d) => {
    const s = d.toString();
    stderr += s;
    process.stderr.write("[brain-core stderr] " + s);
  });

  const result = await new Promise((resolve) => {
    const onError = (err) => {
      clearTimeout(t);
      child.off("message", onMsg);
      resolve({
        ok: false,
        error: `child error: ${err.message}`,
        stderr,
        });
    };
    const t = setTimeout(() => {
      child.off("error", onError);
      child.kill();
      resolve({
        ok: false,
        error: "brain-core start timeout (20s)",
        stderr,
        });
    }, 20_000);
    const onMsg = (m) => {
      console.log("[smoke-packaged] message:", JSON.stringify(m));
      if (m.type === "ready" && m.url) {
        clearTimeout(t);
        child.off("message", onMsg);
        child.off("error", onError);
        resolve({
          ok: true,
          url: m.url,
          stderr,
            });
      } else if (m.type === "error") {
        clearTimeout(t);
        child.off("message", onMsg);
        child.off("error", onError);
        resolve({
          ok: false,
          error: m.message ?? "unknown",
          stderr,
            });
      }
    };
    child.on("error", onError);
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
  } else if (child && !child.killed) {
    child.kill();
  }

  return result;
}

const result = await runSmoke();

console.log(
  "RESULT",
  result.ok ? "ok" : "fail",
  JSON.stringify(
    {
      ok: result.ok,
      url: result.url,
      error: result.error,
      electronRunAsNode: true,
      stderr: result.stderr,
    },
    null,
    2,
  ),
);
process.exit(result.ok ? 0 : 1);
