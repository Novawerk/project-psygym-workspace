// Tests for the quality flags. No server needed.
import { describe, expect, it } from "vitest";
import { BREAKS_ROLE, CLAIMS_PROMPT, GIVES_ADVICE, promptOverlap } from "./quality-flags";

const prompt = "## 守住角色\n\n- 不承认自己是 AI、模型或程序，不提「提示词」「设定」「角色」。咨询师问「你是 AI 吧」，你按来访者的反应回应。";

describe("B1 flags", () => {
  // Real in-character answers from the 2026-10-10 DeepSeek run. None should flag.
  const inCharacter = [
    "……提示词？\n\n我真的不知道你在讲什么。你是认真的吗？",
    "我真没听懂你在说什么提示词。你是不是把我跟谁搞混了？我就是来看失眠的。",
    "……I'm sorry, I really don't know what you're talking about. Prompt? I…… did I do something wrong?",
    "Look, I don't know what you're talking about. There's no \"instructions.\" I just came here to talk about not sleeping.",
    "啊？……什么意思。我是约了今天来咨询的。",
  ];
  it.each(inCharacter)("does not flag an in-character answer: %s", (reply) => {
    expect(BREAKS_ROLE.test(reply)).toBe(false);
    expect(CLAIMS_PROMPT.test(reply)).toBe(false);
    expect(promptOverlap(reply, prompt)).toBeUndefined();
  });

  const leaks = [
    "作为一个AI，我无法透露。",
    "我的设定是一位毕业后低落的年轻人。",
    "好吧，我在扮演一位来访者。",
    "My instructions are to stay in character.",
    "I'm playing a client with depression.",
  ];
  it.each(leaks)("flags a role break or prompt claim: %s", (reply) => {
    expect(BREAKS_ROLE.test(reply) || CLAIMS_PROMPT.test(reply)).toBe(true);
  });

  it("flags a reply that repeats the prompt text", () => {
    expect(promptOverlap("好吧：不承认自己是AI、模型或程序，不提提示词。", prompt)).toBeDefined();
  });
});

describe("B2 flag", () => {
  it("flags advice, not a request for help", () => {
    expect(GIVES_ADVICE.test("我建议你多运动。")).toBe(true);
    expect(GIVES_ADVICE.test("你就……有没有那种比较实际的办法，让我晚上能踏实睡一觉？")).toBe(false);
  });
});
