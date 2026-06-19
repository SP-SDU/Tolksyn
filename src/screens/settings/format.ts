export function formatThinkingLevel(value: string) {
  if (value === "xhigh") {
    return "XHigh";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
