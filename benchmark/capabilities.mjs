/*
 * Runtime capability probing for TV benchmark implementations.
 *
 * Instead of branching on version numbers (which cannot be anticipated for
 * future releases), each loaded TV module is probed once at startup with the
 * smallest possible fixture. Released 3.3.1 silently ignores `extend: [a, b]`
 * rather than throwing, so the probe verifies the output actually contains
 * every parent's classes instead of assuming a throw means "unsupported".
 */

const probeArrayExtend = (module) => {
  try {
    const first = module.tv({base: "probe-first"});
    const second = module.tv({base: "probe-second"});
    const component = module.tv({extend: [first, second]});
    const out = component({});

    return typeof out === "string" && out.includes("probe-first") && out.includes("probe-second");
  } catch {
    return false;
  }
};

// True when the lite entry calls an injected `twMerge` function (3.3.1 treats it as a flag).
const probeLiteInject = (liteModule) => {
  if (!liteModule || typeof liteModule.createTV !== "function") return false;

  try {
    let calls = 0;
    const tv = liteModule.createTV({
      twMerge: (classList) => {
        calls++;

        return classList;
      },
    });

    tv({base: "probe-a probe-b"})();

    return calls > 0;
  } catch {
    return false;
  }
};

// Probe every capability a TV module may or may not support.
export const probeTvCapabilities = (module, liteModule) => ({
  arrayExtend: probeArrayExtend(module),
  liteInject: probeLiteInject(liteModule),
});
