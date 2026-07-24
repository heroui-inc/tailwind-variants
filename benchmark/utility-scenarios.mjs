import assert from "node:assert/strict";

import {utilityScenarioMetadataById} from "./utility-metadata.mjs";
import {classInputs, mergeClassInputs, mergeTokenInputs, tokenInputs} from "./workloads.mjs";

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
    ...metadata("utilities/merge"),
    createTask(adapter) {
      return () => consume(adapter.merge(mergeClassInputs));
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
  const cnfast = adapters.find((adapter) => adapter.id === "cnfast");

  assert(tv, "TV utility implementation is required.");
  assert(released, "Released TV utility implementation is required.");
  assert(cnfast, "cnfast implementation is required.");

  assert.equal(
    tv.joinMixed(classInputs),
    released.joinMixed(classInputs),
    "TV and released cx outputs differ.",
  );
  assert.equal(
    tv.joinMixed(classInputs),
    cnfast.joinMixed(classInputs),
    "TV cx and cnfast clsx outputs differ.",
  );
  assert.equal(
    tv.joinTokens(tokenInputs),
    released.joinTokens(tokenInputs),
    "TV and released token join outputs differ.",
  );
  assert.equal(
    tv.joinTokens(tokenInputs),
    cnfast.joinTokens(tokenInputs),
    "TV cx and cnfast twJoin outputs differ.",
  );
  assert.equal(
    tv.merge(mergeClassInputs),
    released.merge(mergeClassInputs),
    "TV and released cn outputs differ.",
  );
  assert.equal(
    tv.merge(mergeClassInputs),
    cnfast.merge(mergeClassInputs),
    "TV cn and cnfast cn outputs differ.",
  );
  assert.equal(
    tv.mergeCurried(classInputs, {twMerge: true})(),
    released.mergeCurried(classInputs, {twMerge: true})(),
    "TV and released cnMerge outputs differ.",
  );
};

export const hasRetainedUtilityResult = () => sink !== undefined;
