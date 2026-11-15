interface ImportMeta {
  readonly env: {
    readonly DEV: boolean;
  };
}

declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
