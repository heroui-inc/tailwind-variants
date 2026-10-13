/*
 * Compiled-table merge engine, vendored from shadcn-ui/cn (MIT). Conflict
 * rules follow tailwind-merge; the argument cache follows cnfast.
 *
 * Pinned at cn@0.2.5. The merge grammar and the literal-set table encoding
 * also carry cn@0.2.6 #74. Local deltas: an unlabeled `font-[Inter]` is a
 * font family and `font-[700]` a weight (Tailwind v4, cn#23), and `cn(0)`
 * keeps "0" like `cx`. Copied as a unit: scan/classify/claim/emit, the join
 * layer, and `wrapClsx` are upstream code, not rewrites.
 *
 * @see https://github.com/shadcn-ui/cn
 * @see https://github.com/shadcn-ui/cn/blob/main/packages/cn/src/engine.ts
 */

// cn — a build-time-compiled, single-pass, allocation-free Tailwind class
// merger. Architecture:
//
//   scan:     one pass finds token bounds + a fused full FNV hash (the scan
//             reads every char anyway, so hashing rides along); all
//             structural parsing (variants, '!', '/') is deferred to the
//             memo-miss path, where the base feeds a compiled radix automaton
//             that classifies while scanning — no split() arrays, no per-part
//             Map hashing, no parse objects.
//   context:  variant prefixes intern to dense integer context ids via span
//             hashing (substring materialized once per unique prefix);
//             canonicalization (segment-sorted variants, important bit) runs
//             once per unique raw prefix, ever.
//   conflict: no-variant static claims stamp an epoch array indexed by group
//             id; variant contexts and dynamic groups share an epoch-stamped
//             hash set keyed (ctxId, gid). A kept token walks its compiled
//             conflict adjacency row to claim the groups it overrides; a
//             token is dropped iff its own (ctx, group) is already claimed.
//   emit:     span-based — survivors are sliced from the input exactly once;
//             a no-op merge returns the input string itself.
//
// Comments are free (stripped by minifiers); code is sized deliberately.

import type {
  ClassNameValue,
  ClassValue,
  CnFunction,
  Engine,
  EngineOptions,
  FreshMerge,
  Tables,
  ValidatorImpls,
} from "./types.js";

// JavaScriptCore (Bun, Safari) puts `line` on Error instances; V8 does not
const IS_JSC = "line" in new Error();

const EXTERNAL = -1;
const DEAD = -1;

const fnv = (str: string, s: number, e: number): number => {
  let h = 0x811c9dc5;
  for (let p = s; p < e; p++) h = Math.imul(h ^ str.charCodeAt(p), 0x01000193);
  return h;
};

// positional span hash: O(1) regardless of length; samples head, quarter
// points, and tail. Used only by the doorkeeper, whose full-hash tag makes
// a collision cost one wasted cache insert, never a wrong result.
const spanHash = (str: string, s: number, e: number): number => {
  const len = e - s;
  let h = Math.imul(len, 0x9e3779b1) ^ str.charCodeAt(s);
  if (len > 3) {
    const q = len >> 2;
    const m = len >> 1;
    h = Math.imul(
      h ^ (str.charCodeAt(s + 1) << 8) ^ (str.charCodeAt(s + 2) << 16) ^ str.charCodeAt(s + q),
      0x85ebca6b,
    );
    h = Math.imul(
      h ^ (str.charCodeAt(s + m) << 8) ^ (str.charCodeAt(s + m + q) << 16) ^ str.charCodeAt(e - 3),
      0xc2b2ae35,
    );
    h ^= (str.charCodeAt(e - 2) << 8) ^ (str.charCodeAt(e - 1) << 16);
    // arbitrary values keep their digits a few chars from an end
    // (`w-[123px]`, `bg-[#a1b2c3]`), between the samples above: fold five
    // more chars from each end, walking inwards, so those strings stop
    // colliding (one loop, two reads: the fold has to stay small enough
    // for mergeCached to keep inlining into its callers)
    for (let p = s + 3, q = e - 4; p < s + 8 && p < q; p++, q--)
      h = Math.imul(h ^ str.charCodeAt(p) ^ (str.charCodeAt(q) << 8), 0x01000193);
  }
  return (h ^ (h >>> 15)) | 0;
};

