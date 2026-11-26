#!/usr/bin/env node
import "./ts-hooks.mjs";

const { runCli } = await import("./cli-main");
process.exitCode = await runCli(process.argv.slice(2));
