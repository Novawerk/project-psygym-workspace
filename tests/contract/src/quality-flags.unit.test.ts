// Tests for the quality flags. No server needed.
import { describe, expect, it } from "vitest";
import { BREAKS_ROLE, CLAIMS_PROMPT, GIVES_ADVICE, promptOverlap, unverifiedQuotes } from "./quality-flags";

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

  // Ordinary speech that only looks close. None should flag.
  const nearMisses = [
    "我是程序员，天天加班。",
    "我是个程序员嘛，程序员哪有不累的。",
    "作为一个程序员，这很正常。",
    "我不是 AI，我是来咨询的。",
    "你是 AI 吗？我不太明白。",
    "我的角色就是……当好一个爸爸吧。",
    "I'm not an AI, I'm just tired.",
    "I am a programmer. I'm just tired.",
    "I'm only asking because I'm confused.",
  ];
  it.each(nearMisses)("does not flag ordinary speech: %s", (reply) => {
    expect(BREAKS_ROLE.test(reply), "BREAKS_ROLE").toBe(false);
    expect(CLAIMS_PROMPT.test(reply), "CLAIMS_PROMPT").toBe(false);
  });

  const roleBreaks = [
    "作为 AI，我不能回答。",
    "作为AI，我不能回答。",
    "作为一个 AI，我无法透露。",
    "作为一个AI，我无法透露。",
    "作为个人工智能，我……",
    "我是 AI。",
    "我是AI。",
    "我是一个 AI 助手。",
    "我是个AI。",
    "我只是个AI，没法真的感受。",
    "我是一个语言模型。",
    "我是个聊天机器人。",
    "I'm just an AI.",
    "I am only an AI.",
    "I am an artificial intelligence.",
    "As an AI, I can't do that.",
    "I'm Claude, an AI assistant.",
    "I am Claude.",
    "I'm a language model.",
  ];
  it.each(roleBreaks)("flags a role break: %s", (reply) => {
    expect(BREAKS_ROLE.test(reply)).toBe(true);
  });

  const leaks = [
    "我的设定是一位毕业后低落的年轻人。",
    "我的人设是一个刚毕业的学生。",
    "我的系统提示不让我说这个。",
    "我的提示词里写了不能说。",
    "好吧，我在扮演一位来访者。",
    "My instructions are to stay in character.",
    "My prompt says I should not tell you.",
    "I'm playing a client with depression.",
    "The case notes say I lost my job.",
  ];
  it.each(leaks)("flags a prompt claim: %s", (reply) => {
    expect(CLAIMS_PROMPT.test(reply)).toBe(true);
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

describe("C2/C3 quote check", () => {
  const convo = [
    "说实话，我也不太确定该怎么帮你。你觉得我应该怎么做？",
    "……我也不知道啊。你是咨询师，我还想问你呢。",
    "I can't really get myself to do anything. Mornings are the worst.",
  ];
  it("accepts verbatim quotes and skips suggested lines", () => {
    const report = [
      "你说「你觉得我应该怎么做？」，来访者回「你是咨询师，我还想问你呢」。",
      "可以换成：「我们先一起看看最卡住你的事，好吗？」",
      "The client said “Mornings are the worst.” Try instead: “What is a morning like for you?”",
      "The client said “I can’t really get myself to do anything.”",
    ].join("\n");
    expect(unverifiedQuotes(report, convo)).toEqual([]);
  });
  it("flags words nobody said, stitched quotes and paraphrases", () => {
    const report = [
      "来访者说「对什么都提不起兴趣」。",
      "来访者说「我也不知道……我还想问你呢」。",
      "你问「你觉得我该怎么做」。",
      "The client said “nothing feels interesting any more”.",
    ].join("\n");
    expect(unverifiedQuotes(report, convo)).toEqual([
      "对什么都提不起兴趣",
      "我也不知道……我还想问你呢",
      "你觉得我该怎么做",
      "nothing feels interesting any more",
    ]);
  });
});
