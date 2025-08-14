import {
  isEqual,
  isEmptyObject,
  falsyToString,
  mergeObjects,
  removeExtraSpaces,
  flatMergeArrays,
} from "./utils.js";
import {createTwMerge} from "./cn.js";

export const defaultConfig = {
  twMerge: true,
  twMergeConfig: {},
  responsiveVariants: false,
};

export const cnBase = (...classes) => {
  const result = [];

  flat(classes, result);
  let str = "";

  for (let i = 0; i < result.length; i++) {
    if (result[i]) {
      if (str) str += " ";
      str += result[i];
    }
  }

  return str || undefined;
};

function flat(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];

    if (Array.isArray(el)) flat(el, target);
    else if (el) target.push(el);
  }
}

let cachedTwMerge = null;
let cachedTwMergeConfig = {};
let didTwMergeConfigChange = false;

export const cn =
  (...classes) =>
  (config) => {
    const base = cnBase(classes);

    if (!base || !config.twMerge) return base;

    if (!cachedTwMerge || didTwMergeConfigChange) {
      didTwMergeConfigChange = false;
      cachedTwMerge = createTwMerge(cachedTwMergeConfig);
    }

    return cachedTwMerge(base) || undefined;
  };

const joinObjects = (obj1, obj2) => {
  for (const key in obj2) {
    if (key in obj1) {
      obj1[key] = cnBase(obj1[key], obj2[key]);
    } else {
      obj1[key] = obj2[key];
    }
  }

  return obj1;
};

