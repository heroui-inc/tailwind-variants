import type {UserConfig} from "@commitlint/types";
import {RuleConfigSeverity} from "@commitlint/types";

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  helpUrl:
    "https://github.com/heroui-inc/tailwind-variants/blob/main/CONTRIBUTING.md#commit-convention",
  rules: {
    "type-enum": [
      RuleConfigSeverity.Error,
      "always",
      ["feat", "feature", "fix", "refactor", "docs", "build", "test", "ci", "chore"],
    ],
  },
};

export default config;
