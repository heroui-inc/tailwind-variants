import {
  AnyClassGroupIds,
  AnyConfig,
  AnyThemeGroupIds,
  ClassGroup,
  ClassValidator,
  Config,
  ThemeGetter,
  ThemeObject,
} from "./types.js";

const concatArrays = <T, U>(array1: readonly T[], array2: readonly U[]): readonly (T | U)[] => {
  const length1 = array1.length;
  const length2 = array2.length;
  const combined: (T | U)[] = new Array(length1 + length2);

  for (let i = 0; i < length1; i++) combined[i] = array1[i]!;
  for (let i = 0; i < length2; i++) combined[length1 + i] = array2[i]!;

  return combined;
};

export interface ClassPartObject {
  nextPart: Map<string, ClassPartObject>;
  validators: ClassValidatorObject[] | null;
  classGroupId: AnyClassGroupIds | undefined; // Always define optional props for consistent shape
}

interface ClassValidatorObject {
  classGroupId: AnyClassGroupIds;
  validator: ClassValidator;
}

// Factory function ensures consistent object shapes
const createClassValidatorObject = (
  classGroupId: AnyClassGroupIds,
  validator: ClassValidator,
): ClassValidatorObject => ({
  classGroupId,
  validator,
});

// Factory ensures consistent ClassPartObject shape
const createClassPartObject = (
  nextPart: Map<string, ClassPartObject> = new Map(),
  validators: ClassValidatorObject[] | null = null,
  classGroupId?: AnyClassGroupIds,
): ClassPartObject => ({
  nextPart,
  validators,
  classGroupId,
});

const CLASS_PART_SEPARATOR = "-";

const EMPTY_CONFLICTS: readonly AnyClassGroupIds[] = [];
// I use two dots here because one dot is used as prefix for class groups in plugins
const ARBITRARY_PROPERTY_PREFIX = "arbitrary..";

export const createClassGroupUtils = (config: AnyConfig) => {
  const classMap = createClassMap(config);
  const {conflictingClassGroups, conflictingClassGroupModifiers} = config;

  const getClassGroupId = (className: string) => {
    if (className[0] === "[" && className[className.length - 1] === "]") {
      return getGroupIdForArbitraryProperty(className);
    }

    const classParts = className.split(CLASS_PART_SEPARATOR);
    // Classes like `-inset-1` produce an empty string as first classPart. We assume that classes for negative values are used correctly and skip it.
    const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
    return getGroupRecursive(classParts, startIndex, classMap);
  };

  const getConflictingClassGroupIds = (
    classGroupId: AnyClassGroupIds,
    hasPostfixModifier: boolean,
  ): readonly AnyClassGroupIds[] => {
    if (hasPostfixModifier) {
      const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
      const baseConflicts = conflictingClassGroups[classGroupId];

      if (modifierConflicts) {
        if (baseConflicts) {
          return concatArrays(baseConflicts, modifierConflicts);
        }
        return modifierConflicts;
      }
      return baseConflicts || EMPTY_CONFLICTS;
    }

    return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
  };

  return {
    getClassGroupId,
    getConflictingClassGroupIds,
  };
};

const getGroupRecursive = (
  classParts: string[],
  startIndex: number,
  classPartObject: ClassPartObject,
): AnyClassGroupIds | undefined => {
  const classPathsLength = classParts.length - startIndex;
  if (classPathsLength === 0) {
    return classPartObject.classGroupId;
  }

  const currentClassPart = classParts[startIndex]!;
  const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);

  if (nextClassPartObject) {
    const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
    if (result) return result;
  }

  const validators = classPartObject.validators;
  if (validators === null) {
    return undefined;
  }

  const classRest =
    startIndex === 0
      ? classParts.join(CLASS_PART_SEPARATOR)
      : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
  const validatorsLength = validators.length;

  for (let index = 0; index < validatorsLength; index++) {
    const validatorObject = validators[index]!;
    if (validatorObject.validator(classRest)) {
      return validatorObject.classGroupId;
    }
  }

  return undefined;
};

/**
 * Get the class group ID for an arbitrary property.
 *
 * @param className - The class name to get the group ID for. Is expected to be string starting with `[` and ending with `]`.
 */
