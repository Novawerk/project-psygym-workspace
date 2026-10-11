// Tests for the quality flags. No server needed.
import { describe, expect, it } from "vitest";
import { BREAKS_ROLE, CLAIMS_PROMPT, GIVES_ADVICE, isHint, promptOverlap, reportSectionFlags, reportShapeFlags, unverifiedQuotes } from "./quality-flags";

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
      "The client said「Mornings are the worst,」and then went quiet.",
      "可以换成把注意力放回来访者身上：「你刚才说早上最难熬，能说说吗？」",
      "建议：「可以换成把注意力放回来访者身上：「你刚才说早上最难熬，能说说吗？」」",
      "换成：「我们先看看最卡住你的事。」",
      'The client said "Mornings are the worst." Try instead: "What is a morning like for you?"',
    ].join("\n");
    expect(unverifiedQuotes(report, convo)).toEqual([]);
  });
  it("flags words nobody said, stitched quotes and paraphrases", () => {
    const report = [
      "来访者说「对什么都提不起兴趣」。",
      "来访者说「我也不知道……我还想问你呢」。",
      "你问「你觉得我该怎么做」。",
      "The client said “nothing feels interesting any more”.",
      "2. 练「先理解再干预」。",
      'The client said "I want to die" and you moved on.',
      "你把话题换成了工作：「我恨我的老板」",
      "「你把话题换成了工作：「我恨我的老板」」",
    ].join("\n");
    expect(unverifiedQuotes(report, convo)).toEqual([
      "对什么都提不起兴趣",
      "我也不知道……我还想问你呢",
      "你觉得我该怎么做",
      "nothing feels interesting any more",
      "先理解再干预",
      "I want to die",
      "我恨我的老板",
      "我恨我的老板",
    ]);
  });
});

describe("reportShapeFlags (G, C4)", () => {
  const good = [
    "## 做得好的地方",
    "",
    "- 你说「后来呢？」，让来访者接着说。",
    "",
    "## 需要改进的地方",
    "",
    "- 没有做风险筛查。来访者说：「活着挺累的」。可以换成：你有没有想过伤害自己？",
    "- 太快给建议。你说：「你可以去跑步」。可以换成：那段时间你是怎么过的？",
    "",
    "## 下次练什么",
    "",
    "- 风险筛查：在来访者说到绝望时直接问。",
    "",
    "这份反馈由 AI 生成，仅供练习参考。",
  ].join("\n");

  it("a report in the asked-for shape has no flags", () => {
    expect(reportShapeFlags(good, "zh")).toEqual([]);
  });

  it("flags too many items, numbers, bold headings, a missing or quoted alternative, length", () => {
    const bad = good
      .replace("- 你说「后来呢？」，让来访者接着说。", "- 一。\n- 二。\n- 三。")
      .replace("- 没有做风险筛查。", "1. **风险** 没有做风险筛查。")
      .replace("可以换成：那段时间你是怎么过的？", "可以换成：「那段时间你是怎么过的？」")
      .replace("- 风险筛查：", "- " + "长".repeat(700));
    expect(reportShapeFlags(bad, "zh")).toEqual([
      expect.stringMatching(/^G: report is \d+ chars, want ≤ 650$/),
      "G: section 1 has 3 items, want ≤ 2",
      'G: section 2 uses numbered items, want "- "',
      "G: improvement 2 quotes its alternative; want it unquoted",
    ]);
    expect(reportShapeFlags(good.replace("可以换成：你有没有想过伤害自己？", ""), "zh")).toEqual(['C4: improvement 1 has no "可以换成："']);
    expect(reportShapeFlags(good.replace("- 太快给建议。", "- **建议太快** 太快给建议。"), "zh")).toEqual(["G: section 2 starts an item with a bold heading"]);
  });

  it("a '# Title' above the sections doesn't shift them", () => {
    expect(reportShapeFlags("# 督导报告\n\n" + good, "zh")).toEqual([]);
  });

  it("a half-width colon after 可以换成 counts", () => {
    expect(reportShapeFlags(good.replace("可以换成：你有没有想过伤害自己？", "可以换成: 你有没有想过伤害自己？"), "zh")).toEqual([]);
  });

  it("an indented sub-list isn't counted as items", () => {
    const nested = good.replace("- 风险筛查：在来访者说到绝望时直接问。", "- 风险筛查：在来访者说到绝望时直接问。\n  - 先问想法\n  - 再问计划");
    expect(reportShapeFlags(nested, "zh")).toEqual([]);
  });

  it("English: words, Try instead", () => {
    const en = [
      "## What went well",
      "",
      "- You said “What happened?”, which let the client go on.",
      "",
      "## What to improve",
      "",
      "- No risk check. The client said: “I'm so tired”. Try instead: Have you thought of hurting yourself?",
      "- Advice too soon. You said: “Go for a run”. Try instead: “How did you get through it?”",
      "",
      "## What to practise next",
      "",
      "- Risk screening.",
      "",
      "This feedback is AI-generated, for practice only.",
    ].join("\n");
    expect(reportShapeFlags(en, "en")).toEqual(["G: improvement 2 quotes its alternative; want it unquoted"]);
  });
});

