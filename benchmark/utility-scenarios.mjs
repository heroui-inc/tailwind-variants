import {utilityScenarioMetadataById} from "./utility-metadata.mjs";
import {
  classInputs,
  cnStableInputs,
  mergeClassInputs,
  mergeTokenInputs,
  tokenInputs,
} from "./workloads.mjs";
import assert from "node:assert/strict";

const metadata = (id) => {
  const value = utilityScenarioMetadataById.get(id);

  if (!value) throw new TypeError(`Missing utility benchmark metadata for ${id}.`);

  return value;
};

let sink;

const consume = (value) => {
  sink = value;
};

export const utilityScenarios = [
  {
    ...metadata("utilities/join-mixed"),
    createTask(adapter) {
      return () => consume(adapter.joinMixed(classInputs));
    },
  },
  {
    ...metadata("utilities/join-tokens"),
    createTask(adapter) {
      return () => consume(adapter.joinTokens(tokenInputs));
    },
  },
  {
    ...metadata("utilities/tw-join"),
    createTask(adapter) {
      return () => consume(adapter.joinDirect(tokenInputs));
    },
  },
  {
    ...metadata("utilities/merge"),
    createTask(adapter) {
      return () => consume(adapter.merge(mergeClassInputs));
    },
  },
  {
    ...metadata("utilities/cn-stable-args"),
    createTask(adapter) {
      const {base, extra, className} = cnStableInputs;
      let on = false;

      return () => {
        on = !on;
        consume(adapter.mergeArgs(base, on && extra, className));
      };
    },
  },
  {
    ...metadata("utilities/cn-arbitrary-arg"),
    createTask(adapter) {
      const {base, extra} = cnStableInputs;
      let on = false;
      let counter = 0;

      return () => {
        on = !on;
        consume(adapter.mergeArgs(base, on && extra, `w-[${counter++}px]`));
      };
    },
  },
  {
    ...metadata("utilities/cn-merge"),
    createTask(adapter) {
      const run = adapter.mergeCurried(classInputs, {twMerge: true});

      return () => consume(run());
    },
  },
  {
    ...metadata("utilities/tw-merge"),
    createTask(adapter) {
      return () => consume(adapter.mergeDirect(mergeTokenInputs));
    },
  },
];

export const assertEquivalentUtilityOutputs = (adapters) => {
  const tv = adapters.find((adapter) => adapter.id === "tv");
  const released = adapters.find((adapter) => adapter.id === "released");
  const cn = adapters.find((adapter) => adapter.id === "cn");

  assert(tv, "TV utility implementation is required.");
  assert(released, "Released TV utility implementation is required.");
  assert(cn, "shadcn-ui/cn implementation is required.");

  assert.equal(
    tv.joinMixed(classInputs),
    released.joinMixed(classInputs),
    "TV and released cx outputs differ.",
  );
  assert.equal(
    tv.joinMixed(classInputs),
    cn.joinMixed(classInputs),
    "TV cx and cn clsx outputs differ.",
  );
  assert.equal(
    tv.joinTokens(tokenInputs),
    released.joinTokens(tokenInputs),
    "TV and released token join outputs differ.",
  );
  assert.equal(
    tv.joinTokens(tokenInputs),
    cn.joinTokens(tokenInputs),
    "TV cx and cn twJoin outputs differ.",
  );
  assert.equal(
    tv.merge(mergeClassInputs),
    released.merge(mergeClassInputs),
    "TV and released cn outputs differ.",
  );
  assert.equal(
    tv.joinDirect(tokenInputs),
    cn.joinDirect(tokenInputs),
    "TV twJoin and cn twJoin outputs differ.",
  );
  assert.equal(
    tv.mergeDirect(mergeTokenInputs),
    cn.mergeDirect(mergeTokenInputs),
    "TV twMerge and cn twMerge outputs differ.",
  );
  assert.equal(
    tv.merge(mergeClassInputs),
    cn.merge(mergeClassInputs),
    "TV cn and cn cn outputs differ.",
  );
  const {base, extra, className} = cnStableInputs;

  for (const args of [
    [base, extra, className],
    [base, false, className],
    [base, extra, "w-[1px]"],
  ]) {
    assert.equal(
      tv.mergeArgs(...args),
      released.mergeArgs(...args),
      "TV and released cn argument outputs differ.",
    );
    assert.equal(
      tv.mergeArgs(...args),
      cn.mergeArgs(...args),
      "TV cn and cn cn argument outputs differ.",
    );
  }

  assert.equal(
    tv.mergeCurried(classInputs, {twMerge: true})(),
    released.mergeCurried(classInputs, {twMerge: true})(),
    "TV and released cnMerge outputs differ.",
  );
};

export const hasRetainedUtilityResult = () => sink !== undefined;
