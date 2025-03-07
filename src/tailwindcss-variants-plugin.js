import plugin from "tailwindcss/plugin";

import {tvTransformer, getExtensions} from "./transformer";

// Check if value is a function
const isFunction = (value) => typeof value === "function";

// Plugin implementation
export default plugin(
  // Config function - modifies Tailwind configuration
  function (config) {
    // Get screen breakpoints
    const screens = Object.keys(config.theme?.screens || {});

    // Handle content configuration
    if (!config.content) {
      config.content = {files: []};

      return config;
    }

    // Convert array content to object format
    if (Array.isArray(config.content)) {
      const contentFiles = [...config.content];

      config.content = {
        files: contentFiles,
        transform: {},
      };
    }

    // Ensure transform object exists
    if (!config.content.transform) {
      config.content.transform = {};
    }

    // Get file extensions and set up transformers
    const files = Array.isArray(config.content.files) ? config.content.files : [];
    const extensions = getExtensions(files);

    // Add transformer for each file extension
    extensions.forEach((ext) => {
      const existingTransform = config.content.transform[ext];

      if (isFunction(existingTransform)) {
        // Combine with existing transformer
        const originalTransform = existingTransform;

        config.content.transform[ext] = (content) => {
          return originalTransform(tvTransformer(content, screens));
        };
      } else {
        // Set our transformer
        config.content.transform[ext] = (content) => {
          return tvTransformer(content, screens);
        };
      }
    });

    return config;
  },
);
