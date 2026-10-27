#!/usr/bin/env bun
/**
 * Update package.json version according to .docs/guide/versioning.md
 * Scheme: Release.Feature.Fix (incremental, lower parts never reset)
 * Fix = number of commits from initial commit (git rev-list --count HEAD)
 * If uncommitted changes exist, Fix = count + 1
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

const ROOT = join(import.meta.dir, "..");
const PACKAGE_JSON = join(ROOT, "package.json");

function run(cmd: string[]): string {
  const proc = Bun.spawnSync(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return new TextDecoder().decode(proc.stdout).trim();
}

function parseArgs(): { release?: string; feature?: string } {
  const args = process.argv.slice(2);
  const result: { release?: string; feature?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--release" || arg === "-r") {
      result.release = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--feature" || arg === "-f") {
      result.feature = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--patch" || arg === "-p") {
      // Keep backward compatibility, treat as feature if that's what user expects
      // but per scheme patch is Fix - however user says they want to input patch
      // Better to check: maybe they mean fix? But Fix is computed from git
      // We'll treat as feature if second arg, otherwise ignore
      if (!result.feature && result.release) {
        result.feature = args[i + 1];
      }
      i++;
      continue;
    }
    if (!result.release && /^\d+$/.test(arg)) {
      result.release = arg;
      continue;
    }
    if (!result.feature && /^\d+$/.test(arg) && result.release) {
      result.feature = arg;
      continue;
    }
  }

  return result;
}

function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

async function promptInput(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getVersionsInteractive(
  currentRelease: string,
  currentFeature: string,
): Promise<{ release: string; feature: string }> {
  console.log(`Current version: Release=${currentRelease}, Feature=${currentFeature} (Fix is computed from git)`);
  let release: string | undefined;
  let feature: string | undefined;

  while (!release || !isNonNegativeInteger(release)) {
    const input = await promptInput(`Enter release version [${currentRelease}]: `);
    if (input === "") {
      release = currentRelease;
    } else if (isNonNegativeInteger(input)) {
      release = input;
    } else {
      console.error("Release must be a non-negative integer");
    }
  }

  while (!feature || !isNonNegativeInteger(feature)) {
    const input = await promptInput(`Enter feature version [${currentFeature}]: `);
    if (input === "") {
      feature = currentFeature;
    } else if (isNonNegativeInteger(input)) {
      feature = input;
    } else {
      console.error("Feature must be a non-negative integer");
    }
  }

  return { release, feature };
}

function computeFix(): string {
  // Count commits from initial commit
  const commitCount = parseInt(run(["git", "rev-list", "--count", "HEAD"]), 10);

  // Check for uncommitted changes
  const status = run(["git", "status", "--porcelain"]);
  const hasUncommittedChanges = status.length > 0;

  // Calculate Fix
  const fix = hasUncommittedChanges ? commitCount + 1 : commitCount;
  return String(fix);
}

async function main() {
  const { release: inputRelease, feature: inputFeature } = parseArgs();

  if ((inputRelease && !inputFeature) || (!inputRelease && inputFeature)) {
    console.error("Both release and feature versions must be provided together");
    console.error("Usage: bun scripts/update-version.ts --release <release> --feature <feature>");
    console.error("   or: bun scripts/update-version.ts <release> <feature>");
    process.exit(1);
  }

  // Get current version
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  const currentVersion = pkg.version;
  const parts = currentVersion.split(".");

  if (parts.length !== 3) {
    console.error(`Invalid version format: ${currentVersion}. Expected Release.Feature.Fix`);
    process.exit(1);
  }

  const currentFeature = parts[1];
  const currentRelease = parts[0];

  let release: string;
  let feature: string;
  let usedExplicitInput = false;

  if (inputRelease && inputFeature) {
    if (!isNonNegativeInteger(inputRelease)) {
      console.error(`Invalid release version: ${inputRelease}. Must be a non-negative integer`);
      process.exit(1);
    }
    if (!isNonNegativeInteger(inputFeature)) {
      console.error(`Invalid feature version: ${inputFeature}. Must be a non-negative integer`);
      process.exit(1);
    }
    release = inputRelease;
    feature = inputFeature;
    usedExplicitInput = true;
  } else if (!process.stdin.isTTY) {
    // Non-interactive environment, use current values and compute fix
    release = currentRelease;
    feature = currentFeature;
  } else {
    // Interactive mode - prompt for input
    const prompted = await getVersionsInteractive(currentRelease, currentFeature);
    release = prompted.release;
    feature = prompted.feature;
    usedExplicitInput = true;
  }

  const fix = computeFix();
  const newVersion = `${release}.${feature}.${fix}`;

  if (newVersion === currentVersion) {
    console.log(`Version unchanged: ${currentVersion}`);
    return;
  }

  pkg.version = newVersion;
  writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`Version updated: ${currentVersion} → ${newVersion}`);
  const commitCount = parseInt(run(["git", "rev-list", "--count", "HEAD"]), 10);
  const status = run(["git", "status", "--porcelain"]);
  const hasUncommittedChanges = status.length > 0;
  console.log(`  Commits: ${commitCount}${hasUncommittedChanges ? " + 1 (uncommitted changes)" : ""} (Fix = ${fix})`);
}

main();
