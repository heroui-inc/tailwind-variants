const scenarioMetadata = [
  {
    id: "construction/no-slots",
    category: "construction",
    name: "Create (no slots)",
    description: "One-time factory cost; the returned component is retained.",
    implementations: ["tv", "cva"],
  },
  {
    id: "lifecycle/no-slots",
    category: "lifecycle",
    name: "Create + call (no slots)",
    description: "Factory cost plus the first call with default variants.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/defaults",
    category: "invocation",
    name: "Invoke defaults",
    description: "A pre-created component called once with default variants.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/variants",
    category: "invocation",
    name: "Invoke matrix",
    description: "A batch of five calls covering defaults, booleans, arrays, and compounds.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/hot-same-props",
    category: "invocation",
    name: "Invoke hot",
    description:
      "A pre-created component called with one stable props object every time; the props cache should serve every call.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/hot-fresh-classname",
    category: "invocation",
    name: "Invoke hot + new className",
    description:
      "One stable variant selection plus a className that is a new string instance with identical text every call, the React render shape. Should sit near the override-merge cost, not near the SSR row.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/unique-classname",
    category: "invocation",
    name: "Invoke SSR (unique className)",
    description:
      "The five-call batch with a never-repeating className each call, so every merge is a first sighting.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/compounds-heavy",
    category: "invocation",
    name: "Invoke compound-heavy",
    description:
      "Five-call batch on a recipe with three axes and twelve compound variants, several matching per call.",
    implementations: ["tv", "cva"],
  },
  {
    id: "invocation/lite-inject",
    category: "invocation",
    name: "Invoke lite + injected twMerge",
    description:
      "The lite entry with this build's own twMerge injected, five-call batch. Skipped for builds whose lite entry does not call the injected function.",
    implementations: ["tv"],
    requiresCapabilities: ["liteInject"],
  },
  {
    id: "invocation/variants-no-merge",
    category: "invocation",
    name: "Invoke matrix, no merge",
    description: "The same five-call batch with Tailwind Merge disabled.",
    implementations: ["tv", "cva"],
  },
  {
    id: "utilities/cx",
    category: "utilities",
    name: "Join mixed (cx)",
    description: "Strings, arrays, nested arrays, objects, and nullish values.",
    implementations: ["tv", "cva"],
  },
  {
    id: "construction/slots",
    category: "construction",
    name: "Create (slots)",
    description: "TV-only one-time setup for variants, compounds, and three slots.",
    implementations: ["tv"],
  },
  {
    id: "lifecycle/slots",
    category: "lifecycle",
    name: "Create + call (slots)",
    description: "TV-only factory cost plus one invocation of all three slots.",
    implementations: ["tv"],
  },
  {
    id: "invocation/slots",
    category: "invocation",
    name: "Invoke slots matrix",
    description: "TV-only five-call batch invoking base, icon, and label.",
    implementations: ["tv"],
  },
  {
    id: "invocation/slots-hot",
    category: "invocation",
    name: "Invoke slots hot",
    description:
      "TV-only parent call with one stable props object, then base, icon, and label with no slot props.",
    implementations: ["tv"],
  },
  {
    id: "invocation/slots-no-merge",
    category: "invocation",
    name: "Invoke slots, no merge",
    description: "TV-only slots batch with Tailwind Merge disabled.",
    implementations: ["tv"],
  },
  {
    id: "composition/extend",
    category: "composition",
    name: "Extend + call",
    description: "TV-only lifecycle for a two-level component composition.",
    implementations: ["tv"],
  },
  {
    id: "composition/extend-multi",
    category: "composition",
    name: "Multi-extend + call",
    description:
      "Lifecycle for three independent mixins via extend: [a, b, c]. Implementations are skipped when they lack array-extend support.",
    implementations: ["tv"],
    requiresCapabilities: ["arrayExtend"],
  },
  {
    id: "construction/extend-multi",
    category: "construction",
    name: "Create multi-extend",
    description: "Definition-time cost of composing three mixins. Invocation is not timed.",
    implementations: ["tv"],
    requiresCapabilities: ["arrayExtend"],
  },
  {
    id: "invocation/extend-multi",
    category: "invocation",
    name: "Invoke multi-extend",
    description:
      "Pre-created multi-parent recipe; five-call batch. Hot path should match single-parent extend.",
    implementations: ["tv"],
    requiresCapabilities: ["arrayExtend"],
  },
  {
    id: "utilities/cn-merge",
    category: "utilities",
    name: "Merge pre-bound",
    description: "TV-only public cnMerge closure with Tailwind Merge enabled.",
    implementations: ["tv"],
  },
  {
    id: "invocation/custom-merge",
    category: "invocation",
    name: "Invoke + custom config",
    description: "TV-only variant matrix using custom spacing and font-size groups.",
    implementations: ["tv"],
  },
];

export const scenarioMetadataById = new Map(
  scenarioMetadata.map((scenario) => [scenario.id, scenario]),
);
