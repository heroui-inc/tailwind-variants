import {expect, describe} from "@jest/globals";

import {defineTV} from "../index";

const createTestComponent = defineTV({
  base: "base",
  slots: {
    a: "apples",
    b: "bananas",
  },
  variants: {
    size: {
      small: {
        a: "small-apples",
        b: "small-bananas",
      },
      medium: {
        a: "medium-apples",
        b: "medium-bananas",
      },
      large: {
        a: "large-apples",
        b: "large-bananas",
      },
    },
    rotten: {
      true: {
        a: "rotten-apples",
        b: "rotten-bananas",
      },
      false: {
        a: "fresh-apples",
        b: "fresh-bananas",
      },
    },
  },
  compoundSlots: [
    {
      slots: ["a", "b"],
      size: "medium",
      class: "slot-compound",
    },
  ],
  compoundVariants: [
    {
      disabled: false,
      size: "medium",
      class: {a: "variant-compound"},
    },
  ],
  defaultVariants: {
    size: "medium",
    disabled: false,
  },
});

describe("defineTV", () => {
  it("should define a basic TV component", () => {
    const component = createTestComponent();

    ["a", "b", "base"].forEach((key) => expect(component).toHaveProperty(key));
    expect(component.base()).toStrictEqual("base");
    expect(component.a()).toStrictEqual(
      "apples medium-apples fresh-apples variant-compound slot-compound",
    );
    expect(component.b()).toStrictEqual("bananas medium-bananas fresh-bananas slot-compound");
  });

  it("enables slot overrides", () => {
    const component = createTestComponent({slots: {a: "oranges", b: "pears"}});

    expect(component.a()).toStrictEqual(
      "oranges medium-apples fresh-apples variant-compound slot-compound",
    );
    expect(component.b()).toStrictEqual("pears medium-bananas fresh-bananas slot-compound");
  });

  it("enables variant overrides", () => {
    const component = createTestComponent({
      variants: {size: {medium: {a: "medium-oranges", b: "medium-pears"}}},
    });

    expect(component.a()).toStrictEqual(
      "apples medium-oranges fresh-apples variant-compound slot-compound",
    );
    expect(component.b()).toStrictEqual("bananas medium-pears fresh-bananas slot-compound");
  });

  it("enables compound slot overrides", () => {
    const component = createTestComponent({
      compoundSlots: [{slots: ["a", "b"], size: "medium", class: "slot-element"}],
    });

    expect(component.a()).toStrictEqual(
      "apples medium-apples fresh-apples variant-compound slot-element",
    );
    expect(component.b()).toStrictEqual("bananas medium-bananas fresh-bananas slot-element");
  });

  it("enables compound variant overrides", () => {
    const component = createTestComponent({
      compoundVariants: [{rotten: false, size: "medium", class: {a: "variant-element"}}],
    });

    expect(component.a()).toStrictEqual(
      "apples medium-apples fresh-apples variant-element slot-compound",
    );
    expect(component.b()).toStrictEqual("bananas medium-bananas fresh-bananas slot-compound");
  });

  it("enables default variant overrides", () => {
    const component = createTestComponent({defaultVariants: {size: "small", rotten: true}});

    expect(component.a()).toStrictEqual("apples small-apples rotten-apples");
    expect(component.b()).toStrictEqual("bananas small-bananas rotten-bananas");
  });

  it("passes props to the component", () => {
    const component = createTestComponent({}, {size: "large", rotten: true});

    expect(component.a()).toStrictEqual("apples large-apples rotten-apples");
    expect(component.b()).toStrictEqual("bananas large-bananas rotten-bananas");
  });
});
