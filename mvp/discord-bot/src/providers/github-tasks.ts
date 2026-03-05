/**
 * GitHub Projects タスク取得。
 * gh CLI経由でアクセス（Bot本体のconfig.tsに依存しない）。
 */

const PROJECT_NUMBER = "3";
const OWNER = "aiirononeko";

export interface Task {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  body: string;
}

interface ProjectItem {
  id: string;
  title: string;
  status: string;
  body: string;
  [key: string]: unknown;
}

async function runGh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`gh failed (${exitCode}): ${stderr.trim()}`);
  }

  return stdout.trim();
}

export async function getTodayTasks(): Promise<Task[]> {
  const today = new Date().toISOString().slice(0, 10);

  const output = await runGh([
    "project",
    "item-list",
    PROJECT_NUMBER,
    "--owner",
    OWNER,
    "--format",
    "json",
  ]);

  const data = JSON.parse(output);
  const items: ProjectItem[] = data.items ?? [];

  return items
    .filter((item) => {
      const status = item.status ?? "";
      const targetDate = (item as Record<string, unknown>)["target date"] as
        | string
        | undefined;
      // Target dateが今日 or Statusが"In progress"
      return targetDate === today || status === "In progress";
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status ?? "Backlog",
      targetDate:
        ((item as Record<string, unknown>)["target date"] as string) ?? null,
      body: item.body ?? "",
    }));
}
