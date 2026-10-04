export function safeNext(value: unknown) {
  return typeof value === "string" &&
    /^\/control-plane(?:\/[a-z0-9-]+)*$/.test(value)
    ? value
    : "/control-plane";
}