export const tv = (options, configProp) => {
  const {
    extend = null,
    slots: slotProps = {},
    variants: variantsProps = {},
    compoundVariants: compoundVariantsProps = [],
    compoundSlots = [],
    defaultVariants: defaultVariantsProps = {},
  } = options;

  const config = {...defaultConfig, ...configProp};

  const base = extend?.base ? cnBase(extend.base, options?.base) : options?.base;
  const variants =
    extend?.variants && !isEmptyObject(extend.variants)
      ? mergeObjects(variantsProps, extend.variants)
      : variantsProps;
  const defaultVariants =
    extend?.defaultVariants && !isEmptyObject(extend.defaultVariants)
      ? {...extend.defaultVariants, ...defaultVariantsProps}
      : defaultVariantsProps;

  // save twMergeConfig to the cache
  if (!isEmptyObject(config.twMergeConfig) && !isEqual(config.twMergeConfig, cachedTwMergeConfig)) {
    didTwMergeConfigChange = true;
    cachedTwMergeConfig = config.twMergeConfig;
  }

  const isExtendedSlotsEmpty = isEmptyObject(extend?.slots);
  const componentSlots = !isEmptyObject(slotProps)
    ? {
        // add "base" to the slots object
        base: cnBase(options?.base, isExtendedSlotsEmpty && extend?.base),
        ...slotProps,
      }
    : {};

  // merge slots with the "extended" slots
  const slots = isExtendedSlotsEmpty
    ? componentSlots
    : joinObjects(
        {...extend?.slots},
        isEmptyObject(componentSlots) ? {base: options?.base} : componentSlots,
      );

  // merge compoundVariants with the "extended" compoundVariants
  const compoundVariants = isEmptyObject(extend?.compoundVariants)
    ? compoundVariantsProps
    : flatMergeArrays(extend?.compoundVariants, compoundVariantsProps);

  const component = (props) => {
    if (isEmptyObject(variants) && isEmptyObject(slotProps) && isExtendedSlotsEmpty) {
      return cn(base, props?.class, props?.className)(config);
    }

    if (compoundVariants && !Array.isArray(compoundVariants)) {
      throw new TypeError(
        `The "compoundVariants" prop must be an array. Received: ${typeof compoundVariants}`,
      );
    }

    if (compoundSlots && !Array.isArray(compoundSlots)) {
      throw new TypeError(
        `The "compoundSlots" prop must be an array. Received: ${typeof compoundSlots}`,
      );
    }

    const getScreenVariantValues = (screen, screenVariantValue, acc = [], slotKey) => {
      let result = acc;

      if (typeof screenVariantValue === "string") {
        const cleaned = removeExtraSpaces(screenVariantValue);
        const parts = cleaned.split(" ");

        for (let i = 0; i < parts.length; i++) {
          result.push(`${screen}:${parts[i]}`);
        }
      } else if (Array.isArray(screenVariantValue)) {
        for (let i = 0; i < screenVariantValue.length; i++) {
          result.push(`${screen}:${screenVariantValue[i]}`);
        }
      } else if (typeof screenVariantValue === "object" && typeof slotKey === "string") {
        if (slotKey in screenVariantValue) {
          const value = screenVariantValue[slotKey];

          if (value && typeof value === "string") {
            const fixedValue = removeExtraSpaces(value);
            const parts = fixedValue.split(" ");
            const arr = [];

            for (let i = 0; i < parts.length; i++) {
              arr.push(`${screen}:${parts[i]}`);
            }
            result[slotKey] = result[slotKey] ? result[slotKey].concat(arr) : arr;
          } else if (Array.isArray(value) && value.length > 0) {
            const arr = [];

            for (let i = 0; i < value.length; i++) {
              arr.push(`${screen}:${value[i]}`);
            }
            result[slotKey] = arr;
          }
        }
      }

      return result;
    };

    const getVariantValue = (variant, vrs = variants, slotKey = null, slotProps = null) => {
      const variantObj = vrs[variant];

      if (!variantObj || isEmptyObject(variantObj)) {
        return null;
      }

      const variantProp = slotProps?.[variant] ?? props?.[variant];

      if (variantProp === null) return null;

      const variantKey = falsyToString(variantProp);

      // responsive variants
      const responsiveVarsEnabled =
        (Array.isArray(config.responsiveVariants) && config.responsiveVariants.length > 0) ||
        config.responsiveVariants === true;

      let defaultVariantProp = defaultVariants?.[variant];
      let screenValues = [];

      if (typeof variantKey === "object" && responsiveVarsEnabled) {
        for (const [screen, screenVariantKey] of Object.entries(variantKey)) {
          const screenVariantValue = variantObj[screenVariantKey];

          if (screen === "initial") {
            defaultVariantProp = screenVariantKey;
            continue;
          }

          // if the screen is not in the responsiveVariants array, skip it
          if (
            Array.isArray(config.responsiveVariants) &&
            !config.responsiveVariants.includes(screen)
          ) {
            continue;
          }

          screenValues = getScreenVariantValues(screen, screenVariantValue, screenValues, slotKey);
        }
      }

      // If there is a variant key and it's not an object (screen variants),
      // we use the variant key and ignore the default variant.
      const key =
        variantKey != null && typeof variantKey != "object"
          ? variantKey
          : falsyToString(defaultVariantProp);

      const value = variantObj[key || "false"];

      if (
        typeof screenValues === "object" &&
        typeof slotKey === "string" &&
        screenValues[slotKey]
      ) {
        return joinObjects(screenValues, value);
      }

      if (screenValues.length > 0) {
        screenValues.push(value);

        if (slotKey === "base") {
          return screenValues.join(" ");
        }

        return screenValues;
      }

      return value;
    };

    const getVariantClassNames = () => {
      if (!variants) return null;

      const keys = Object.keys(variants);
      const result = [];

      for (let i = 0; i < keys.length; i++) {
        const value = getVariantValue(keys[i], variants);

        if (value) result.push(value);
      }

      return result;
    };

    const getVariantClassNamesBySlotKey = (slotKey, slotProps) => {
      if (!variants || typeof variants !== "object") return null;

      const result = [];

      for (const variant in variants) {
        const variantValue = getVariantValue(variant, variants, slotKey, slotProps);

        const value =
          slotKey === "base" && typeof variantValue === "string"
            ? variantValue
            : variantValue && variantValue[slotKey];

        if (value) result.push(value);
      }

      return result;
    };

    const propsWithoutUndefined = {};

    for (const prop in props) {
      const value = props[prop];

      if (value !== undefined) propsWithoutUndefined[prop] = value;
    }

    const getCompleteProps = (key, slotProps) => {
      const initialProp =
        typeof props?.[key] === "object"
          ? {
              [key]: props[key]?.initial,
            }
          : {};

      return {
        ...defaultVariants,
        ...propsWithoutUndefined,
        ...initialProp,
        ...slotProps,
      };
    };

    const getCompoundVariantsValue = (cv = [], slotProps) => {
      const result = [];
      const cvLength = cv.length;

      for (let i = 0; i < cvLength; i++) {
        const {class: tvClass, className: tvClassName, ...compoundVariantOptions} = cv[i];
        let isValid = true;
        const completeProps = getCompleteProps(null, slotProps);

        for (const key in compoundVariantOptions) {
          const value = compoundVariantOptions[key];
          const completePropsValue = completeProps[key];

          if (Array.isArray(value)) {
            if (!value.includes(completePropsValue)) {
              isValid = false;
              break;
            }
          } else {
            if (
              (value == null || value === false) &&
              (completePropsValue == null || completePropsValue === false)
            )
              continue;

            if (completePropsValue !== value) {
              isValid = false;
              break;
            }
          }
        }

        if (isValid) {
          if (tvClass) result.push(tvClass);
          if (tvClassName) result.push(tvClassName);
        }
      }

      return result;
    };

    const getCompoundVariantClassNamesBySlot = (slotProps) => {
      const compoundClassNames = getCompoundVariantsValue(compoundVariants, slotProps);

      if (!Array.isArray(compoundClassNames)) return compoundClassNames;

      const result = {};
      const cnFn = cn;

      for (let i = 0; i < compoundClassNames.length; i++) {
        const className = compoundClassNames[i];

        if (typeof className === "string" || Array.isArray(className)) {
          result.base = cnFn(result.base, className)(config);
        } else if (typeof className === "object") {
          for (const slot in className) {
            result[slot] = cnFn(result[slot], className[slot])(config);
          }
        }
      }

      return result;
    };

    const getCompoundSlotClassNameBySlot = (slotProps) => {
      if (compoundSlots.length < 1) return null;

      const result = {};
      const completeProps = getCompleteProps(null, slotProps);

      for (let i = 0; i < compoundSlots.length; i++) {
        const {
          slots = [],
          class: slotClass,
          className: slotClassName,
          ...slotVariants
        } = compoundSlots[i];

        if (!isEmptyObject(slotVariants)) {
          let isValid = true;

          for (const key in slotVariants) {
            const completePropsValue = completeProps[key];
            const slotVariantValue = slotVariants[key];

            if (
              completePropsValue === undefined ||
              (Array.isArray(slotVariantValue)
                ? !slotVariantValue.includes(completePropsValue)
                : slotVariantValue !== completePropsValue)
            ) {
              isValid = false;
              break;
            }
          }

          if (!isValid) continue;
        }

        for (let j = 0; j < slots.length; j++) {
          const slotName = slots[j];

          if (!result[slotName]) result[slotName] = [];
          result[slotName].push([slotClass, slotClassName]);
        }
      }

      return result;
    };

    // with slots
    if (!isEmptyObject(slotProps) || !isExtendedSlotsEmpty) {
      const slotsFns = {};

      if (typeof slots === "object" && !isEmptyObject(slots)) {
        const cnFn = cn;

        for (const slotKey in slots) {
          slotsFns[slotKey] = (slotProps) => {
            const compoundVariantClasses = getCompoundVariantClassNamesBySlot(slotProps);
            const compoundSlotClasses = getCompoundSlotClassNameBySlot(slotProps);

            return cnFn(
              slots[slotKey],
              getVariantClassNamesBySlotKey(slotKey, slotProps),
              compoundVariantClasses ? compoundVariantClasses[slotKey] : undefined,
              compoundSlotClasses ? compoundSlotClasses[slotKey] : undefined,
              slotProps?.class,
              slotProps?.className,
            )(config);
          };
        }
      }

      return slotsFns;
    }

    // normal variants
    return cn(
      base,
      getVariantClassNames(),
      getCompoundVariantsValue(compoundVariants),
      props?.class,
      props?.className,
    )(config);
  };

  const getVariantKeys = () => {
    if (!variants || typeof variants !== "object") return;

    return Object.keys(variants);
  };

  component.variantKeys = getVariantKeys();
  component.extend = extend;
  component.base = base;
  component.slots = slots;
  component.variants = variants;
  component.defaultVariants = defaultVariants;
  component.compoundSlots = compoundSlots;
  component.compoundVariants = compoundVariants;

  return component;
};

export const createTV = (configProp) => {
  return (options, config) => tv(options, config ? mergeObjects(configProp, config) : configProp);
};
