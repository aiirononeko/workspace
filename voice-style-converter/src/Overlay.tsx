import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

type PipelineState =
  | "recording"
  | "transcribing"
  | "converting"
  | "done"
  | "error"
  | "idle";

export default function Overlay() {
  const [state, setState] = useState<PipelineState>("idle");

  useEffect(() => {
    const unlisten = listen<string>("pipeline-state", (event) => {
      setState(event.payload as PipelineState);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (state === "idle") return null;

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      {state === "recording" && (
        <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse" />
      )}
      {(state === "transcribing" || state === "converting") && (
        <div className="w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      )}
      {state === "done" && (
        <div className="text-green-500 text-4xl">✓</div>
      )}
      {state === "error" && (
        <div className="text-yellow-500 text-4xl">✗</div>
      )}
    </div>
  );
}
