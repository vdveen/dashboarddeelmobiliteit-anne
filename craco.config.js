module.exports = {
  babel: {
    loaderOptions: {
      // maplibre-gl builds its web worker by string-serialising two functions.
      // If Babel transpiles that file, the destructuring helpers land outside
      // the serialised bodies and the worker throws "i is not defined", which
      // leaves the map blank. Match the absolute path so the guard also holds
      // when the build runs from a copy, worktree or symlinked node_modules.
      ignore: [
        /node_modules[\\/](mapbox-gl|maplibre-gl)[\\/]dist[\\/]/,
      ],
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...(webpackConfig.watchOptions || {}),
        poll: 1000,
      };

      // Load *.md files as raw strings so the Docs pages can bundle
      // their content at build time (no runtime GitHub API calls).
      // Must be inserted into CRA's `oneOf` chain before the
      // fallback asset/resource rule, otherwise markdown files get
      // emitted as static files and `require()` returns a URL.
      const oneOfRule = webpackConfig.module.rules.find((rule) =>
        Array.isArray(rule.oneOf)
      );
      if (oneOfRule) {
        oneOfRule.oneOf.unshift({
          test: /\.md$/,
          type: 'asset/source',
        });
      }

      return webpackConfig;
    },
  },
}
