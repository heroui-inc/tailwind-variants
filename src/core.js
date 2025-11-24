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
      requiredVariants = [],
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

      if (requiredVariants && !Array.isArray(requiredVariants)) {
        throw new TypeError(
          `The "requiredVariants" prop must be an array. Received: ${typeof requiredVariants}`,
        );
      }

      // Validate required variants
      if (requiredVariants && Array.isArray(requiredVariants)) {
        for (let i = 0; i < requiredVariants.length; i++) {
          const requiredVariant = requiredVariants[i];

          if (props?.[requiredVariant] === undefined) {
            throw new Error(
              `Missing required variant: "${requiredVariant}". This variant must be provided.`,
            );
          }
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
    component.requiredVariants = requiredVariants;

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
