import type { Task } from "./types";

export const PROMPT_PREFIX = "prompts/";
export const TASK_TEMPLATES = [
  { title: "Research a topic", prompt: "Research [topic]. Compare reliable sources, cite links, and finish with a concise summary and next steps." },
  { title: "Plan my day", prompt: "Help me plan today. First ask about my priorities, appointments, and available time, then make a realistic schedule." },
  { title: "Draft an email", prompt: "Help me draft an email. Ask who it is for, the goal, and the tone before writing. Do not send it." },
  { title: "Organize a folder", prompt: "Help organize my chosen workspace folder. List its contents, propose a plan, and ask before changing any files." },
  { title: "Review code", prompt: "Review code in my chosen workspace for bugs and security issues. Explain your findings before proposing any edits." },
  { title: "Summarize my notes", prompt: "Read my saved notes and create a concise brief with key decisions, outstanding questions, and next actions." },
];

export function filterTasks(tasks: Task[], query: string) {
  const needle = query.trim().toLowerCase();
  return tasks.filter(task => task.title.toLowerCase().includes(needle));
}