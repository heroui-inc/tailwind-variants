export const utilityScenarioMetadata = [
  {
    id: "utilities/join-mixed",
    category: "join",
    name: "Join mixed values (cx / clsx)",
    description: "Strings, arrays, nested arrays, objects, and nullish values.",
    implementations: ["tv-utils", "cnfast"],
  },
  {
    id: "utilities/join-tokens",
    category: "join",
    name: "Join string tokens (cx / twJoin)",
    description:
      "Restricted join of string/falsy tokens (no objects). Same output as twJoin; cx remains the general join API.",
    implementations: ["tv-utils", "cnfast"],
  },
  {
    id: "utilities/merge",
    category: "merge",
    name: "Join and merge (cn / cn)",
    description: "Join mixed values then resolve Tailwind conflicts.",
    implementations: ["tv-utils", "cnfast"],
  },
  {
    id: "utilities/cn-merge",
    category: "merge",
    name: "Curried merge (cnMerge / —)",
    description: "TV cnMerge closure with Tailwind Merge enabled; cnfast has no equivalent.",
    implementations: ["tv-utils"],
  },
  {
    id: "utilities/tw-merge",
    category: "merge",
    name: "Direct merge (— / twMerge)",
    description: "cnfast twMerge on class tokens; TV has no public equivalent.",
    implementations: ["cnfast"],
  },
];

export const utilityScenarioMetadataById = new Map(
  utilityScenarioMetadata.map((scenario) => [scenario.id, scenario]),
);
