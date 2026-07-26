import {createClassGroupUtils} from "./class-group-utils.js";
import {IMPORTANT_MODIFIER, parseClassName} from "./parse-class-name.js";
import {createSortModifiers} from "./sort-modifiers.js";
import {AnyClassGroupIds, AnyConfig} from "./types.js";

export type ConfigUtils = ReturnType<typeof createConfigUtils>;

/** Per-token parse + conflict-key descriptor (cached across merges). */
export interface ClassDescriptor {
  isExternal: boolean;
  classId: number;
  conflictIds: number[];
}

const EXTERNAL_DESCRIPTOR: ClassDescriptor = {isExternal: true, classId: -1, conflictIds: []};

const DESCRIPTOR_CACHE_SIZE = 4096;
/** Cap interned conflict keys; reset registry + descriptor caches when exceeded. */
const MAX_CONFLICT_KEYS = 16384;

export const createConfigUtils = (config: AnyConfig) => {
  const sortModifiers = createSortModifiers(config);
  const postfixLookupClassGroupIds = createPostfixLookupClassGroupIds(config);
  const {getClassGroupId, getConflictingClassGroupIds} = createClassGroupUtils(config);

  // Two-generation per-token descriptor LRU.
  let descriptorCache: Record<string, ClassDescriptor> = Object.create(null);
  let previousDescriptorCache: Record<string, ClassDescriptor> = Object.create(null);
  let descriptorCacheSize = 0;

  // Generation-stamped Int32Array conflict table (avoids per-call Set).
  let claimedGeneration = new Int32Array(256);
  let currentGeneration = 0;

  let keepFlags = new Uint8Array(64);
  let splitSawNonSpaceWhitespace = false;

  /** Split on ASCII whitespace without a trim/regex pass. */
  const splitClassList = (classList: string): string[] => {
    const tokens: string[] = [];
    const length = classList.length;
    let tokenStart = -1;
    splitSawNonSpaceWhitespace = false;

    for (let index = 0; index < length; index++) {
      const charCode = classList.charCodeAt(index);

      if (charCode === 32) {
        if (tokenStart !== -1) {
          tokens.push(classList.slice(tokenStart, index));
          tokenStart = -1;
        }
      } else if (charCode >= 9 && charCode <= 13) {
        splitSawNonSpaceWhitespace = true;
        if (tokenStart !== -1) {
          tokens.push(classList.slice(tokenStart, index));
          tokenStart = -1;
        }
      } else if (tokenStart === -1) {
        tokenStart = index;
      }
    }

    if (tokenStart !== -1) {
      tokens.push(classList.slice(tokenStart));
    }

    return tokens;
  };

  const conflictKeyIds = new Map<string, number>();
  let nextConflictKeyId = 0;
  const internConflictKey = (conflictKey: string): number => {
    let id = conflictKeyIds.get(conflictKey);
    if (id === undefined) {
      id = nextConflictKeyId++;
      conflictKeyIds.set(conflictKey, id);
      if (id >= claimedGeneration.length) {
        const grown = new Int32Array(claimedGeneration.length * 2);
        grown.set(claimedGeneration);
        claimedGeneration = grown;
      }
    }
    return id;
  };

  const computeClassDescriptor = (originalClassName: string): ClassDescriptor => {
    const {
      isExternal,
      modifiers,
      hasImportantModifier,
      baseClassName,
      maybePostfixModifierPosition,
    } = parseClassName(originalClassName);

    if (isExternal) {
      return EXTERNAL_DESCRIPTOR;
    }

    let hasPostfixModifier = Boolean(maybePostfixModifierPosition);
    let classGroupId: ReturnType<typeof getClassGroupId>;

    if (hasPostfixModifier) {
      const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
      classGroupId = getClassGroupId(baseClassNameWithoutPostfix);

      const classGroupIdWithPostfix =
        classGroupId && postfixLookupClassGroupIds[classGroupId]
          ? getClassGroupId(baseClassName)
          : undefined;
      if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
        classGroupId = classGroupIdWithPostfix;
        hasPostfixModifier = false;
      }
    } else {
      classGroupId = getClassGroupId(baseClassName);
    }

    if (!classGroupId) {
      if (!hasPostfixModifier) {
        return EXTERNAL_DESCRIPTOR;
      }

      classGroupId = getClassGroupId(baseClassName);

      if (!classGroupId) {
        return EXTERNAL_DESCRIPTOR;
      }

      hasPostfixModifier = false;
    }

    const variantModifier =
      modifiers.length === 0
        ? ""
        : modifiers.length === 1
          ? modifiers[0]!
          : sortModifiers(modifiers).join(":");

    const modifierId = hasImportantModifier
      ? variantModifier + IMPORTANT_MODIFIER
      : variantModifier;

    const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
    const conflictIds: number[] = [];
    for (let index = 0; index < conflictGroups.length; index++) {
      conflictIds.push(internConflictKey(modifierId + conflictGroups[index]!));
    }

    return {
      isExternal: false,
      classId: internConflictKey(modifierId + classGroupId),
      conflictIds,
    };
  };

  const getClassDescriptor = (originalClassName: string): ClassDescriptor => {
    let descriptor = descriptorCache[originalClassName];
    if (descriptor !== undefined) {
      return descriptor;
    }

    descriptor = previousDescriptorCache[originalClassName];
    if (descriptor === undefined) {
      descriptor = computeClassDescriptor(originalClassName);
    }

    descriptorCache[originalClassName] = descriptor;
    if (++descriptorCacheSize > DESCRIPTOR_CACHE_SIZE) {
      descriptorCacheSize = 0;
      previousDescriptorCache = descriptorCache;
      descriptorCache = Object.create(null);
    }
    return descriptor;
  };

  /** Rightmost class per conflict group wins. */
  const mergeClassList = (classList: string): string => {
    const classNames = splitClassList(classList);
    const classCount = classNames.length;

    if (classCount === 1) {
      return classNames[0]!;
    }

    if (nextConflictKeyId > MAX_CONFLICT_KEYS) {
      conflictKeyIds.clear();
      nextConflictKeyId = 0;
      descriptorCache = Object.create(null);
      previousDescriptorCache = Object.create(null);
      descriptorCacheSize = 0;
    }

    currentGeneration = (currentGeneration + 1) | 0;
    // Skip 0 so fresh arrays never look "claimed" after int32 wrap.
    if (currentGeneration === 0) currentGeneration = 1;
    const generation = currentGeneration;

    if (classCount > keepFlags.length) {
      let capacity = keepFlags.length;
      while (capacity < classCount) capacity *= 2;
      keepFlags = new Uint8Array(capacity);
    }

    let didDrop = false;
    let tokenCharCount = 0;
    for (let index = classCount - 1; index >= 0; index -= 1) {
      const className = classNames[index]!;
      tokenCharCount += className.length;
      const descriptor = getClassDescriptor(className);

      if (descriptor.isExternal) {
        keepFlags[index] = 1;
        continue;
      }

      const classId = descriptor.classId;
      if (claimedGeneration[classId] === generation) {
        keepFlags[index] = 0;
        didDrop = true;
        continue;
      }

      claimedGeneration[classId] = generation;
      const conflictIds = descriptor.conflictIds;
      for (let conflictIndex = 0; conflictIndex < conflictIds.length; conflictIndex++) {
        claimedGeneration[conflictIds[conflictIndex]!] = generation;
      }

      keepFlags[index] = 1;
    }

    // Already normalized and nothing dropped → return input as-is.
    if (
      !didDrop &&
      !splitSawNonSpaceWhitespace &&
      classList.length === tokenCharCount + classCount - 1
    ) {
      return classList;
    }

    let result = "";
    for (let index = 0; index < classCount; index++) {
      if (keepFlags[index] === 1) {
        if (result) result += " ";
        result += classNames[index];
      }
    }

    return result;
  };

  return {
    parseClassName,
    sortModifiers,
    postfixLookupClassGroupIds,
    getClassGroupId,
    getConflictingClassGroupIds,
    getClassDescriptor,
    mergeClassList,
  };
};

const createPostfixLookupClassGroupIds = (config: AnyConfig) => {
  const lookup: Partial<Record<AnyClassGroupIds, true>> = Object.create(null);
  const classGroupIds = config.postfixLookupClassGroups;

  if (classGroupIds) {
    for (let index = 0; index < classGroupIds.length; index++) {
      lookup[classGroupIds[index]!] = true;
    }
  }

  return lookup;
};
