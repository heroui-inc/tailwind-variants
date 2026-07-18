import {type TVReturnProps, type TVReturnType, type TVReturnTypeLike, tv} from "../../index.js";

type Assert<T extends true> = T;
type Extends<Left, Right> = Left extends Right ? true : false;

// Case: expose callable components through the minimal TVReturnTypeLike contract.
const component = tv({
  slots: {
    base: "flex",
    label: "font-medium",
  },
  variants: {
    size: {
      sm: {label: "text-sm"},
      lg: {label: "text-lg"},
    },
  },
});

const returnLike: TVReturnTypeLike<any, any> = component;
const variantKeys: Array<"size"> | undefined = component.variantKeys;
const variantMetadata = component.variants.size;
const slotMetadata = component.slots.label;
const compoundMetadata = component.compoundVariants;
const compoundSlotMetadata = component.compoundSlots;

void returnLike;
void variantKeys;
void variantMetadata;
void slotMetadata;
void compoundMetadata;
void compoundSlotMetadata;

// Case: keep every TVReturnProps metadata field on TVReturnType.
type ReturnMetadataContract = Assert<
  Extends<
    keyof TVReturnProps<any, any, any, any, any, any>,
    keyof TVReturnType<any, any, any, any, any, any>
  >
>;

const returnMetadataContract: ReturnMetadataContract = true;

void returnMetadataContract;

// Case: reject plain functions that do not expose tv-compatible metadata.
// @ts-expect-error extend only accepts a tv-compatible component
tv({extend: () => "plain"});
