import {
  isEqual,
  isEmptyObject,
  falsyToString,
  mergeObjects,
  flatMergeArrays,
  joinObjects,
  cx,
} from "./utils.js";
import {defaultConfig} from "./config.js";
import {state} from "./state.js";

export const getTailwindVariants = (cn) => {
  const tv = (options, configProp) => {
    const {
      extend = null,
      slots: slotProps = {},
      variants: variantsProps = {},
      compoundVariants: compoundVariantsProps = [],
      compoundSlots = [],
      defaultVariants: defaultVariantsProps = {},
    } = options;

    const config = {...defaultConfig, ...configProp};

    const base = extend?.base ? cx(extend.base, options?.base) : options?.base;
    const variants =
      extend?.variants && !isEmptyObject(extend.variants)
        ? mergeObjects(variantsProps, extend.variants)
        : variantsProps;
    const defaultVariants =
      extend?.defaultVariants && !isEmptyObject(extend.defaultVariants)
        ? {...extend.defaultVariants, ...defaultVariantsProps}
        : defaultVariantsProps;

    // save twMergeConfig to the cache
    if (
      !isEmptyObject(config.twMergeConfig) &&
      !isEqual(config.twMergeConfig, state.cachedTwMergeConfig)
    ) {
      state.didTwMergeConfigChange = true;
      state.cachedTwMergeConfig = config.twMergeConfig;
    }

    const isExtendedSlotsEmpty = isEmptyObject(extend?.slots);
    const componentSlots = !isEmptyObject(slotProps)
      ? {
          // add "base" to the slots object
          base: cx(options?.base, isExtendedSlotsEmpty && extend?.base),
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

    const hasSlots = !isEmptyObject(slotProps) || !isExtendedSlotsEmpty;

    // Variant-level slot caching: shared across all component() calls with the same variant combo.
    // Layer 1 (variantCache): variant key → slot closures (skips inner function creation + variant resolution)
    // Layer 2 (stringCache): variant key → resolved class strings (skips tw-merge entirely)
    const variantCache = hasSlots ? new Map() : null;
    const stringCache = hasSlots ? new Map() : null;

    // Collect all prop keys that affect slot output: variant keys + compound variant/slot condition keys.
    // Computed once at definition time, not per call.
    const cacheRelevantKeys = hasSlots
      ? (() => {
          const keys = Object.keys(variants);

          for (let i = 0; i < compoundVariants.length; i++) {
            for (const key in compoundVariants[i]) {
              if (key !== "class" && key !== "className" && !keys.includes(key)) {
                keys.push(key);
              }
            }
          }

          for (let i = 0; i < compoundSlots.length; i++) {
            for (const key in compoundSlots[i]) {
              if (
                key !== "slots" &&
                key !== "class" &&
                key !== "className" &&
                !keys.includes(key)
              ) {
                keys.push(key);
              }
            }
          }

          return keys;
        })()
      : null;

    const serializeVariantProps = hasSlots
      ? (props) => {
          if (!props) return "";

          let key = "";

          for (let i = 0; i < cacheRelevantKeys.length; i++) {
            const value = props[cacheRelevantKeys[i]];

            if (value !== undefined) {
              if (typeof value === "object" && value !== null) {
                key += cacheRelevantKeys[i] + ":" + JSON.stringify(value) + "|";
              } else {
                key += cacheRelevantKeys[i] + ":" + String(value) + "|";
              }
            }
          }

          return key;
        }
      : null;

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

      // Slot cache: check for hit before creating inner functions
      let cacheKey;

      if (hasSlots) {
        cacheKey = serializeVariantProps(props);

        const cachedClosures = variantCache.get(cacheKey);

        if (cachedClosures) {
          let cachedStrings = stringCache.get(cacheKey);

          if (!cachedStrings) {
            cachedStrings = {};

            for (const slotKey in cachedClosures) {
              cachedStrings[slotKey] = cachedClosures[slotKey]();
            }

            stringCache.set(cacheKey, cachedStrings);
          }

          const slotsFns = {};

          for (const slotKey in cachedClosures) {
            slotsFns[slotKey] = (slotProps) =>
              slotProps != null ? cachedClosures[slotKey](slotProps) : cachedStrings[slotKey];
          }

          return slotsFns;
        }
      }

      const getVariantValue = (variant, vrs = variants, _slotKey = null, slotProps = null) => {
        const variantObj = vrs[variant];

        if (!variantObj || isEmptyObject(variantObj)) {
          return null;
        }

        const variantProp = slotProps?.[variant] ?? props?.[variant];

        if (variantProp === null) return null;

        const variantKey = falsyToString(variantProp);

        // If variant key is an object (responsive variants), ignore it as they're no longer supported
        if (typeof variantKey === "object") {
          return null;
        }

        const defaultVariantProp = defaultVariants?.[variant];
        const key = variantKey != null ? variantKey : falsyToString(defaultVariantProp);

        const value = variantObj[key || "false"];

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

          if (typeof className === "string") {
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

      // with slots (cache miss path — closures are computed and cached)
      if (hasSlots) {
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

        // Cache closures and their resolved strings for this variant combo
        variantCache.set(cacheKey, slotsFns);

        const cachedStrings = {};

        for (const slotKey in slotsFns) {
          cachedStrings[slotKey] = slotsFns[slotKey]();
        }

        stringCache.set(cacheKey, cachedStrings);

        // Return with string cache support: no-arg calls skip tw-merge
        const result = {};

        for (const slotKey in slotsFns) {
          result[slotKey] = (slotProps) =>
            slotProps != null ? slotsFns[slotKey](slotProps) : cachedStrings[slotKey];
        }

        return result;
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

  const createTV = (configProp) => {
    return (options, config) => tv(options, config ? mergeObjects(configProp, config) : configProp);
  };

  return {
    tv,
    createTV,
  };
};
