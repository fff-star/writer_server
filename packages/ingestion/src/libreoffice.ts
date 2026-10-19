import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type ConversionRequest = {
  input: string;
  outputDirectory: string;
  format: "doc" | "docx" | "pdf";
  filter?: string;
};

export type ConversionResult = {
  outputPath: string;
  originalSha256: string;
};

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function runSoffice(
  args: string[],
  profile: string,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("soffice", args, {
      env: {
        PATH: process.env["PATH"] ?? "",
        HOME: profile,
        LANG: "C.UTF-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code, stderr });
    });
  });
}

export async function convertWithLibreOffice(
  request: ConversionRequest,
): Promise<ConversionResult> {
  const input = resolve(request.input);
  if (!existsSync(input)) {
    throw new Error(`Conversion input does not exist: ${input}`);
  }
  const originalSha256 = await sha256(input);
  await mkdir(request.outputDirectory, { recursive: true });
  const transaction = await mkdtemp(join(request.outputDirectory, "libreoffice-conversion-"));
  const profile = join(transaction, "profile");
  const converted = join(transaction, "converted");
  await mkdir(profile, { recursive: true });
  await mkdir(converted, { recursive: true });
  const target = request.filter ? `${request.format}:${request.filter}` : request.format;

  try {
    const result = await runSoffice(
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--convert-to",
        target,
        "--outdir",
        converted,
        input,
      ],
      profile,
    );
    const outputPath = join(converted, `${basename(input, extname(input))}.${request.format}`);
    if (result.code !== 0 || !existsSync(outputPath)) {
      throw new Error(`LibreOffice conversion failed (${result.code}): ${result.stderr.trim()}`);
    }
    if ((await sha256(input)) !== originalSha256) {
      throw new Error("LibreOffice modified the immutable source file");
    }
    return { outputPath, originalSha256 };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

export async function convertLegacyDoc(
  input: string,
  outputDirectory: string,
  format: "docx" | "pdf",
): Promise<ConversionResult> {
  if (extname(input).toLowerCase() !== ".doc") {
    throw new Error(`Expected a legacy DOC input: ${input}`);
  }
  return convertWithLibreOffice({ input, outputDirectory, format });
}
