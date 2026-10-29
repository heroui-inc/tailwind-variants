import {extendTailwindMerge} from "tailwind-merge";

import {scenarioMetadataById} from "./metadata.mjs";
import {
  animatedConfig,
  buttonConfig,
  buttonProps,
  classInputs,
  compoundHeavyConfig,
  compoundHeavyProps,
  customButtonConfig,
  customMergeConfig,
  focusableConfig,
  hotButtonProps,
  hotClassNameText,
  hotSlotsProps,
  multiExtendChildConfig,
  multiExtendProps,
  slotsConfig,
  slotsProps,
  surfacedConfig,
} from "./workloads.mjs";
import assert from "node:assert/strict";

const metadata = (id) => {
  const value = scenarioMetadataById.get(id);

  if (!value) throw new TypeError(`Missing benchmark metadata for ${id}.`);

  return value;
};

let sink;
let currentCustomMergeOutput;

const consume = (value) => {
  sink = value;
};

const callButtonBatch = (adapter, component) => {
  for (let i = 0; i < buttonProps.length; i++) {
    consume(adapter.invoke(component, buttonProps[i]));
  }
};

const callSlotsBatch = (component) => {
  for (let i = 0; i < slotsProps.length; i++) {
    const slots = component(slotsProps[i]);

    consume(slots.base());
    consume(slots.icon());
    consume(slots.label());
  }
};

// Same five props, each carrying a className no earlier call has seen.
const callUniqueClassNameBatch = (adapter, component, counter) => {
  for (let i = 0; i < buttonProps.length; i++) {
    consume(adapter.invoke(component, {...buttonProps[i], className: `w-[${counter.next++}px]`}));
  }
};

const callMultiExtendBatch = (adapter, component) => {
  for (let i = 0; i < multiExtendProps.length; i++) {
    consume(adapter.invoke(component, multiExtendProps[i]));
  }
};

// Compose three independent mixins via array extend. Only implementations that
// expose the `arrayExtend` capability (probed at load time) run these
// scenarios, so the released branch that used an equivalent single-extend
// chain is no longer needed — a released version gains the baseline as soon as
// it actually supports the API.
const createMultiExtended = (adapter, options) => {
  const focusable = adapter.create(focusableConfig, options);
  const animated = adapter.create(animatedConfig, options);
  const surfaced = adapter.create(surfacedConfig, options);

  return adapter.create(
    {
      extend: [focusable, animated, surfaced],
      ...multiExtendChildConfig,
    },
    options,
  );
};

// V8 inline caches go megamorphic once a `tv` has seen many config shapes.
// Capability-gated scenarios would feed the multi-extend shapes to one module
// only, leaving the other in a faster state, so every TV adapter is warmed
// with the same shapes up front (single-parent extend where arrays are
// unsupported).
export const equalizeConfigShapeExposure = (adapters) => {
  const options = {twMerge: false};

  for (const adapter of adapters) {
    if (adapter.kind !== "tv") continue;

    for (let i = 0; i < 50; i++) {
      const focusable = adapter.create(focusableConfig, options);
      const animated = adapter.create(animatedConfig, options);
      const surfaced = adapter.create(surfacedConfig, options);
      const extend = adapter.capabilities?.arrayExtend
        ? [focusable, animated, surfaced]
        : focusable;
      const child = adapter.create({extend, ...multiExtendChildConfig}, options);

      adapter.invoke(child, {size: "sm"});
    }
  }
};

