import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SKILL_ALIASES, casesWithoutRubric, contentDir, loadCases, loadPrompts, parseCase, rubricForPrompt, rubricProblems, rubricSkillIds, stripComments } from "../src/content.js";

const rawRubric = fs.readFileSync(path.join(contentDir(), "rubrics/cbt.md"), "utf8");
const rubric = loadPrompts().rubrics.cbt;

describe("the CBT rubric", () => {
  const ids = rubricSkillIds(rawRubric);

  it("passes the shared rubric checks (the same ones the admin's publish runs)", () => {
    expect(rubricProblems("cbt", rawRubric)).toEqual([]);
  });

  it("every bundled case has a rubric for its school", () => {
    expect(casesWithoutRubric(loadCases(), loadPrompts().rubrics)).toEqual([]);
  });

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

describe("live supervision has no harm category", () => {
  // Harmful remarks are judged in the full report only; live notes kept mistaking lecturing for harm.
  const { supervisorLive, supervisor } = loadPrompts();
  it("has no harm item, template or definition", () => {
    for (const term of ["伤害性的话", "会伤到来访者，真实会谈里", "would hurt the client", "might simply leave", "指责受害者"]) {
      expect(supervisorLive).not.toContain(term);
    }
    expect(supervisorLive).toContain("**不说咨询师的话会伤到来访者，也不说来访者会离开。**");
  });
  it("the full report still judges harmful remarks", () => {
    expect(supervisor).toContain("伤害性的话");
    expect(supervisor).toContain("指责受害者");
  });
});

describe("rubricProblems", () => {
  const ok = "---\nid: cbt\nschool: cbt\n---\n## 要看的点\n\n### 1. 风险\n- 技能 id：risk_screening\n\n### 2. 议程\n- 技能 id：agenda_setting\n";
  it("accepts a good rubric", () => expect(rubricProblems("cbt", ok)).toEqual([]));
  it("finds each problem", () => {
    const paths = (raw: string, id = "cbt") => rubricProblems(id, raw).map((p) => p.path);
    expect(paths(ok, "dbt")).toContain("id");
    expect(paths(ok.replace("id: cbt", "id: x"))).toEqual(["frontmatter.id"]);
    expect(paths(ok.replace("agenda_setting", "risk_screening"))).toEqual(["body"]);
    expect(paths(ok.replace("risk_screening", "rapport"))).toEqual(["body"]);
    expect(paths(ok.replace("- 技能 id：agenda_setting\n", ""))).toEqual(["body"]);
    expect(paths(ok + "<!-- open")).toEqual(["body"]);
    expect(paths("no frontmatter")).toEqual(["source"]);
  });
  it("counts an alias as the id it stands for", () => {
    expect(rubricProblems("cbt", ok.replace("risk_screening", "initial_assessment_and_safety"))).toEqual([]);
  });
});
