export function resolveConfig(config) {
  // Quick structure validation
  let valid = (() => {
    // `config.content` should exist
    if (!config.content) {
      return false;
    }

    // `config.content` should be an object or an array
    if (
      !Array.isArray(config.content) &&
      !(typeof config.content === "object" && config.content !== null)
    ) {
      return false;
    }

    // When `config.content` is an array, it should consist of FilePaths or RawFiles
    if (Array.isArray(config.content)) {
      return config.content.every((path) => {
        // `path` can be a string
        if (typeof path === "string") return true;

        // `path` can be an object { raw: string, extension?: string }
        return typeof path?.raw === "string" || typeof path === "string";
      });
    }

    // When `config.content` is an object
    if (typeof config.content === "object" && config.content !== null) {
      // Only `files` can exist in `config.content`
      if (!Array.isArray(config.content.files)) {
        return false;
      }

      return config.content.files.every((path) => {
        // `path` can be a string
        return typeof path === "string" || typeof path?.raw === "string";
      });
    }

    return false;
  })();

  if (!valid) {
    // eslint-disable-next-line no-console
    console.warn("invalid-config", [
      "The `content` options are invalid.",
      "Update your configuration file to eliminate this warning.",
    ]);
  }

  // Normalize the `content`
  config.content = {
    files: Array.isArray(config.content.files) ? config.content.files : [],
    relative: config.content.relative ?? false,
    extract: config.content.extract || {},
    transform: config.content.transform || {},
  };

  return config;
}