export const createEngine = (
  T: Tables,
  validatorImpls?: ValidatorImpls,
  options: EngineOptions = {},
): Engine => {
  const {
    GROUP_COUNT,
    edgeStart,
    labelStart,
    labelText,
    edgeTarget,
    nodeGroup,
    nodeVlist,
    vlistPat,
    vlistOps,
    vlistRef,
    vlistGroup,
    litAnchor,
    litGroup,
    litPool,
    poolOffsets,
    poolText,
    adjGid,
    adjStart,
    adjTgt,
    patGid,
    patTgt,
    postfixLookupGroups,
    customValidatorNames,
    orderSensitiveModifiers,
  } = T;

  // ---- conflict adjacency row index ---------------------------------------
  // adjRow[g] / patRow[g] point at each group's target list (or -1). Claims
  // are tracked in one epoch-stamped hash set keyed (slot, gid) — covering
  // static and dynamic groups alike — and a kept token walks its adjacency
  // row to claim the groups it overrides.
  const adjRow = new Int32Array(GROUP_COUNT).fill(-1);
  for (let i = 0; i < adjGid.length; i++) adjRow[adjGid[i]] = i;

  // claims per kept token: itself + its adjacency row + postfix pairs;
  // sizes the claim table so it can never fill under any config
  let maxAdj = 0;
  for (let r = 0; r + 1 < adjStart.length; r++) {
    const n = adjStart[r + 1] - adjStart[r];
    if (n > maxAdj) maxAdj = n;
  }
  let CLAIM_PER_TOKEN = 32;
  while (CLAIM_PER_TOKEN < 2 * (1 + maxAdj + patGid.length)) CLAIM_PER_TOKEN <<= 1;

  // per-list gid offsets (lists share op patterns; gids are flat per list)
  const vgStart = new Int32Array(vlistRef.length + 1);
  for (let l = 0; l < vlistRef.length; l++) {
    vgStart[l + 1] = vgStart[l] + vlistPat[vlistRef[l] + 1] - vlistPat[vlistRef[l]];
  }

  const postfixLookupSet = new Uint8Array(GROUP_COUNT);
  for (let i = 0; i < postfixLookupGroups.length; i++) postfixLookupSet[postfixLookupGroups[i]] = 1;

  // ---- literal maps (lifted trie subtrees) -------------------------------
  // (anchorNode, tailString) → group as one open-addressed table; tails
  // live in the compiled text pool. Probes hash the input span in place —
  // a tail substring is never materialized.
  const nodeCount = edgeStart.length - 1;
  const nodeHasLit = new Uint8Array(nodeCount);
  let litMaxLen = 0;
  let litNoArb = true; // no literal tail starts with '[' or '('
  for (let i = 0; i < litAnchor.length; i++) {
    nodeHasLit[litAnchor[i]] = 1;
    const len = poolOffsets[litPool[i] * 2 + 1];
    if (len > litMaxLen) litMaxLen = len;
    const c0 = poolText.charCodeAt(poolOffsets[litPool[i] * 2]);
    if (c0 === 91 || c0 === 40) litNoArb = false;
  }
  let LIT_SIZE = 1;
  while (LIT_SIZE < litAnchor.length * 2) LIT_SIZE <<= 1;
  const litTable = new Int32Array(LIT_SIZE).fill(-1);
  for (let i = 0; i < litAnchor.length; i++) {
    const off = poolOffsets[litPool[i] * 2];
    let idx =
      ((fnv(poolText, off, off + poolOffsets[litPool[i] * 2 + 1]) ^
        Math.imul(litAnchor[i], 0x9e3779b1)) |
        0) &
      (LIT_SIZE - 1);
    while (litTable[idx] !== -1) idx = (idx + 1) & (LIT_SIZE - 1);
    litTable[idx] = i;
  }
  const litProbe = (anchor: number, input: string, s: number, e: number): number => {
    let idx = ((fnv(input, s, e) ^ Math.imul(anchor, 0x9e3779b1)) | 0) & (LIT_SIZE - 1);
    const len = e - s;
    for (;;) {
      const entry = litTable[idx];
      if (entry === -1) return -1;
      if (litAnchor[entry] === anchor && poolOffsets[litPool[entry] * 2 + 1] === len) {
        const off = poolOffsets[litPool[entry] * 2];
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (poolText.charCodeAt(off + k) !== input.charCodeAt(s + k)) {
            ok = false;
            break;
          }
        }
        if (ok) return litGroup[entry];
      }
      idx = (idx + 1) & (LIT_SIZE - 1);
    }
  };

  const cacheSize = options.cacheSize ?? 8192;

  // Tailwind v4 prefix (written like a leading variant: `tw:hover:p-4`).
  // Tokens not starting with `${prefix}:` pass through as external.
  const RAW_PREFIX = options.prefix ?? T.prefix ?? "";
  const FULL_PREFIX = RAW_PREFIX === "" ? "" : RAW_PREFIX + ":";
  const FPL = FULL_PREFIX.length;

  // ---- span validators ----------------------------------------------------
  // Opcodes over (input, start, end) spans — no substring, no regex on the
  // hot path; exact tailwind-merge semantics incl. the arbitrary-value
  // regex's label backtracking. Rare shapes fall back to lazy slice + regex.
  const vCustom = (customValidatorNames ?? []).map((name) => {
    const fn = validatorImpls && validatorImpls[name];
    if (!fn) throw new Error("cn: missing validator " + name);
    return fn;
  });

  const lengthUnitRegex =
    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  const colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
  const shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  const imageRegex =
    /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;

  // scratch filled by analyzeArb for the current tail span
  let aKind = 0; // 0 none, 1 [..], 2 (..)
  let aLabelS = -1;
  let aLabelE = -1;
  let aValS = -1;
  let aValE = -1;

  const isWordCode = (c: number) =>
    (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;

  // non-ascii members of js \s (u00a0, u1680, u2000-u200a, u2028/9, u202f,
  // u205f, u3000, ufeff); only reached for code units >= 0xa0
  const isUniWS = (c: number): boolean => /\s/.test(String.fromCharCode(c));

  const analyzeArb = (input: string, s: number, e: number): void => {
    aKind = 0;
    aLabelS = -1;
    if (e - s < 3) return;
    const c0 = input.charCodeAt(s);
    const cl = input.charCodeAt(e - 1);
    if (c0 === 91 && cl === 93) aKind = 1;
    else if (c0 === 40 && cl === 41) aKind = 2;
    else return;
    aValS = s + 1;
    aValE = e - 1;
    // label: \w[\w-]* directly followed by ':' with non-empty value
    let p = s + 1;
    if (isWordCode(input.charCodeAt(p))) {
      p++;
      while (p < e - 1) {
        const c = input.charCodeAt(p);
        if (!isWordCode(c) && c !== 45) break;
        p++;
      }
      if (p < e - 2 && input.charCodeAt(p) === 58) {
        aLabelS = s + 1;
        aLabelE = p;
        aValS = p + 1;
      }
    }
  };

  const spanEq = (input: string, s: number, e: number, str: string): boolean => {
    if (e - s !== str.length) return false;
    for (let i = 0; i < str.length; i++) {
      if (input.charCodeAt(s + i) !== str.charCodeAt(i)) return false;
    }
    return true;
  };

  // simple value shapes as regexes on lazy slices (memo-miss path only;
  // the hot arbitrary-value analysis stays span-based in analyzeArb)
  const fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  const tshirtRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  const isNumStr = (v: string) => !!v && !Number.isNaN(Number(v));
  const spanIsNamedContainerQuery = (input: string, s: number, e: number): boolean => {
    if (e - s < 11 || !spanEq(input, s, s + 10, "@container")) return false;
    if (input.charCodeAt(s + 10) === 47) return e - s >= 12;
    const c11 = input.charCodeAt(s + 11);
    return (
      (c11 === 115 && e - s >= 17 && spanEq(input, s + 10, s + 16, "-size/")) ||
      (c11 === 110 && e - s >= 19 && spanEq(input, s + 10, s + 18, "-normal/"))
    );
  };

  // ops 10-24: required kind, allowed labels, unlabeled behavior
  // (0 false, 1 true, 2 length-shape, 3 number, 4 image, 5 shadow, 6 non-number)
  const VKIND = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2];
  const VLABELS =
    "length|number|number weight|family-name|position percentage|length size bg-size|image url|shadow|length|family-name|position percentage|length size bg-size|image url|shadow|number weight"
      .split("|")
      .map((s) => s.split(" "));
  // delta vs upstream (Tailwind v4 rule, cn#23): an unlabeled `font-[…]` is a
  // weight only when it is a number and a family name otherwise, so
  // isArbitraryWeight falls back to 3 (number) and isArbitraryFamilyName to
  // 6 (non-number)
  const VFALL = [2, 3, 3, 6, 0, 0, 4, 5, 0, 0, 0, 0, 0, 1, 1];

  const runValidator = (op: number, input: string, s: number, e: number): boolean => {
    if (op >= 10) {
      if (op >= 25) return vCustom[op - 25](input.slice(s, e));
      const i = op - 10;
      if (aKind !== VKIND[i]) return false;
      if (aLabelS >= 0) {
        for (const L of VLABELS[i]) if (spanEq(input, aLabelS, aLabelE, L)) return true;
        return false;
      }
      switch (VFALL[i]) {
        case 0:
          return false;
        case 1:
          return true;
        case 2: {
          const v = input.slice(aValS, aValE);
          return lengthUnitRegex.test(v) && !colorFunctionRegex.test(v);
        }
        case 3:
          return isNumStr(input.slice(aValS, aValE));
        case 4:
          return imageRegex.test(input.slice(aValS, aValE));
        case 5:
          return shadowRegex.test(input.slice(aValS, aValE));
        default:
          return !isNumStr(input.slice(aValS, aValE));
      }
    }
    switch (op) {
      case 0:
        return true;
      case 1:
        return aKind === 0;
      case 2:
        return aKind === 1;
      case 3:
        return aKind === 2;
      case 4:
        return fractionRegex.test(input.slice(s, e));
      case 5:
        return isNumStr(input.slice(s, e));
      case 6: {
        const v = input.slice(s, e);
        return !!v && Number.isInteger(Number(v));
      }
      case 7:
        return e > s && input.charCodeAt(e - 1) === 37 && isNumStr(input.slice(s, e - 1));
      case 8:
        return tshirtRegex.test(input.slice(s, e));
      default:
        return spanIsNamedContainerQuery(input, s, e);
    }
  };

  const orderSensitive = new Set(
    typeof orderSensitiveModifiers === "string"
      ? orderSensitiveModifiers.split(" ")
      : orderSensitiveModifiers,
  );

  // ---- span interning (contexts + dynamic groups), process lifetime ------
  // hash buckets hold materialized strings (allocated once per unique span);
  // resets happen only between merges so ids stay consistent within a pass.
  interface InternEntry {
    k: string;
    imp: number;
    id: number;
  }
  const internSpan = (
    map: Map<number, InternEntry[]>,
    input: string,
    s: number,
    e: number,
    imp: number,
    make: (raw: string) => number,
  ): number => {
    const h = (fnv(input, s, e) ^ (imp ? 0x9e3779b9 : 0)) | 0;
    let bucket = map.get(h);
    if (bucket !== undefined) {
      outer: for (let b = 0; b < bucket.length; b++) {
        const en = bucket[b];
        if (en.imp !== imp || en.k.length !== e - s) continue;
        for (let i = 0; i < en.k.length; i++) {
          if (en.k.charCodeAt(i) !== input.charCodeAt(s + i)) continue outer;
        }
        return en.id;
      }
    } else map.set(h, (bucket = []));
    const k = input.slice(s, e);
    const id = make(k);
    bucket.push({k, imp, id});
    return id;
  };

  let ctxByHash = new Map();
  let ctxByCanon = new Map();
  let nextCtxId = 2; // 0 = no variants, 1 = no variants + important
  const MAX_CTX = 4096;

  const canonicalizeContext = (raw: string, important: boolean): number => {
    // split raw prefix at top-level ':' (depth-guarded), then segment-sort
    // exactly like tailwind-merge's sortModifiers
    const mods = [];
    let dB = 0,
      dP = 0,
      start = 0;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      if (dB === 0 && dP === 0 && c === 58) {
        mods.push(raw.slice(start, i));
        start = i + 1;
      } else if (c === 91) dB++;
      else if (c === 93) dB--;
      else if (c === 40) dP++;
      else if (c === 41) dP--;
    }
    mods.push(raw.slice(start));

    let canonical = mods[0];
    if (mods.length > 1) {
      const result = [];
      let segment = [];
      for (const mod of mods) {
        if (mod.charCodeAt(0) === 91 || orderSensitive.has(mod)) {
          if (segment.length) {
            result.push(...segment.sort());
            segment = [];
          }
          result.push(mod);
        } else segment.push(mod);
      }
      if (segment.length) result.push(...segment.sort());
      canonical = result.join(":");
    }
    const key = important ? canonical + " !" : canonical;
    let id = ctxByCanon.get(key);
    if (id === undefined) ctxByCanon.set(key, (id = nextCtxId++));
    return id;
  };

  let dynByHash = new Map();
  let nextDynId = GROUP_COUNT;
  const MAX_DYN = GROUP_COUNT + 4096;
  const newDynId = () => nextDynId++;
  const ID_LIMIT = 2097152; // 2^21: keeps ctx * 2^21 + gid exact in a double

  // ---- token memo (process lifetime, 2-way set-associative) --------------
  // full token span → (gid, ctxId, flags); hit verifies chars in place, so
  // it allocates nothing — unlike a string-keyed cache, which must
  // materialize the token substring before it can even look it up.
  const TOKEN_TABLE = 8192;
  const memoHash = new Int32Array(TOKEN_TABLE);
  const memoStr = new Array(TOKEN_TABLE).fill(null);
  const memoGid = new Int32Array(TOKEN_TABLE);
  const memoCtx = new Int32Array(TOKEN_TABLE);
  const memoFlags = new Uint8Array(TOKEN_TABLE);
  // second-chance insertion: an occupied way is overwritten only every 4th
  // colliding miss, so one-shot tokens can't thrash out hot entries
  let memoTick = 0;

  const memoPut = (
    way0: number,
    input: string,
    ts: number,
    te: number,
    h: number,
    gid: number,
    ctxId: number,
    flags: number,
  ): void => {
    let slot = way0;
    if (memoStr[way0] !== null) {
      if (memoStr[way0 | 1] === null) slot = way0 | 1;
      else if ((memoTick++ & 3) === 0) slot = way0 | ((memoTick >> 2) & 1);
      else return;
    }
    memoStr[slot] = input.slice(ts, te);
    memoHash[slot] = h;
    memoGid[slot] = gid;
    memoCtx[slot] = ctxId;
    memoFlags[slot] = flags;
  };
  const memoReset = () => memoStr.fill(null);

  // ---- per-merge reusable state -------------------------------------------
  let cap = 256;
  let tokI32 = [new Int32Array(cap), new Int32Array(cap), new Int32Array(cap), new Int32Array(cap)];
  let [tokStart, tokEnd, tokGid, tokCtx] = tokI32;
  let tokFlags = new Uint8Array(cap);
  let keep = new Uint8Array(cap);
  const growTokens = () => {
    cap *= 2;
    tokI32 = tokI32.map((a) => {
      const n = new Int32Array(cap);
      n.set(a);
      return n;
    });
    [tokStart, tokEnd, tokGid, tokCtx] = tokI32;
    const nf = new Uint8Array(cap);
    nf.set(tokFlags);
    tokFlags = nf;
    keep = new Uint8Array(cap);
  };

  let ckptCap = 64;
  let ckptNode = new Int32Array(ckptCap);
  let ckptTail = new Int32Array(ckptCap);

  // no-variant static claims (the dominant case) index an epoch-stamped
  // array directly by gid — one load to test, one store to claim
  const claim0 = new Int32Array(GROUP_COUNT);

  // unified claim set for the rest (variant contexts, dynamic groups):
  // epoch-stamped open-addressed (ctxId, gid) keys stored as exact doubles —
  // ids are bounded per merge by ID_LIMIT
  let CLAIM_TABLE = 2048;
  let claimShift = 21; // 32 - log2(CLAIM_TABLE)
  let claimKeys = new Float64Array(CLAIM_TABLE);
  let claimEpochs = new Int32Array(CLAIM_TABLE);
  let epoch = 0;
  // test-and-claim in one probe: returns 1 if (ctx, gid) was already
  // claimed this merge, else claims it and returns 0
  const claimTest = (ctx: number, gid: number): number => {
    if (ctx === 0 && gid < GROUP_COUNT) {
      if (claim0[gid] === epoch) return 1;
      claim0[gid] = epoch;
      return 0;
    }
    const key = ctx * 2097152 + gid + 1;
    let idx = Math.imul(key, 0x9e3779b1) >>> claimShift;
    for (;;) {
      if (claimEpochs[idx] !== epoch) break; // free slot
      if (claimKeys[idx] === key) return 1;
      idx = (idx + 1) & (CLAIM_TABLE - 1);
    }
    claimKeys[idx] = key;
    claimEpochs[idx] = epoch;
    return 0;
  };

  // ---- cold resolver (mirrors upstream mergeClassList) -------------------
  const resolveAt = (
    input: string,
    bs: number,
    endPos: number,
    nodeAt: number,
    ckptAt: number,
  ): number => {
    // arbitrary property: '[prop:...]' → dynamic per-property group
    if (endPos - bs >= 2 && input.charCodeAt(bs) === 91 && input.charCodeAt(endPos - 1) === 93) {
      let colon = -1;
      for (let p = bs + 1; p < endPos - 1; p++) {
        if (input.charCodeAt(p) === 58) {
          colon = p;
          break;
        }
      }
      if (colon === -1 || colon === bs + 1) return EXTERNAL;
      return internSpan(dynByHash, input, bs + 1, colon, 0, newDynId);
    }
    // exact match: automaton at a node with a group id
    if (nodeAt >= 0 && nodeGroup[nodeAt] >= 0) return nodeGroup[nodeAt];
    // backtrack levels, deepest first: literal-map probe (lifted exact
    // matches beat validators, exactly as deeper trie paths beat
    // validators upstream), then the level's validator opcodes
    for (let k = ckptAt - 1; k >= 0; k--) {
      const tailStart = ckptTail[k];
      if (tailStart > endPos) continue;
      const nodeId = ckptNode[k];
      const tlen = endPos - tailStart;
      if (nodeHasLit[nodeId] === 1 && tlen > 0 && tlen <= litMaxLen) {
        // arbitrary-value tails ('[…]', '(…)') can't match a literal
        // unless the compiled pool actually contains one
        const c0 = input.charCodeAt(tailStart);
        if (litNoArb === false || (c0 !== 91 && c0 !== 40)) {
          const g = litProbe(nodeId, input, tailStart, endPos);
          if (g >= 0) return g;
        }
      }
      const vl = nodeVlist[nodeId];
      if (vl < 0) continue;
      const pat = vlistRef[vl];
      const vs = vlistPat[pat];
      const ve = vlistPat[pat + 1];
      if (vs === ve) continue;
      analyzeArb(input, tailStart, endPos);
      const g0 = vgStart[vl] - vs;
      for (let v = vs; v < ve; v++) {
        if (runValidator(vlistOps[v], input, tailStart, endPos)) {
          return vlistGroup[g0 + v];
        }
      }
    }
    return EXTERNAL;
  };

  // ---- the merge -----------------------------------------------------------
  const mergeClassList = (input: string): string => {
    const n = input.length;
    let tokenCount = 0;
    let totalTokenChars = 0;
    let sawNonSpaceWS = false;

    // bounded-growth resets, between merges only
    if (nextCtxId > MAX_CTX || ctxByHash.size > MAX_CTX) {
      ctxByHash = new Map();
      ctxByCanon = new Map();
      nextCtxId = 2;
      memoReset();
    }
    if (nextDynId > MAX_DYN) {
      dynByHash = new Map();
      nextDynId = GROUP_COUNT;
      memoReset();
    }

    let i = 0;
    while (i < n) {
      let c = input.charCodeAt(i);
      if (c === 32 || (c >= 9 && c <= 13) || (c >= 0xa0 && isUniWS(c))) {
        if (c !== 32) sawNonSpaceWS = true;
        i++;
        continue;
      }
      const ts = i;
      // the scan already reads every token char, so the memo hash rides
      // along as a fused FNV accumulator — no second pass per token
      let th = 0;
      while (i < n) {
        c = input.charCodeAt(i);
        if (c <= 32) {
          if (c === 32) break;
          if (c >= 9 && c <= 13) {
            sawNonSpaceWS = true;
            break;
          }
          // control chars 0-8/14-31 are token chars (parity)
        } else if (c >= 0xa0 && isUniWS(c)) {
          sawNonSpaceWS = true;
          break;
        }
        th = Math.imul(th ^ c, 0x01000193);
        i++;
      }
      const te = i;
      const len = te - ts;
      if (tokenCount === cap) growTokens();
      const t = tokenCount++;
      tokStart[t] = ts;
      tokEnd[t] = te;
      totalTokenChars += len;

      th ^= Math.imul(len, 0x9e3779b1);
      const h = (th ^ (th >>> 15)) | 0;

      // 2-way set-associative memo probe: hit → done, zero allocation
      const way0 = h & (TOKEN_TABLE - 1) & ~1;
      {
        let hitAt = -1;
        if (memoHash[way0] === h && memoStr[way0] !== null && memoStr[way0].length === len)
          hitAt = way0;
        else if (
          memoHash[way0 | 1] === h &&
          memoStr[way0 | 1] !== null &&
          memoStr[way0 | 1].length === len
        )
          hitAt = way0 | 1;
        if (hitAt >= 0) {
          const s = memoStr[hitAt];
          // in-place byte verify at every length: a slice + '==='
          // would allocate the substring the memo exists to avoid
          let ok = true;
          for (let k = 0; k < len; k++) {
            if (s.charCodeAt(k) !== input.charCodeAt(ts + k)) {
              ok = false;
              break;
            }
          }
          if (ok) {
            tokGid[t] = memoGid[hitAt];
            tokCtx[t] = memoCtx[hitAt];
            tokFlags[t] = memoFlags[hitAt];
            continue;
          }
        }
      }

      // ===== memo miss: optional prefix gate, then structural parse ===
      let pts = ts;
      if (FPL !== 0) {
        if (te - ts <= FPL || !input.startsWith(FULL_PREFIX, ts)) {
          tokGid[t] = EXTERNAL;
          memoPut(way0, input, ts, te, h, EXTERNAL, 0, 0);
          continue;
        }
        pts = ts + FPL;
      }
      let depthB = 0,
        depthP = 0;
      let lastColon = -1,
        lastSlash = -1;
      for (let p = pts; p < te; p++) {
        const pc = input.charCodeAt(p);
        if (depthB === 0 && depthP === 0) {
          if (pc === 58) {
            lastColon = p;
            continue;
          }
          if (pc === 47) {
            lastSlash = p;
            continue;
          }
        }
        if (pc === 91) depthB++;
        else if (pc === 93) depthB--;
        else if (pc === 40) depthP++;
        else if (pc === 41) depthP--;
      }

      const modStart = lastColon >= pts ? lastColon + 1 : pts;

      // important modifier: suffix '!' first (v4), else legacy prefix
      let bs = modStart;
      let be = te;
      let important = false;
      let prefixShift = 0;
      if (be > bs && input.charCodeAt(be - 1) === 33) {
        important = true;
        be--;
      } else if (be > bs && input.charCodeAt(bs) === 33) {
        important = true;
        bs++;
        prefixShift = 1;
      }

      // postfix candidate — replicates upstream exactly, including the
      // prefix-'!' index-shift quirk (end includes '/' when shifted)
      let postfixEnd = -1;
      if (lastSlash > modStart) {
        postfixEnd = lastSlash + prefixShift;
        if (postfixEnd >= be) postfixEnd = -1;
      }

      // ===== pass B: feed base through the radix automaton ============
      let feedStart = bs;
      if (be - bs > 1 && input.charCodeAt(bs) === 45) feedStart = bs + 1; // negative values

      let node = 0;
      let lp = 0; // label window: lp < le → mid-edge
      let le = 0;
      let pending = -1;
      let ckptTop = 0;
      if (nodeVlist[0] >= 0 || nodeHasLit[0] === 1) {
        ckptNode[0] = 0;
        ckptTail[0] = feedStart;
        ckptTop = 1;
      }
      let slashNode = DEAD;
      let slashCkpt = 0;

      for (let p = feedStart; p < be; p++) {
        if (p === postfixEnd) {
          slashNode = lp < le ? DEAD : node;
          slashCkpt = ckptTop;
        }
        if (node !== DEAD) {
          const cc = input.charCodeAt(p);
          let arrived = -1;
          if (lp < le) {
            if (labelText.charCodeAt(lp) === cc) {
              lp++;
              if (lp === le) arrived = node = pending;
            } else node = DEAD;
          } else {
            const es = edgeStart[node];
            const ee = edgeStart[node + 1];
            let next = DEAD;
            for (let e = es; e < ee; e++) {
              const ls = labelStart[e];
              if (labelText.charCodeAt(ls) === cc) {
                if (labelStart[e + 1] - ls === 1) arrived = next = edgeTarget[e];
                else {
                  lp = ls + 1;
                  le = labelStart[e + 1];
                  pending = edgeTarget[e];
                  next = node;
                }
                break;
              }
            }
            node = next;
          }
          if (
            arrived >= 0 &&
            (nodeVlist[arrived] >= 0 || nodeHasLit[arrived] === 1) &&
            p + 1 < be &&
            input.charCodeAt(p + 1) === 45
          ) {
            if (ckptTop === ckptCap) {
              ckptCap *= 2;
              const nv = new Int32Array(ckptCap);
              nv.set(ckptNode);
              ckptNode = nv;
              const nt = new Int32Array(ckptCap);
              nt.set(ckptTail);
              ckptTail = nt;
            }
            ckptNode[ckptTop] = arrived;
            ckptTail[ckptTop] = p + 2;
            ckptTop++;
          }
        }
      }
      if (postfixEnd === be) {
        slashNode = lp < le ? DEAD : node;
        slashCkpt = ckptTop;
      }
      const endNode = lp < le ? DEAD : node;

      let gid;
      let hasPostfix = false;
      if (postfixEnd >= 0) {
        hasPostfix = true;
        gid = resolveAt(input, bs, postfixEnd, slashNode, slashCkpt);
        if (gid !== EXTERNAL && gid < GROUP_COUNT && postfixLookupSet[gid]) {
          const gidFull = resolveAt(input, bs, be, endNode, ckptTop);
          if (gidFull !== EXTERNAL && gidFull !== gid) {
            gid = gidFull;
            hasPostfix = false;
          }
        } else if (gid === EXTERNAL) {
          gid = resolveAt(input, bs, be, endNode, ckptTop);
          hasPostfix = false;
        }
      } else {
        gid = resolveAt(input, bs, be, endNode, ckptTop);
      }

      let ctxId = 0;
      let flags = 0;
      if (gid === EXTERNAL) {
        tokGid[t] = EXTERNAL;
      } else {
        flags = hasPostfix ? 1 : 0;
        ctxId =
          pts >= lastColon
            ? important
              ? 1
              : 0
            : internSpan(ctxByHash, input, pts, lastColon, important ? 1 : 0, (k: string) =>
                canonicalizeContext(k, important),
              );
        tokGid[t] = gid;
        tokFlags[t] = flags;
        tokCtx[t] = ctxId;
      }

      memoPut(way0, input, ts, te, h, gid, ctxId, flags);
    }

    // ===== fast paths =====================================================
    if (tokenCount === 0) return "";
    if (tokenCount === 1) {
      return tokStart[0] === 0 && tokEnd[0] === n ? input : input.slice(tokStart[0], tokEnd[0]);
    }

    // ===== backward claim pass ============================================
    // worst-case claims = tokens x CLAIM_PER_TOKEN, where CLAIM_PER_TOKEN is
    // derived from the tables' real max fan-out; keep load factor under 50%
    // so probes stay short and the table can never fill
    if (tokenCount * CLAIM_PER_TOKEN > CLAIM_TABLE) {
      while (tokenCount * CLAIM_PER_TOKEN > CLAIM_TABLE) {
        CLAIM_TABLE <<= 1;
        claimShift--;
      }
      claimKeys = new Float64Array(CLAIM_TABLE);
      claimEpochs = new Int32Array(CLAIM_TABLE);
    }
    if (nextCtxId >= ID_LIMIT || nextDynId >= ID_LIMIT)
      throw new Error("cn: too many distinct classes in one merge");
    // epoch is stored in Int32Arrays, so it has to truncate the same way; on
    // the wrap through 0 the tables must be cleared or unclaimed slots read
    // as claimed
    epoch = (epoch + 1) | 0;
    if (epoch === 0) {
      claim0.fill(0);
      claimEpochs.fill(0);
      epoch = 1;
    }
    let didDrop = false;
    for (let t = tokenCount - 1; t >= 0; t--) {
      const gid = tokGid[t];
      if (gid === EXTERNAL) {
        keep[t] = 1;
        continue;
      }
      const ctxId = tokCtx[t];
      if (claimTest(ctxId, gid) === 1) {
        keep[t] = 0;
        didDrop = true;
        continue;
      }
      keep[t] = 1;
      if (gid < GROUP_COUNT) {
        // claim overridden groups: base adjacency, plus the flat
        // postfix-extra pairs (conflictingClassGroupModifiers)
        const r = adjRow[gid];
        if (r >= 0) {
          for (let k = adjStart[r]; k < adjStart[r + 1]; k++) claimTest(ctxId, adjTgt[k]);
        }
        if (tokFlags[t] & 1) {
          for (let k = 0; k < patGid.length; k++) {
            if (patGid[k] === gid) claimTest(ctxId, patTgt[k]);
          }
        }
      }
    }

    // ===== emission =======================================================
    if (!didDrop && !sawNonSpaceWS && n === totalTokenChars + tokenCount - 1) {
      return input; // already normalized, nothing dropped
    }
    // emit contiguous runs of kept tokens as single slices: fewer
    // allocations, and the result is a flat string (cheap to hash when it
    // lands in a downstream cache) instead of a cons-string chain
    let out = "";
    let t = 0;
    while (t < tokenCount) {
      if (!keep[t]) {
        t++;
        continue;
      }
      const runStart = tokStart[t];
      let runEnd = tokEnd[t];
      let u = t + 1;
      while (
        u < tokenCount &&
        keep[u] &&
        tokStart[u] === runEnd + 1 &&
        input.charCodeAt(runEnd) === 32
      ) {
        runEnd = tokEnd[u];
        u++;
      }
      if (out.length > 0) out += " ";
      out += input.slice(runStart, runEnd);
      t = u;
    }
    return out;
  };

  // ---- whole-string cache (2-generation, doorkeeper-admitted) -------------
  // A string enters the cache only on its second sighting, tracked by an
  // epoch-stamped filter keyed with an O(1) positional hash. One-shot
  // strings (SSR streams) skip both the insert *and* the cache lookup, so
  // cache-hostile traffic pays a few sampled chars instead of an O(n) hash
  // per call, and large recurring working sets still warm fully.
  // 16384 slots × two generations = 128 KB; sized so real-repo working
  // sets (~10k distinct strings at the corpus p95) fit without exact-tag
  // slot conflicts evicting each other's sightings
  const DOOR_SIZE = 16384;
  const door = new Int32Array(DOOR_SIZE * 2); // two generations, base-flipped
  let doorBase = 0;
  let doorEpoch = 1;
  let cache = Object.create(null);
  let prevCache = Object.create(null);
  let cacheMap = new Map<string, string>();
  let prevCacheMap = new Map<string, string>();
  let cacheCount = 0;
  let doorMarks = 0;
  // two-generation rotation: sightings survive mark pressure instead of
  // being wiped, so recurring working sets larger than the filter still
  // accumulate the two sightings admission needs (a full wipe starves them
  // forever — measured 6-15x slower on real-repo corpus replays)
  // the previous generation's epoch is always doorEpoch - 1: rotation
  // advances both together, so it needs no variable of its own
  // no wrap guard on the epoch: a wrap needs 2^32 rotations, and even then
  // a stale match costs one wasted insert, never a wrong result
  const rotateDoor = () => {
    doorBase ^= DOOR_SIZE;
    doorEpoch = (doorEpoch + 1) | 0;
    doorMarks = 0;
  };
  // doorkeeper: a string seen once in the current or previous generation
  // admits on this sighting. Slots store the full 32-bit hash (xor epoch),
  // so a slot collision must match all hash bits to count as a sighting —
  // unique streams (SSR) almost never false-admit, which would cost a
  // dictionary insert plus generation churn per call. Stale slots from two
  // generations back self-invalidate via the epoch xor. Slot bits never
  // overlap the base bit, so the sibling generation's slot is one xor away.
  const mergeCached = (input: string): string => {
    // hit path first: warm, identity-stable strings stay at one
    // object-property read with a V8-cached hash
    let merged = cache[input];
    if (merged !== undefined) return merged;
    const hash = spanHash(input, 0, input.length);
    const slot = (hash & (DOOR_SIZE - 1)) + doorBase;
    const wasSeen =
      door[slot] === (hash ^ doorEpoch) || door[slot ^ DOOR_SIZE] === (hash ^ (doorEpoch - 1));
    if (wasSeen) {
      merged = prevCache[input];
      if (merged !== undefined) {
        cache[input] = merged; // promote
        return merged;
      }
    }
    merged = mergeClassList(input);
    if (wasSeen) {
      cache[input] = merged;
      if (++cacheCount > cacheSize) {
        cacheCount = 0;
        prevCache = cache;
        cache = Object.create(null);
        rotateDoor();
      }
    } else {
      door[slot] = hash ^ doorEpoch;
      if (++doorMarks > DOOR_SIZE) rotateDoor();
    }
    return merged;
  };
  // same as mergeCached over Maps: JSC looks up a string key in a
  // dictionary-mode object in ~21 ns and a fresh key in ~220 ns, where a Map
  // takes 6 and 75 (V8 is the reverse, 5 vs 18 on a hit, so it keeps the
  // dictionary above). Kept as a copy rather than an accessor layer, which
  // cost V8 5% on every hit.
  const mergeCachedMap = (input: string): string => {
    let merged = cacheMap.get(input);
    if (merged !== undefined) return merged;
    const hash = spanHash(input, 0, input.length);
    const slot = (hash & (DOOR_SIZE - 1)) + doorBase;
    const wasSeen =
      door[slot] === (hash ^ doorEpoch) || door[slot ^ DOOR_SIZE] === (hash ^ (doorEpoch - 1));
    if (wasSeen) {
      merged = prevCacheMap.get(input);
      if (merged !== undefined) {
        cacheMap.set(input, merged); // promote
        return merged;
      }
    }
    merged = mergeClassList(input);
    if (wasSeen) {
      cacheMap.set(input, merged);
      if (++cacheCount > cacheSize) {
        cacheCount = 0;
        prevCacheMap = cacheMap;
        cacheMap = new Map();
        rotateDoor();
      }
    } else {
      door[slot] = hash ^ doorEpoch;
      if (++doorMarks > DOOR_SIZE) rotateDoor();
    }
    return merged;
  };
  // a string that was just built cannot be cached by identity, and a
  // never-seen key is the expensive dictionary case (V8 hashes and
  // internalizes it: ~200 ns at 17 chars, ~1.1 µs at 360). The doorkeeper
  // answers "never seen" in O(1) instead, so the caller can merge a
  // one-shot string uncached and skip caching it anywhere
  const seenBefore = (input: string): boolean => {
    const hash = spanHash(input, 0, input.length);
    const slot = (hash & (DOOR_SIZE - 1)) + doorBase;
    if (door[slot] === (hash ^ doorEpoch) || door[slot ^ DOOR_SIZE] === (hash ^ (doorEpoch - 1)))
      return true;
    door[slot] = hash ^ doorEpoch;
    if (++doorMarks > DOOR_SIZE) rotateDoor();
    return false;
  };
  // JSC will not inline mergeCached with the doorkeeper body in it, so it
  // gets a two-line hit front that only falls through to the full function
  // on a miss (the repeated lookup there rides the hash the front just
  // cached). V8 inlines the full closure and loses ~15% on long strings
  // with the body outlined, so it uses mergeCached directly.
  const mergeString =
    cacheSize === 0
      ? mergeClassList
      : IS_JSC
        ? (input: string): string => {
            const merged = cacheMap.get(input);
            return merged !== undefined ? merged : mergeCachedMap(input);
          }
        : mergeCached;

  const merge = function (): string {
    return arguments.length === 1 && typeof arguments[0] === "string"
      ? mergeString(arguments[0])
      : mergeString(twJoin.apply(null, arguments as never));
  } as Engine["merge"];

  return {
    merge,
    mergeString,
    seenBefore: cacheSize === 0 ? () => false : seenBefore,
    mergeUncached: mergeClassList,
  };
};

