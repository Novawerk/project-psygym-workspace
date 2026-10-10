// Flags for the AI client's replies, used by scripts/quality.ts. A flag means "a person
// should read this turn", not "this turn failed".

// B1: the client says it is an AI, a model or a role-play.
export const BREAKS_ROLE =
  /作为(一个|一名)?(AI|人工智能|语言模型|助手|模型)|我(是|只是)(一个|一名)?(AI|人工智能|语言模型|机器人|聊天机器人|程序|虚拟)|角色扮演|模拟(的)?来访者|\bas an AI\b|language model|\bI(?:'m| am) (?:an? )?(?:AI|bot|chatbot|assistant|language model)\b|role-?play/i;

// B1: the client talks about its own prompt or setting as a thing it has. A confused
// echo ("……提示词？", "Prompt?") is in character and does not match.
export const CLAIMS_PROMPT =
  /我的(提示词|设定|指令|角色)(是|如下|里|写)|我(被|是被)(设定|要求|指示)|我(在|正在)?扮演|病例(说明|里写|上写)|练习工具里|\bmy (?:system )?(?:prompt|instructions|setup|role) (?:is|are|says?)\b|\bI(?:'m| am) (?:playing|role-?playing|simulating)\b|\bI was (?:told|instructed|asked) to\b|\bthe case (?:notes|file|brief)\b/i;

// B2: the client advises.
export const GIVES_ADVICE =
  /建议你|我建议|你(可以|应该|不妨)(试试|尝试|多|先)|不妨|you should|I (?:suggest|recommend)|you (?:could|might) try|have you tried/i;

const norm = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/[\s#*`>\-「」"'“”（）()]/g, "").toLowerCase();

/**
 * B1: runs of `window` characters that the reply shares with the prompt text, i.e. the
 * client repeating its own instructions. Returns the first shared run, or undefined.
 */
export function promptOverlap(reply: string, promptText: string, window = 14): string | undefined {
  const p = norm(promptText);
  const r = norm(reply);
  if (r.length < window) return undefined;
  const runs = new Set<string>();
  for (let i = 0; i + window <= p.length; i++) runs.add(p.slice(i, i + window));
  for (let i = 0; i + window <= r.length; i++) {
    const run = r.slice(i, i + window);
    if (runs.has(run)) return run;
  }
  return undefined;
}
