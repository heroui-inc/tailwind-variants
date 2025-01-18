import resolveConfig from "tailwindcss/resolveConfig";

import {generateTypes} from "./generator";

const regExp = {
  tv: /tv\s*\(((\([^\)]*?\)|\[[^\]]*?\]|.)*?)\)/gs,
  tvExtend: /extend:\s*\w+(,| )\s*/,
  comment: /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
  blankLine: /^\s*$(?:\r\n?|\n)/gm,
  extension: /\.\w+/g,
};

const isArray = (param) => Array.isArray(param);

const isString = (param) => typeof param === "string";

const isObject = (param) => typeof param === "object";

const isBoolean = (param) => typeof param === "boolean";

const isFunction = (param) => typeof param === "function";

const isEmpty = (param) => {
  if (!param) return true;
  if (isArray(param) && param.length === 0) return true;
  if (isString(param) && param.length === 0) return true;
  if (isObject(param) && Object.keys(param).length === 0) return true;

  return false;
};

const pickByKeys = (target, keys) => {
  const result = {};
  const length = keys.length;
  const hasOwnProp = Object.prototype.hasOwnProperty;

  for (let i = 0; i < length; i++) {
    const key = keys[i];

    if (hasOwnProp.call(target, key)) result[key] = target[key];
  }

  return result;
};

const printError = (message, error) => {
  const newIssueLink = "https://github.com/heroui-inc/tailwind-variants/issues/new/choose";

  /* eslint-disable no-console */
  console.log("\x1b[31m%s\x1b[0m", `${message}: ${error.message}`);
  console.log(`If you think this is an issue, please submit it at ${newIssueLink}`);
  /* eslint-enable no-console */
};

const pipeline = (...funcs) => {
  return (input) => funcs.reduce((acc, func) => func(acc), input);
};

const getCleanContent = (content) => {
  const removeComment = content.replace(regExp.comment, "$1").toString();
  const removeBlankLine = removeComment.replace(regExp.blankLine, "").toString();

  // TODO: support inline tv
  const removeExtend = (match) => match[1].replace(regExp.tvExtend, "").toString();

  return Array.from(removeBlankLine.matchAll(regExp.tv), removeExtend);
};

const getTVObjects = (content) => {
  const tvs = getCleanContent(content);

  if (isEmpty(tvs)) return;

  return tvs.map((tv) => {
    if (!tv.includes("responsiveVariants")) return {};

    /**
     * avoid direct eval
     * @see https://esbuild.github.io/content-types/#direct-eval
     */
    return new Function(`
      const [options, config] = [${tv.toString()}];
      return {options, config};
    `)();
  });
};

const flatClassNames = (classNames) => {
  return classNames
    .flatMap((classNameSet) => classNameSet)
    .toString()
    .replaceAll(",", " ")
    .split(" ");
};

const getSlots = (classNames, screens) => {
  // responsive slot
  let rs = {};

  for (const [slotName, slotClassNames] of Object.entries(classNames)) {
    rs[slotName] = {};
    rs[slotName].original = slotClassNames;

    if (isEmpty(slotClassNames)) continue;

    rs.temp = isArray(slotClassNames) ? flatClassNames(slotClassNames) : slotClassNames.split(" ");

    screens.forEach((screen) => {
      let tempClassNames = "";

      rs.temp.forEach((className) => {
        tempClassNames += `${screen}:${className} `;
      });

      rs[slotName][screen] = tempClassNames.trimEnd();
    });

    delete rs.temp;
  }

  return rs;
};

const getVariants = (classNames, screens) => {
  if (isString(classNames)) return classNames.split(" ");
  if (isArray(classNames)) return flatClassNames(classNames);
  if (isObject(classNames)) return getSlots(classNames, screens);

  return classNames;
};