// shared value resolution. clsxMode adds clsx's extras (numbers, object
// syntax); twJoin mode ignores them, matching tailwind-merge's twJoin.
const resolveValue = (v: ClassValue, clsxMode: boolean): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  let out = "";
  if (
    typeof (v as {length?: unknown}).length === "number" &&
    (clsxMode ? Array.isArray(v) : true)
  ) {
    const arr = v as ArrayLike<ClassValue>;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item) continue;
      const r = typeof item === "string" ? item : resolveValue(item, clsxMode);
      if (r) {
        if (out) out += " ";
        out += r;
      }
    }
    return out;
  }
  if (clsxMode) {
    if (typeof v === "number") return "" + v;
    if (typeof v === "object") {
      for (const k in v)
        if ((v as Record<string, unknown>)[k]) {
          if (out) out += " ";
          out += k;
        }
    }
  }
  return out;
};

const joinArgs = (args: IArguments, clsxMode: boolean): string => {
  let s = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    const r = typeof a === "string" ? a : resolveValue(a as ClassValue, clsxMode);
    if (r) {
      if (s) s += " ";
      s += r;
    }
  }
  return s;
};

/** join-only, `twJoin`-compatible (strings + nested arrays, falsy skipped) */
export const twJoin = function (): string {
  return joinArgs(arguments, false);
} as (...inputs: ClassNameValue[]) => string;