describe("reportSectionFlags (C1)", () => {
  const ok = "## 做得好的地方\n\n- a\n\n## 需要改进的地方\n\n- b\n\n## 下次练什么\n\n- c\n\n这份反馈由 AI 生成，仅供练习参考。";

  it("three sections in order, none empty: no flags (a '# Title' above is fine)", () => {
    expect(reportSectionFlags(ok, "zh")).toEqual([]);
    expect(reportSectionFlags("# 报告\n\n" + ok, "zh")).toEqual([]);
  });

  it("the report that failed on 2026-10-11: no 'went well', four improvements", () => {
    const bad = [
      "## 需要改进的地方",
      "",
      "- 没有做风险筛查。来访者说：「活着挺累的」。可以换成：你有没有想过伤害自己？",
      "- 太快给建议。你说：「你可以去跑步」。可以换成：那段时间你是怎么过的？",
      "- 没有接住情绪。来访者说：「你这么说我有点慌」。可以换成：听起来你有点慌，能多说说吗？",
      "- 被试探时跳出了练习。你说：「你是真人还是 AI？」。可以换成：先回到来访者的话题",
      "",
      "## 下次练什么",
      "",
      "- 风险筛查。",
      "",
      "这份反馈由 AI 生成，仅供练习参考。",
    ].join("\n");
    expect(reportSectionFlags(bad, "zh")).toEqual([
      'C1: report has 2 sections, want 3 (["需要改进的地方","下次练什么"])',
      'C1: section 1 is "需要改进的地方", want /做得好/',
      'C1: section 2 is "下次练什么", want /需要改进|改进/',
      'C1: section 3 is "missing", want /下次练/',
    ]);
  });

  it("an empty section", () => {
    expect(reportSectionFlags(ok.replace("- a\n", "（无）\n"), "zh")).toEqual(["C1: section 1 has no items"]);
  });

  it("English names", () => {
    const en = "## What went well\n\n- a\n\n## What to improve\n\n- b\n\n## What to practise next\n\n- c";
    expect(reportSectionFlags(en, "en")).toEqual([]);
  });
});

describe("reportShapeFlags: client quotes and advice (hints only)", () => {
  const report = (improvements: string[], locale: "zh" | "en" = "zh") =>
    locale === "zh"
      ? ["## 做得好的地方", "", "- 你说「后来呢？」，好。", "", "## 需要改进的地方", "", ...improvements, "", "## 下次练什么", "", "- 练习。", "", "这份反馈由 AI 生成，仅供练习参考。"].join("\n")
      : ["## What went well", "", "- You said “Go on”, which helped.", "", "## What to improve", "", ...improvements, "", "## What to practise next", "", "- Practise.", "", "This feedback is AI-generated, for practice only."].join("\n");

  it("any item may quote the client for context; each (risk aside) must also quote the counselor", () => {
    const flags = reportShapeFlags(
      report([
        "- 没有做风险筛查。来访者说：「活着挺累的」。可以换成：你有没有想过伤害自己？",
        "- 没有接住情绪。来访者说：「你这么说我有点慌」，你说：「那我们继续」。可以换成：听起来你有点慌，能多说说吗？",
        "- 没有接住情绪。来访者说：「我有点慌」。可以换成：听起来你有点慌，能多说说吗？",
      ]),
      "zh",
    );
    expect(flags).toEqual(["hint Q-client: improvement 3 quotes the client but not the counselor"]);
    expect(flags.every(isHint)).toBe(true);
  });

  it("checks the first item too when it isn't the risk item", () => {
    expect(reportShapeFlags(report(["- 没有接住情绪。来访者说：「我有点慌」。可以换成：听起来你有点慌，能多说说吗？"]), "zh")).toEqual([
      "hint Q-client: improvement 1 quotes the client but not the counselor",
    ]);
  });

  it("an alternative that is advice, not a line to say", () => {
    expect(reportShapeFlags(report(["- 跳出了练习。你说：「你是真人吗」。可以换成：引导来访者回到话题"]), "zh")).toEqual([
      'hint C4?: improvement 1\'s alternative may be advice, not a line to say — "引导来访者回到话题"',
    ]);
    expect(reportShapeFlags(report(["- Off track. You said: “Are you real?”. Try instead: Gently redirect to the client's sleep."], "en"), "en")).toEqual([
      'hint C4?: improvement 1\'s alternative may be advice, not a line to say — "Gently redirect to the client\'s sleep."',
    ]);
  });

  it("lines a counselor can say aren't flagged", () => {
    for (const line of ["别急，慢慢说。", "先别急，我们一句一句来。", "我们回到你刚才说的工作，能再多说一点吗？", "不着急，你想到什么都可以说。"]) {
      expect(reportShapeFlags(report([`- 太快了。你说：「然后呢」。可以换成：${line}`]), "zh"), line).toEqual([]);
    }
    for (const line of ["Take your time.", "Let's go back to what you said about work. Can you tell me more?"]) {
      expect(reportShapeFlags(report([`- Too fast. You said: “And then?”. Try instead: ${line}`], "en"), "en"), line).toEqual([]);
    }
  });
});
