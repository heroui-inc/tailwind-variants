import assert from "node:assert/strict";

import {extendTailwindMerge} from "tailwind-merge";

import {scenarioMetadataById} from "./metadata.mjs";
import {
  buttonConfig,
  buttonProps,
  classInputs,
  customButtonConfig,
  customMergeConfig,
  slotsConfig,
  slotsProps,
} from "./workloads.mjs";

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
  assert.deepEqual(slotOutputsFor(tv), slotOutputsFor(released), "TV slots outputs differ.");
  assert.deepEqual(
    slotOutputsFor(tv, {twMerge: false}),
    slotOutputsFor(released, {twMerge: false}),
    "TV no-merge slots outputs differ.",
  );
  assert.equal(extendOutputFor(tv), extendOutputFor(released), "TV extend outputs differ.");
  assert.equal(
    tv.bindMerge(classInputs, {twMerge: true})(),
    released.bindMerge(classInputs, {twMerge: true})(),
    "TV cnMerge outputs differ.",
  );
};

export const hasRetainedResult = () => sink !== undefined;