/** join-only, `clsx`-compatible (no merging) */
export const clsx = function (): string {
  return joinArgs(arguments, true);
} as (...inputs: ClassValue[]) => string;

// clsx-parity join over any mergeString. Separate export so merge-only
// consumers tree-shake it.
interface ArgEntry {
  /** merged result */
  r: string;
  /** truthy arg count (=== a.length, denormalized for the unrolled probes) */
  t: number;
  /** first three truthy args, '' padded — monomorphic fields so the arity
   *  fronts verify without an array indirection */
  a0: string;
  a1: string;
  a2: string;
  /** the truthy string args, in order (identity-compared; generic paths) */
  a: string[];
  /** the entry that followed this one last time (sequence prediction) */
  n: ArgEntry | null;
}

export const wrapClsx = (
  mergeString: (input: string) => string,
  fresh?: FreshMerge,
): CnFunction => {
  // without an engine's doorkeeper every join counts as seen and is cached
  const seenBefore = fresh === undefined ? () => true : fresh.seenBefore;
  const mergeUncached = fresh === undefined ? mergeString : fresh.mergeUncached;
  // arg-identity cache: repeated calls whose truthy args are the same string
  // *instances* (stable JSX literals — the dominant component shape) skip
  // the re-join and the O(n) hash of the fresh joined string. Only engages
  // when every truthy arg is a string: objects/arrays are mutable at the
  // same identity, so they always take the full resolve path.
  //
  // Render loops replay call *sequences*, not just calls, so each entry also
  // remembers which entry came next last time. When the prediction verifies
  // (pure identity compares), the call skips even the bucket lookup.
  let argCache = new Map<string, ArgEntry[]>();
  let prevArgCache = new Map<string, ArgEntry[]>();
  let argCount = 0;
  let lastHit: ArgEntry | null = null;

  // unrolled truthy-sequence verify for arity ≤ 3, against the entry's
  // monomorphic fields. Arity-2 calls pass '' as v2: a falsy pad skips the
  // slot, so the same code serves both arities. Non-string truthy args can
  // never strict-equal a string field, so they fail here and take the
  // resolve path below.
  const match3 = (e: ArgEntry, v0: ClassValue, v1: ClassValue, v2: ClassValue): boolean => {
    let k = 0;
    if (v0) {
      if (v0 !== e.a0) return false;
      k = 1;
    }
    if (v1) {
      if (v1 !== (k === 0 ? e.a0 : e.a1)) return false;
      k++;
    }
    if (v2) {
      if (v2 !== (k === 0 ? e.a0 : k === 1 ? e.a1 : e.a2)) return false;
      k++;
    }
    return k === e.t;
  };

  // generic path for any arity: probes (loop form), clsx fallback for
  // non-string args, bucket lookup, insert, chain update
  // loop-form verify for any arity (identity compares; non-strings never match)
  const matchN = (e: ArgEntry, vals: ClassValue[]): boolean => {
    const ea = e.a;
    let k = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (!v) continue;
      if (v !== ea[k]) return false;
      k++;
    }
    return k === e.t;
  };

  const resolveArgs = (vals: ClassValue[], probed: boolean): string => {
    const nArgs = vals.length;
    const pred = lastHit === null ? null : lastHit.n;
    if (!probed) {
      if (pred !== null && matchN(pred, vals)) {
        lastHit = pred;
        return pred.r;
      }
      if (lastHit !== null && lastHit !== pred && matchN(lastHit, vals)) return lastHit.r;
    }
    let first = "";
    let firstIdx = -1;
    let truthy = 0;
    let hasResolvedValue = false;
    for (let i = 0; i < nArgs; i++) {
      let v = vals[i];
      if (!v) continue;
      if (typeof v !== "string") {
        // objects and arrays resolve in place and ride the string path: a
        // one-key object resolves to that key string itself, whose identity
        // is stable across renders, so the arg cache still hits
        v = vals[i] = resolveValue(v as ClassValue, true);
        if (!v) continue;
        hasResolvedValue = true;
      }
      if (firstIdx < 0) {
        first = v;
        firstIdx = i;
      }
      truthy++;
    }
    if (truthy === 0) return "";
    if (truthy === 1) return mergeString(first); // cheap path; chain untouched
    if (hasResolvedValue) {
      // the probes above saw the raw objects; retry them over the resolved
      // strings before paying for the bucket walk
      if (pred !== null && matchN(pred, vals)) {
        lastHit = pred;
        return pred.r;
      }
      if (lastHit !== null && lastHit !== pred && matchN(lastHit, vals)) return lastHit.r;
    }
    let bucket = argCache.get(first);
    if (bucket === undefined) {
      bucket = prevArgCache.get(first);
      if (bucket !== undefined) argCache.set(first, bucket); // promote
    }
    let hit: ArgEntry | null = null;
    if (bucket !== undefined) {
      outer: for (let b = 0; b < bucket.length; b++) {
        const e = bucket[b]!;
        if (e.t !== truthy) continue;
        const ea = e.a;
        let k = 1;
        for (let i = firstIdx + 1; i < nArgs; i++) {
          const v = vals[i];
          if (v && v !== ea[k++]) continue outer;
        }
        hit = e;
        break;
      }
    }
    if (hit === null) {
      let joined = first;
      const a: string[] = [first];
      for (let i = firstIdx + 1; i < nArgs; i++) {
        const v = vals[i];
        if (!v) continue;
        joined += " " + (v as string);
        a.push(v as string);
      }
      // a first sighting is merged straight through: no dictionary lookup
      // on a fresh key, no cache entry anywhere, chain left untouched. A
      // repeat pays the lookup once and caches like before.
      if (!seenBefore(joined)) return mergeUncached(joined);
      hit = {
        r: mergeString(joined),
        t: a.length,
        a0: a[0]!,
        a1: a[1]!,
        a2: a[2] ?? "",
        a,
        n: null,
      };
      if (bucket === undefined) argCache.set(first, (bucket = []));
      // a component's base string is the first arg at every usage site, so
      // one key can carry dozens of tuples (54 in the largest corpus repo,
      // more once per-site className props count); a tight cap evicts them
      // faster than the sequence chain can learn them, at ~40x per call
      if (bucket.length >= 256) bucket.shift();
      bucket.push(hit);
      // two-generation rotation: a full generation ages out wholesale
      // instead of clearing everything; hot buckets get promoted on use,
      // so replayed sequences survive rotation and the chain stays warm
      if (++argCount > 1000) {
        argCount = 0;
        prevArgCache = argCache;
        argCache = new Map();
      }
    }
    if (lastHit !== null && lastHit !== hit) lastHit.n = hit;
    lastHit = hit;
    return hit.r;
  };

  // cn([a, b]) is cn(a, b) under clsx's flattening, so a lone array takes
  // the arg path and its stable element identities hit the cache
  // delta vs upstream: a lone numeric zero keeps its text (`cn(0)` is "0",
  // like `cx`), while a zero among other arguments is skipped as in clsx
  const mergeSingleValue = (value: ClassValue): string =>
    Array.isArray(value)
      ? resolveArgs(value.slice(), false)
      : value === 0 || value === 0n
        ? "0"
        : mergeString(resolveValue(value, true));

  // named params make the hot path three register reads instead of three
  // `arguments` element loads; modules are strict, so params never alias
  // `arguments` (still used for arity and the 4+ overflow copy). Arity 2
  // rides the same branch as 3: an absent v2 is undefined, and a falsy pad
  // behaves identically to '' through the probes and the resolve path.
  return function (v0?: ClassValue, v1?: ClassValue, v2?: ClassValue): string {
    const nArgs = arguments.length;
    if ((nArgs | 1) === 3) {
      // arity 2 or 3
      const lh = lastHit;
      if (lh !== null) {
        // sequence prediction: does this call repeat what followed
        // last time?
        const pred = lh.n;
        if (pred !== null && match3(pred, v0, v1, v2)) {
          lastHit = pred;
          return pred.r;
        }
        // self-repeat: the same call site firing again immediately.
        // Probed rather than stored as a self-link so an entry's
        // learned successor is never clobbered — a doubled site
        // (A, A, B) predicts all three calls: A→B via .n, the
        // repeat via this probe.
        if (lh !== pred && match3(lh, v0, v1, v2)) return lh.r;
      }
      return resolveArgs([v0, v1, v2], true);
    }
    if (nArgs === 1) return typeof v0 === "string" ? mergeString(v0) : mergeSingleValue(v0);
    // 4+ arity: probe predictions in place over `arguments` (indexed
    // reads only, so it never materializes) — a predicted render-loop
    // call allocates nothing. Only a genuine miss copies into an array
    // for the resolve path.
    const lh = lastHit;
    if (lh !== null) {
      const pred = lh.n;
      if (pred !== null) {
        const pa = pred.a;
        let k = 0;
        let ok = true;
        for (let i = 0; i < nArgs; i++) {
          const v = arguments[i];
          if (!v) continue;
          if (v !== pa[k]) {
            ok = false;
            break;
          }
          k++;
        }
        if (ok && k === pred.t) {
          lastHit = pred;
          return pred.r;
        }
      }
      if (lh !== pred) {
        const la = lh.a;
        let k = 0;
        let ok = true;
        for (let i = 0; i < nArgs; i++) {
          const v = arguments[i];
          if (!v) continue;
          if (v !== la[k]) {
            ok = false;
            break;
          }
          k++;
        }
        if (ok && k === lh.t) return lh.r;
      }
    }
    const vals: ClassValue[] = [];
    for (let i = 0; i < nArgs; i++) vals.push(arguments[i]);
    return resolveArgs(vals, true);
  } as CnFunction;
};

/**
 * Create a `cn` function bound to compiled tables — the entry point for
 * project-compiled (`cn build`) tables:
 *
 * ```ts
 * import tables from "./cn-tables.js"
 * import { createCn } from "cn/engine"
 * export const cn = createCn(tables)
 * ```
 */
export const createCn = (
  tables: Tables,
  validatorImpls?: ValidatorImpls,
  options?: EngineOptions,
): CnFunction => {
  const engine = createEngine(tables, validatorImpls, options);
  return wrapClsx(engine.mergeString, engine);
};
