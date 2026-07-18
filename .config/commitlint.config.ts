import type {UserConfig} from "@commitlint/types";
import {RuleConfigSeverity} from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  helpUrl:
    "https://github.com/jrgarciadev/tailwind-variants/blob/main/CONTRIBUTING.MD#commit-convention",
  rules: {
    "type-enum": [
      RuleConfigSeverity.Error,
      "always",
      ["feat", "feature", "fix", "refactor", "docs", "build", "test", "ci", "chore"],
    ],
  },
};

export default config;
