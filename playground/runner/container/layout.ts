/** Fixed Linux paths every worker sees inside its container. Host paths never leak in. */
export const CONTAINER_LAYOUT = {
  home: "/dsh/home",
  workspace: "/dsh/workspace",
  native: "/dsh/native",
  tmp: "/dsh/tmp",
  runtime: "/dsh/runtime",
} as const;
