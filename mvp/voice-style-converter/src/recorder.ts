import { spawn } from "child_process";
import { stdin as stdInput } from "process";

export async function recordAudio(): Promise<string> {
  const timestamp = Date.now();
  const outputPath = `/tmp/voice-style-converter-${timestamp}.wav`;

  console.log("🎙 録音中... Enterで停止");

  if (stdInput.isTTY) {
    stdInput.setRawMode(true);
  }

  return new Promise((resolve, reject) => {
    const recProcess = spawn("parec", [
      "--format=s16le",
      "--rate=16000",
      "--channels=1",
      "--file-format=wav",
      outputPath,
    ]);

    recProcess.on("error", (error) => {
      if (stdInput.isTTY) {
        stdInput.setRawMode(false);
      }
      reject(new Error(`Failed to start recording: ${error.message}`));
    });

    const onData = (data: Buffer) => {
      const key = data.toString();
      if (key === "\r" || key === "\n") {
        stdInput.removeListener("data", onData);

        if (stdInput.isTTY) {
          stdInput.setRawMode(false);
        }

        recProcess.kill("SIGTERM");
      }
    };

    stdInput.on("data", onData);

    recProcess.on("exit", (code) => {
      stdInput.removeListener("data", onData);

      if (stdInput.isTTY) {
        stdInput.setRawMode(false);
      }

      // parec: 0=normal, null+SIGTERM=user stopped
      if (code !== 0 && code !== null) {
        reject(new Error(`Recording process exited with code ${code}`));
      } else {
        console.log("\n✓ 録音完了");
        resolve(outputPath);
      }
    });
  });
}
