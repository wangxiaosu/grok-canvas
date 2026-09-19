import type { ComponentProps } from "react";

type ControlButtonProps = ComponentProps<"button"> & { href?: undefined };
type ControlLinkProps = ComponentProps<"a"> & { href: string };

/** Neutral tool action. Geometry belongs to the caller; states come from UI tokens. */
export function ControlButton(props: ControlButtonProps | ControlLinkProps) {
  if ("href" in props && props.href != null) {
    return <a data-ui-control="true" {...props} />;
  }
  const { type = "button", ...rest } = props;
  return <button type={type} data-ui-control="true" {...rest} />;
}
