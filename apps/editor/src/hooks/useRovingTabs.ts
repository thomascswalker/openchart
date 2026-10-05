import { useRef, type KeyboardEvent } from "react";

export function useRovingTabs(
  count: number,
  onSelect: (index: number) => void,
): {
  tabRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onTabKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => void;
} {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    if (
      count === 0 ||
      ![
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : (index +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              count) %
            count;
    onSelect(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  return { tabRefs, onTabKeyDown };
}
