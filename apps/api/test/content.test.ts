import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SKILL_ALIASES, contentDir, loadCases, loadPrompts, parseCase, rubricForPrompt, rubricSkillIds, stripComments } from "../src/content.js";

const rawRubric = fs.readFileSync(path.join(contentDir(), "rubrics/cbt.md"), "utf8");
const rubric = loadPrompts().rubrics.cbt;

describe("the CBT rubric", () => {
  const ids = rubricSkillIds(rawRubric);

  it("gives every point a skill id", () => {
    const points = rawRubric.match(/^### \d+\./gm) ?? [];
    expect(points.length).toBeGreaterThan(0);
    expect(ids).toHaveLength(points.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it("has no skill id twice", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has risk_screening, after the aliases", () => {
    expect(ids).toContain("risk_screening");
  });

  it("the supervisor sees only our ids, never an alias", () => {
    expect(rubricSkillIds(rubric)).toEqual(ids);
    for (const alias of Object.keys(SKILL_ALIASES)) expect(rubric).not.toContain(alias);
  });

  it("is sent without frontmatter, comments or the report-structure section", () => {
    expect(rubric.startsWith("## ")).toBe(true);
    expect(rubric).not.toMatch(/^id: cbt$/m);
    expect(rubric).not.toContain("<!--");
    expect(rubric).not.toContain("-->");
    expect(rubric).not.toContain("## 报告结构");
    expect(rubric).toContain("## 要看的点");
    expect(rubric).toContain("## 安全相关");
  });
});

describe("rubricForPrompt", () => {
  it("drops only the report-structure section and keeps the rest in order", () => {
    const raw = "---\nid: x\n---\n\n## A\n- 技能 id：initial_assessment_and_safety\n\n## 报告结构\n400–600 字\n\n## B\n<!-- note -->\nb";
    expect(rubricForPrompt(raw)).toBe("## A\n- 技能 id：risk_screening\n\n## B\n\nb");
  });
});

describe("case briefs", () => {
  it("never carry HTML comments to the model", () => {
    for (const c of loadCases().values()) {
      expect(c.brief, c.id).not.toContain("<!--");
      expect(c.brief, c.id).not.toContain("-->");
    }
  });

  it("stripComments removes multi-line notes", () => {
    expect(stripComments("a\n<!-- one\ntwo -->\n\n\nb")).toBe("a\n\nb");
  });

  it("an unclosed comment fails the load, naming the file", () => {
    expect(() => stripComments("a <!-- never closed\nb")).toThrow("unclosed HTML comment");
    expect(() => stripComments("a --> b")).toThrow("unclosed HTML comment");
    const raw = "---\nid: x-1\nschool: cbt\ntitle: { zh: 标题 }\nsummary: { zh: 简介 }\n---\n正文 <!-- 没闭合\n";
    expect(() => parseCase("x-1.md", raw, () => {})).toThrow("x-1.md: unclosed HTML comment");
  });
});

describe("harm: the AI client and live supervision use one standard", () => {
  const { client, supervisorLive } = loadPrompts();
  it.each(["贬低", "嘲讽", "不耐烦", "矫情", "更惨的人", "否定", "来咨询的理由", "性骚扰", "歧视", "拒绝细说", "指责受害者"])(
    "both name %s",
    (term) => {
      expect(client).toContain(term);
      expect(supervisorLive).toContain(term);
    },
  );
  it.each(["复述", "正常化", "说教", "温和地问起创伤经历", "主动收尾"])("both list %s as not harm", (term) => {
    expect(client).toContain(term);
    expect(supervisorLive).toContain(term);
  });
});
