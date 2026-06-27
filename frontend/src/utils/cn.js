// cn — small class-name combinator. Filters falsy values then joins
// with a space. Avoids pulling in `clsx` / `classnames` for one helper.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default cn;