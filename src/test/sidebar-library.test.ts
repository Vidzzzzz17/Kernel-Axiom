import { describe, expect, it } from "vitest";
import { filterTasks, PROMPT_PREFIX } from "@/lib/kernel/library";
import type { Task } from "@/lib/kernel/types";

describe("Conversation library", () => {
  const tasks: Task[] = [
    { id: "a", title: "Launch checklist", createdAt: 1, updatedAt: 2, pinned: true },
    { id: "b", title: "Research models", createdAt: 1, updatedAt: 3 },
  ];
  it("finds conversations case-insensitively without losing pinned state", () => {
    expect(filterTasks(tasks, "  LAUNCH ")).toEqual([tasks[0]]);
  });
  it("keeps all conversations when the query is empty", () => {
    expect(filterTasks(tasks, "")).toHaveLength(2);
  });
  it("separates reusable prompts from regular notes", () => {
    expect("prompts/Email".startsWith(PROMPT_PREFIX)).toBe(true);
    expect("notes/Meeting".startsWith(PROMPT_PREFIX)).toBe(false);
  });
});