export const scenarios = [
  {
    ...metadata("construction/no-slots"),
    createTask(adapter) {
      const create = adapter.prepare(buttonConfig, {twMerge: false});

      return () => consume(create());
    },
  },
  {
    ...metadata("lifecycle/no-slots"),
    createTask(adapter) {
      const create = adapter.prepare(buttonConfig);

      return () => {
        const component = create();

        consume(adapter.invoke(component, {}));
      };
    },
  },
  {
    ...metadata("invocation/defaults"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig)();

      return () => consume(adapter.invoke(component, {}));
    },
  },
  {
    ...metadata("invocation/variants"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig)();

      return () => callButtonBatch(adapter, component);
    },
  },
  {
    ...metadata("invocation/hot-same-props"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig)();

      return () => consume(adapter.invoke(component, hotButtonProps));
    },
  },
  {
    ...metadata("invocation/hot-fresh-classname"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig)();
      const {intent, size, disabled} = hotButtonProps;

      return () =>
        consume(
          adapter.invoke(component, {
            intent,
            size,
            disabled,
            // slice() of a longer string yields a new instance with the same text
            className: `x${hotClassNameText}`.slice(1),
          }),
        );
    },
  },
  {
    ...metadata("invocation/unique-classname"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig)();
      const counter = {next: 0};

      return () => callUniqueClassNameBatch(adapter, component, counter);
    },
  },
  {
    ...metadata("invocation/compounds-heavy"),
    createTask(adapter) {
      const component = adapter.prepare(compoundHeavyConfig)();

      return () => {
        for (let i = 0; i < compoundHeavyProps.length; i++) {
          consume(adapter.invoke(component, compoundHeavyProps[i]));
        }
      };
    },
  },
  {
    ...metadata("invocation/lite-inject"),
    createTask(adapter) {
      const component = adapter.createLite(buttonConfig);

      return () => callButtonBatch(adapter, component);
    },
  },
  {
    ...metadata("invocation/variants-no-merge"),
    createTask(adapter) {
      const component = adapter.prepare(buttonConfig, {twMerge: false})();

      return () => callButtonBatch(adapter, component);
    },
  },
  {
    ...metadata("utilities/cx"),
    createTask(adapter) {
      return () => consume(adapter.join(classInputs));
    },
  },
  {
    ...metadata("construction/slots"),
    createTask(adapter) {
      return () => consume(adapter.createSlots(slotsConfig, {twMerge: false}));
    },
  },
  {
    ...metadata("lifecycle/slots"),
    createTask(adapter) {
      return () => {
        const component = adapter.createSlots(slotsConfig);
        const slots = component({});

        consume(slots.base());
        consume(slots.icon());
        consume(slots.label());
      };
    },
  },
  {
    ...metadata("invocation/slots"),
    createTask(adapter) {
      const component = adapter.createSlots(slotsConfig);

      return () => callSlotsBatch(component);
    },
  },
  {
    ...metadata("invocation/slots-hot"),
    createTask(adapter) {
      const component = adapter.createSlots(slotsConfig);

      return () => {
        const slots = component(hotSlotsProps);

        consume(slots.base());
        consume(slots.icon());
        consume(slots.label());
      };
    },
  },
  {
    ...metadata("invocation/slots-no-merge"),
    createTask(adapter) {
      const component = adapter.createSlots(slotsConfig, {twMerge: false});

      return () => callSlotsBatch(component);
    },
  },
  {
    ...metadata("composition/extend"),
    createTask(adapter) {
      return () => {
        const parent = adapter.create(buttonConfig, {twMerge: false});
        const child = adapter.create(
          {
            extend: parent,
            variants: {
              density: {
                compact: "gap-1",
                comfortable: "gap-2",
              },
            },
            defaultVariants: {density: "comfortable"},
          },
          {twMerge: false},
        );

        consume(adapter.invoke(child, {intent: "secondary", density: "compact"}));
      };
    },
  },
  {
    ...metadata("composition/extend-multi"),
    createTask(adapter) {
      return () => {
        const component = createMultiExtended(adapter, {twMerge: false});

        consume(adapter.invoke(component, {focus: "none", tone: "muted", size: "sm"}));
      };
    },
  },
  {
    ...metadata("construction/extend-multi"),
    createTask(adapter) {
      return () => consume(createMultiExtended(adapter, {twMerge: false}));
    },
  },
  {
    ...metadata("invocation/extend-multi"),
    createTask(adapter) {
      const component = createMultiExtended(adapter, {twMerge: false});

      return () => callMultiExtendBatch(adapter, component);
    },
  },
  {
    ...metadata("utilities/cn-merge"),
    createTask(adapter) {
      const run = adapter.bindMerge(classInputs, {twMerge: true});

      return () => consume(run());
    },
  },
  {
    ...metadata("invocation/custom-merge"),
    createTask(adapter) {
      const expectedMerge = extendTailwindMerge({extend: customMergeConfig});
      const component = adapter.create(customButtonConfig, {
        twMergeConfig: customMergeConfig,
      });
      const output = component({size: "md"});

      assert.equal(
        output,
        expectedMerge(output),
        `${adapter.id} custom merge output is not stable`,
      );
      if (adapter.id === "tv") {
        currentCustomMergeOutput = output;
      } else if (adapter.id === "released") {
        assert.equal(output, currentCustomMergeOutput, "TV custom merge outputs differ.");
      }

      return () => callButtonBatch(adapter, component);
    },
  },
];