const transformVariantsByScreens = (variants, screens) => {
  let responsive = {};

  for (const [variantName, variant] of Object.entries(variants)) {
    responsive[variantName] = {};
    if (isEmpty(variant)) continue;

    for (const [variantType, variantClassNames] of Object.entries(variant)) {
      responsive[variantName][variantType] = {};
      responsive[variantName][variantType].original = variantClassNames;

      if (isEmpty(variantClassNames)) continue;

      const formattedClassNames = getVariants(variantClassNames, screens);

      if (isEmpty(formattedClassNames)) continue;

      // slots
      if (!isArray(formattedClassNames)) {
        responsive[variantName][variantType] = formattedClassNames;
        continue;
      }

      // variants
      screens.forEach((screen) => {
        let tempClassNames = "";

        formattedClassNames.forEach((className) => {
          tempClassNames += `${screen}:${className} `;
        });

        responsive[variantName][variantType][screen] = tempClassNames.trimEnd();
      });
    }
  }

  return responsive;
};

const transformContent = ({options, config}, screens) => {
  const variants = options?.variants ?? {};
  const responsiveVariants = config?.responsiveVariants ?? false;

  if (!responsiveVariants || isEmpty(variants)) return;

  // responsiveVariants: true
  if (isBoolean(responsiveVariants)) {
    return transformVariantsByScreens(variants, screens);
  }

  // responsiveVariants: [...]
  if (isArray(responsiveVariants)) {
    return transformVariantsByScreens(variants, responsiveVariants);
  }

  // responsiveVariants: {...}
  if (isObject(responsiveVariants)) {
    const onDemand = [];

    for (const [variantName, onDemandConfig] of Object.entries(responsiveVariants)) {
      if (!onDemandConfig || isEmpty(onDemandConfig)) continue;

      const onDemandVariants = pickByKeys(variants, [variantName]);

      const tv = {
        options: {variants: onDemandVariants},
        config: {responsiveVariants: onDemandConfig},
      };

      onDemand.push(transformContent(tv, screens));
    }

    return onDemand;
  }
};

export const tvTransformer = (content, screens, config) => {
  try {
    const defaultImportPaths = ["tailwind-variants"];

    const importPaths = isArray(config?.aliases)
      ? [...config.aliases, ...defaultImportPaths]
      : defaultImportPaths;
    const containsImportPath = importPaths.some((path) => content.includes(path));

    if (!containsImportPath) return content;

    const tvs = getTVObjects(content);

    if (isEmpty(tvs)) return content;

    const transformed = JSON.stringify(
      tvs.map((tv) => transformContent(tv, screens)),
      undefined,
      2,
    );

    const prefix = "\n/* Tailwind Variants Transformed Content Start\n\n";
    const suffix = "\n\nTailwind Variants Transformed Content End */\n";

    return content.concat(prefix + transformed + suffix);
  } catch (error) {
    printError("Tailwind Variants Transform Failed", error);

    return content;
  }
};

const getExtensions = (files) => {
  const extensions = files
    .map((file) => {
      if (isObject(file) && file.extension) return file.extension;

      let fileExt = file.match(regExp.extension);

      if (!fileExt) {
        fileExt = file.split("{");
        fileExt = fileExt.pop().replace("}", "").split(",");
      }

      return fileExt.map((ext) => ext.replace(".", "").split(".")).flat();
    })
    .flatMap((ext) => ext);

  return Array.from(new Set(extensions)).filter((ext) => ext !== "html");
};

export const withTV = (tailwindConfig, transformerConfig) => {
  let config = resolveConfig(tailwindConfig);

  // generate types
  generateTypes(config.theme);

  // invalid content files
  if (isEmpty(config.content?.files) || !isArray(config.content.files)) return config;

  // with tailwind configured screens
  const transformer = (content) => {
    return tvTransformer(content, Object.keys(config.theme?.screens ?? {}), transformerConfig);
  };

  // custom transform
  const customTransform = config.content.transform;

  // extend transform
  if (isEmpty(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => [ext, transformer]);

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  // extend transform function
  if (isFunction(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => [ext, pipeline(transformer, customTransform)]);

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  // extend transform object
  if (isObject(customTransform)) {
    const extensions = getExtensions(config.content.files);
    const transformEntries = extensions.map((ext) => {
      const validTransform = isFunction(customTransform[ext]);

      return validTransform
        ? [ext, pipeline(transformer, customTransform[ext])]
        : [ext, transformer];
    });

    config.content.transform = Object.fromEntries(transformEntries);

    return config;
  }

  return config;
};
