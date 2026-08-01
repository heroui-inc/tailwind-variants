import {describe, expect, test} from "vitest";

import {createTV, tv} from "../index";
import {tv as tvLite} from "../lite";
import {asRecord, defineSlots, defineVariants} from "./support/loose.js";

/*
 * Shapes this branch INHERITS and deliberately does not change.
 *
 * Each was measured across arms rather than assumed, and each is here because an untested
 * behaviour is one that moves by accident — which is how most of the entries in the reports came
 * to exist. Nothing below is a defect this branch introduced, and nothing below is repaired here.
 */

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s inherited behaviour", (_label, createTv) => {
  test("an empty slots map still returns a slots object, not a string", () => {
    // Measured: 3.2.2 answers the string "b"; 3.3.0, #305 and this branch all answer an object
    // carrying a `base` slot. `resolveOptions` routes on whether `slots` was SUPPLIED, where 3.2.2
    // routed on whether the map had any entries.
    //
    // Left as it is because it is a 3.3.0 decision rather than a caching one, and reverting it
    // would change the return TYPE of a published API on a branch whose subject is the cache.
    const component = defineSlots(createTv, {slots: {}, base: "b"});
    const result: unknown = component({});

    expect(typeof result).toBe("object");
    expect(Object.keys(asRecord(result))).toContain("base");
  });
});

describe("inherited behaviour — twMergeConfig identity", () => {
  test("mutating a live twMergeConfig object in place is not seen", () => {
    // The residual contribution 108's repair does not close, and cannot: mergers are keyed by
    // config IDENTITY, and an in-place mutation leaves the identity unchanged.
    //
    // Measured across arms first, because it would be easy to file as a regression the WeakMap
    // introduced: 3.2.2, 3.3.0 and #305 all ignore it too, for the same reason by a different
    // mechanism — their shallow comparison takes an identity fast path. So this is not a
    // regression, and a consumer wanting a new config should pass a new object.
    const twMergeConfig = {classGroups: {tone: [{tone: ["red", "blue"]}]}};
    const component = defineVariants(createTV({twMergeConfig}), {
      base: "tone-red tone-blue",
      variants: {rotate: {}},
    });

    const before = component({rotate: "a"});

    twMergeConfig.classGroups = {
      blueTone: [{tone: ["blue"]}],
      redTone: [{tone: ["red"]}],
    } as unknown as typeof twMergeConfig.classGroups;

    expect(component({rotate: "b"})).toBe(before);
  });

  test("a NEW config object is seen, so the case above is not a dead merger", () => {
    // Capability guard. A merger that never rebuilt at all would satisfy the case above while
    // meaning something entirely different.
    const grouped = defineVariants(
      createTV({twMergeConfig: {classGroups: {tone: [{tone: ["red", "blue"]}]}}}),
      {base: "tone-red tone-blue", variants: {rotate: {}}},
    );
    const separate = defineVariants(
      createTV({
        twMergeConfig: {classGroups: {blueTone: [{tone: ["blue"]}], redTone: [{tone: ["red"]}]}},
      }),
      {base: "tone-red tone-blue", variants: {rotate: {}}},
    );

    expect(grouped({rotate: "a"})).not.toBe(separate({rotate: "a"}));
  });
});
