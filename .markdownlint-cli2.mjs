export default {
  config: {
    MD013: false,
    MD024: { siblings_only: true },
  },
  globs: ["**/*.md"],
  ignores: [
    "**/node_modules/**",
    "**/dist/**",
    "**/out/**",
    "**/coverage/**",
    "**/release/**",
    "**/artifacts/**",
  ],
};
