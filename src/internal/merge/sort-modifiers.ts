import type {AnyConfig} from "./types.js";

/**
 * Sorts predefined modifiers alphabetically. Arbitrary and order-sensitive
 * modifiers stay in place, so only the runs between them are sorted.
 */
export const createSortModifiers = (config: AnyConfig) => {
  const orderSensitiveModifiers = new Set(config.orderSensitiveModifiers);

  return (modifiers: readonly string[]): string[] => {
    const result: string[] = [];
    let currentSegment: string[] = [];

    for (let index = 0; index < modifiers.length; index++) {
      const modifier = modifiers[index]!;

      const isArbitrary = modifier[0] === "[";
      const isOrderSensitive = orderSensitiveModifiers.has(modifier);

      if (isArbitrary || isOrderSensitive) {
        if (currentSegment.length > 0) {
          currentSegment.sort();
          for (let segmentIndex = 0; segmentIndex < currentSegment.length; segmentIndex++) {
            result.push(currentSegment[segmentIndex]!);
          }
          currentSegment = [];
        }
        result.push(modifier);
      } else {
        currentSegment.push(modifier);
      }
    }

    if (currentSegment.length > 0) {
      currentSegment.sort();
      for (let segmentIndex = 0; segmentIndex < currentSegment.length; segmentIndex++) {
        result.push(currentSegment[segmentIndex]!);
      }
    }

    return result;
  };
};
