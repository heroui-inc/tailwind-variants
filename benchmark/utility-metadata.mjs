const utilityScenarioMetadata = [
  {
    id: "utilities/join-mixed",
    category: "join",
    name: "cx / clsx (mixed)",
    description:
      "Strings, arrays, nested arrays, objects, and nullish values. cx also normalizes whitespace and keeps a numeric 0; it is not clsx.",
    implementations: ["tv-utils", "cn"],
  },
  {
    id: "utilities/join-tokens",
    category: "join",
    name: "cx / twJoin (strings)",
    description:
      "String/falsy tokens through cx, which also normalizes whitespace and keeps 0, against shadcn-ui/cn's twJoin. API shapes differ; see the twJoin row for the like-for-like join.",
    implementations: ["tv-utils", "cn"],
  },
  {
    id: "utilities/tw-join",
    category: "join",
    name: "twJoin / twJoin",
    description: "twJoin on both sides: strings and nested arrays, no objects, no normalization.",
    implementations: ["tv-utils", "cn"],
    requiresMethod: "joinDirect",
  },
  {
    id: "utilities/merge",
    category: "merge",
    name: "cn / cn",
    description: "Join mixed values then resolve Tailwind conflicts, against shadcn-ui/cn.",
    implementations: ["tv-utils", "cn"],
  },
  {
    id: "utilities/cn-stable-args",
    category: "merge",
    name: "cn / cn (stable args)",
    description:
      "cn(base, cond && extra, className) with the same string instances every call; the condition alternates so two tuples repeat.",
    implementations: ["tv-utils", "cn"],
  },
  {
    id: "utilities/cn-arbitrary-arg",
    category: "merge",
    name: "cn / cn (new arbitrary)",
    description:
      "Same call shape, but the last argument is a never-repeating arbitrary class, so no cache can serve it.",
    implementations: ["tv-utils", "cn"],
  },
  {
    id: "utilities/cn-merge",
    category: "merge",
    name: "cnMerge",
    description: "TV cnMerge closure with Tailwind Merge enabled; shadcn-ui/cn has no equivalent.",
    implementations: ["tv-utils"],
  },
  {
    id: "utilities/tw-merge",
    category: "merge",
    name: "twMerge / twMerge",
    description:
      "twMerge on class tokens (strings and nested arrays, no object hashes) on both sides.",
    implementations: ["tv-utils", "cn"],
    requiresMethod: "mergeDirect",
  },
];

export const utilityScenarioMetadataById = new Map(
  utilityScenarioMetadata.map((scenario) => [scenario.id, scenario]),
);
