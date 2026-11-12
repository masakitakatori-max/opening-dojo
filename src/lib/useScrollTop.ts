import { useEffect } from "react";

/** A new screen starts at its top (on a phone the previous screen may have been scrolled far down). */
export function useScrollTop(dep?: unknown) {
  useEffect(() => {
    document.querySelector(".main")?.scrollTo(0, 0);
  }, [dep]);
}
