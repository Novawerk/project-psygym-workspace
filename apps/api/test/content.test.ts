import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SKILL_ALIASES, contentDir, loadCases, loadPrompts, rubricForPrompt, rubricSkillIds, stripComments } from "../src/content.js";

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
    for (const c of loadCases().values()) expect(c.brief, c.id).not.toContain("<!--");
  });

  it("stripComments removes multi-line notes", () => {
    expect(stripComments("a\n<!-- one\ntwo -->\n\n\nb")).toBe("a\n\nb");
  });
});
