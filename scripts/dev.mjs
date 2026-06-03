import { spawn } from "node:child_process";

const npmCommand = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];

const children = [
  spawn(npmCommand, [...npmArgPrefix, "run", "dev:api"], { stdio: "inherit" }),
  spawn(npmCommand, [...npmArgPrefix, "run", "dev:client"], { stdio: "inherit" }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

for (const child of children) {
  child.on("error", (err) => {
    console.error(err);
    shutdown(1);
  });

  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
