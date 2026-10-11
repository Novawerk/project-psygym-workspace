// Two languages, as a path prefix: /zh/… and /en/…. The bare paths ("/", "/privacy",
// "/delete-account") send the browser to the language it prefers: Chinese for zh*, else English.
export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const strings = {
  zh: {
    htmlLang: "zh-CN",
    siteName: "聆镜 PSYGYM",
    tagline: "给新手心理咨询师的练习工具。",
    home: "首页",
    privacy: "隐私政策",
    deleteAccount: "删除账号",
    otherLanguage: "English",
    footer: "聆镜 PSYGYM 是 Novawerk 的开源项目。这是练习工具，不是心理治疗。",
    comingSoon: "首页正在设计中。",
  },
  en: {
    htmlLang: "en",
    siteName: "PSYGYM",
    tagline: "A practice tool for new counselors.",
    home: "Home",
    privacy: "Privacy policy",
    deleteAccount: "Delete account",
    otherLanguage: "中文",
    footer: "PSYGYM is an open-source Novawerk project. It is a practice tool, not therapy.",
    comingSoon: "The home page is being designed.",
  },
} satisfies Record<Locale, Record<string, string>>;

export const other = (l: Locale): Locale => (l === "zh" ? "en" : "zh");