const getGroupIdForArbitraryProperty = (className: string): AnyClassGroupIds | undefined => {
  const content = className.slice(1, -1);
  const colonIndex = content.indexOf(":");
  if (colonIndex === -1) {
    return undefined;
  }
  const property = content.slice(0, colonIndex);
  return property ? ARBITRARY_PROPERTY_PREFIX + property : undefined;
};

/**
 * Exported for testing only
 */
export const createClassMap = (config: Config<AnyClassGroupIds, AnyThemeGroupIds>) => {
  const {theme, classGroups} = config;
  return processClassGroups(classGroups, theme);
};

// Split into separate functions to maintain monomorphic call sites
const processClassGroups = (
  classGroups: Record<AnyClassGroupIds, ClassGroup<AnyThemeGroupIds>>,
  theme: ThemeObject<AnyThemeGroupIds>,
): ClassPartObject => {
  const classMap = createClassPartObject();

  for (const classGroupId in classGroups) {
    const group = classGroups[classGroupId]!;
    processClassesRecursively(group, classMap, classGroupId, theme);
  }

  return classMap;
};

const processClassesRecursively = (
  classGroup: ClassGroup<AnyThemeGroupIds>,
  classPartObject: ClassPartObject,
  classGroupId: AnyClassGroupIds,
  theme: ThemeObject<AnyThemeGroupIds>,
) => {
  const length = classGroup.length;
  for (let index = 0; index < length; index++) {
    const classDefinition = classGroup[index]!;
    processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
  }
};

// Split into separate functions for each type to maintain monomorphic call sites
const processClassDefinition = (
  classDefinition: ClassGroup<AnyThemeGroupIds>[number],
  classPartObject: ClassPartObject,
  classGroupId: AnyClassGroupIds,
  theme: ThemeObject<AnyThemeGroupIds>,
) => {
  if (typeof classDefinition === "string") {
    processStringDefinition(classDefinition, classPartObject, classGroupId);
    return;
  }

  if (typeof classDefinition === "function") {
    processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
    return;
  }

  processObjectDefinition(
    classDefinition as Record<string, ClassGroup<AnyThemeGroupIds>>,
    classPartObject,
    classGroupId,
    theme,
  );
};

const processStringDefinition = (
  classDefinition: string,
  classPartObject: ClassPartObject,
  classGroupId: AnyClassGroupIds,
) => {
  const classPartObjectToEdit =
    classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
  classPartObjectToEdit.classGroupId = classGroupId;
};

const processFunctionDefinition = (
  classDefinition: ClassValidator | ThemeGetter,
  classPartObject: ClassPartObject,
  classGroupId: AnyClassGroupIds,
  theme: ThemeObject<AnyThemeGroupIds>,
) => {
  if (isThemeGetter(classDefinition)) {
    processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
    return;
  }

  if (classPartObject.validators === null) {
    classPartObject.validators = [];
  }
  classPartObject.validators.push(
    createClassValidatorObject(classGroupId, classDefinition as ClassValidator),
  );
};

const processObjectDefinition = (
  classDefinition: Record<string, ClassGroup<AnyThemeGroupIds>>,
  classPartObject: ClassPartObject,
  classGroupId: AnyClassGroupIds,
  theme: ThemeObject<AnyThemeGroupIds>,
) => {
  const entries = Object.entries(classDefinition);
  const length = entries.length;
  for (let index = 0; index < length; index++) {
    const [key, value] = entries[index]!;
    processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
  }
};

const getPart = (classPartObject: ClassPartObject, path: string): ClassPartObject => {
  let current = classPartObject;
  const parts = path.split(CLASS_PART_SEPARATOR);
  const length = parts.length;

  for (let index = 0; index < length; index++) {
    const part = parts[index]!;

    let next = current.nextPart.get(part);
    if (!next) {
      next = createClassPartObject();
      current.nextPart.set(part, next);
    }
    current = next;
  }

  return current;
};

const isThemeGetter = (
  classDefinition: ClassValidator | ThemeGetter,
): classDefinition is ThemeGetter =>
  "isThemeGetter" in classDefinition && (classDefinition as ThemeGetter).isThemeGetter === true;