const outputsFor = (adapter, options) => {
  const component = adapter.prepare(buttonConfig, options)();

  return buttonProps.map((props) => adapter.invoke(component, props));
};

const classNameOutputsFor = (adapter) => {
  const component = adapter.prepare(buttonConfig)();

  return [
    adapter.invoke(component, hotButtonProps),
    ...buttonProps.map((props, index) =>
      adapter.invoke(component, {...props, className: `w-[${index}px] px-1`}),
    ),
  ];
};

const compoundHeavyOutputsFor = (adapter) => {
  const component = adapter.prepare(compoundHeavyConfig)();

  return compoundHeavyProps.map((props) => adapter.invoke(component, props));
};

const slotOutputsFor = (adapter, options) => {
  const component = adapter.createSlots(slotsConfig, options);

  return slotsProps.map((props) => {
    const slots = component(props);

    return [slots.base(), slots.icon(), slots.label()];
  });
};

const extendOutputFor = (adapter) => {
  const parent = adapter.create(buttonConfig, {twMerge: false});
  const child = adapter.create(
    {
      extend: parent,
      variants: {
        density: {
          compact: "gap-1",
          comfortable: "gap-2",
        },
      },
      defaultVariants: {density: "comfortable"},
    },
    {twMerge: false},
  );

  return adapter.invoke(child, {intent: "secondary", density: "compact"});
};

const multiExtendOutputsFor = (adapter) => {
  const component = createMultiExtended(adapter, {twMerge: false});

  return multiExtendProps.map((props) => adapter.invoke(component, props));
};

export const assertEquivalentOutputs = (adapters) => {
  const tv = adapters.find((adapter) => adapter.id === "tv");
  const released = adapters.find((adapter) => adapter.id === "released");
  const cva = adapters.find((adapter) => adapter.id === "cva");

  assert(tv, "TV implementation is required.");
  assert(released, "Released TV implementation is required.");
  assert(cva, "CVA implementation is required.");
  assert.deepEqual(outputsFor(tv), outputsFor(released), "TV and released TV outputs differ.");
  assert.deepEqual(outputsFor(tv), outputsFor(cva), "TV and CVA outputs differ.");
  assert.deepEqual(
    outputsFor(tv, {twMerge: false}),
    outputsFor(released, {twMerge: false}),
    "TV and released TV no-merge outputs differ.",
  );
  assert.deepEqual(
    outputsFor(tv, {twMerge: false}),
    outputsFor(cva, {twMerge: false}),
    "TV and CVA no-merge outputs differ.",
  );
  assert.deepEqual(
    classNameOutputsFor(tv),
    classNameOutputsFor(released),
    "TV and released className outputs differ.",
  );
  assert.deepEqual(
    classNameOutputsFor(tv),
    classNameOutputsFor(cva),
    "TV and CVA className outputs differ.",
  );
  assert.deepEqual(
    compoundHeavyOutputsFor(tv),
    compoundHeavyOutputsFor(released),
    "TV and released compound-heavy outputs differ.",
  );
  assert.deepEqual(
    compoundHeavyOutputsFor(tv),
    compoundHeavyOutputsFor(cva),
    "TV and CVA compound-heavy outputs differ.",
  );
  if (tv.createLite) {
    assert.deepEqual(
      buttonProps.map((props) => tv.invoke(tv.createLite(buttonConfig), props)),
      outputsFor(tv),
      "TV lite + injected twMerge outputs differ from the default entry.",
    );
  }
  assert.deepEqual(slotOutputsFor(tv), slotOutputsFor(released), "TV slots outputs differ.");
  assert.deepEqual(
    slotOutputsFor(tv, {twMerge: false}),
    slotOutputsFor(released, {twMerge: false}),
    "TV no-merge slots outputs differ.",
  );
  assert.equal(extendOutputFor(tv), extendOutputFor(released), "TV extend outputs differ.");

  // Multi-extend output parity is only meaningful when the released module
  // actually supports array extend; otherwise it silently drops every parent
  // and the comparison would fail for the wrong reason.
  if (released.capabilities?.arrayExtend) {
    assert.deepEqual(
      multiExtendOutputsFor(tv),
      multiExtendOutputsFor(released),
      "TV multi-extend (array) and released outputs differ.",
    );
  }
  assert.equal(
    tv.bindMerge(classInputs, {twMerge: true})(),
    released.bindMerge(classInputs, {twMerge: true})(),
    "TV cnMerge outputs differ.",
  );
};

export const hasRetainedResult = () => sink !== undefined;
