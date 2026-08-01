import {describe, expect, test} from "vitest";

import {createTV as createTVFull} from "../index";
import {createTV as createTVLite} from "../lite";

const variants = [
  {name: "full - tailwind-merge", createTV: createTVFull, mode: "full"},
  {name: "lite - without tailwind-merge", createTV: createTVLite, mode: "lite"},
];

describe.each(variants)("createTV ($name)", ({createTV, mode}) => {
  test("respects twMerge config when creating tv instance", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv({
      base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
    });

    // twMerge disabled: classes should not be merged or overridden
    expect(h1()).toHaveClass("text-3xl font-bold text-blue-400 text-xl text-blue-200");
  });

  test("overrides twMerge config on tv call", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv(
      {base: "text-3xl font-bold text-blue-400 text-xl text-blue-200"},
      {twMerge: true},
    );

    // twMerge enabled on full mode merges conflicting classes
    // lite mode does not support merging, returns original classes
    const expected =
      mode === "lite"
        ? "text-3xl font-bold text-blue-400 text-xl text-blue-200"
        : "font-bold text-xl text-blue-200";

    expect(h1()).toHaveClass(expected);
  });

  test("two structurally identical configs each keep their own merger", () => {
    // The documented pattern produces this: the README tells consumers to reuse one config object
    // across `tv` / `createTV` / `cnMerge`, so a design system and the application consuming it are
    // two objects that happen to be equal. Sharing ONE module slot between them makes every
    // alternation look like a config change and rebuilds the whole tailwind-merge trie.
    //
    // Every call must MISS the result cache, or the merger is never reached and this passes for a
    // reason that has nothing to do with the merger — a rotating prop value is what forces it. The
    // cliff is only visible past the cache, which is why the timed version of this reads 700 ns for
    // one component and 350 microseconds for two.
    //
    // Counted rather than timed: a rebuild reads the config, so a getter reports exactly how many
    // happened. An exact number on any machine, where a duration would measure the machine.
    let rebuilds = 0;
    const countingConfig = () => ({
      get classGroups() {
        rebuilds++;

        return {tone: [{tone: ["red", "blue"]}]};
      },
    });

    // Every value is declared and maps to no class, so the variant contributes nothing to the
    // output and the only thing rotating it changes is the cache key. Declaring them rather than
    // generating them is what keeps this typed: the rotation is load-bearing, not incidental, so
    // it must not be simplified away to a single value.
    const buildComponent = (twMergeConfig: object) =>
      createTV({twMergeConfig})({
        base: "tone-red tone-blue",
        variants: {
          rotate: {warm: "", r0: "", r1: "", r2: "", r3: "", r4: "", r5: "", r6: "", r7: ""},
        },
      });

    const designSystem = buildComponent(countingConfig());
    const application = buildComponent(countingConfig());

    // Past the first build of each, which is the one rebuild per config that has to happen.
    designSystem({rotate: "warm"});
    application({rotate: "warm"});

    rebuilds = 0;

    const rotation = ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"] as const;

    for (const value of rotation) {
      designSystem({rotate: value});
      application({rotate: value});
    }

    expect(rebuilds).toBe(0);
  });
});
