import {expect} from "@jest/globals";

function parseClasses(result: string | string[]) {
  return (typeof result === "string" ? result.split(" ") : result).slice().sort();
}

expect.extend({
  toHaveClass(received, expected) {
    expected = parseClasses(expected);
    received = parseClasses(received);

    return {
      pass: this.equals(expected, received) && expected.length === received.length,
      message: () => {
        return (
          this.utils.matcherHint(
            `${this.isNot ? ".not" : ""}.toHaveClass`,
            "element",
            this.utils.printExpected(expected.join(" ")),
          ) +
          "\n\n" +
          this.utils.printDiffOrStringify(
            expected,
            received,
            "Expected",
            "Received",
            this.expand !== false,
          )
        );
      },
    };
  },
});

declare module "expect" {
  interface Matchers<R> {
    toHaveClass(expected: string | string[]): R;
  }
}
