declare const __LYRICFLOW_VERSION__: string;
export const buildVersion =
  typeof __LYRICFLOW_VERSION__ === "undefined"
    ? "development"
    : __LYRICFLOW_VERSION__;
