import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // ── Build-time guard: VITE_API_URL must exist for a production build ───────
  //
  // VITE_* values are inlined by Vite at BUILD time, so a missing VITE_API_URL
  // cannot be corrected by setting it on the server afterwards — the bundle is
  // already baked. Previously axios.helper.js fell back to
  // http://localhost:5000/api/v1 for every build, so a deploy with the variable
  // unset produced a bundle in which every single API call pointed at the
  // visitor's own machine. The build was green, the site loaded, and nothing
  // worked.
  //
  // axios.helper.js also throws if it is somehow reached without a base URL,
  // but that throw only runs in the browser. This check is the one that fails
  // the DEPLOY, which is where a missing environment variable should be caught.
  //
  // loadEnv is required because import.meta.env is not populated with .env
  // files at config time. The env dir is this file's own directory — using
  // import.meta.dirname rather than process.cwd() keeps the config free of
  // Node globals (eslint scopes this project to browser globals) and makes it
  // independent of the directory the build was invoked from.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')

  if (command === 'build' && !env.VITE_API_URL) {
    throw new Error(
      '\n\n  VITE_API_URL is not set — refusing to build.\n\n' +
        '  Vite inlines VITE_* variables at build time, so a bundle built without\n' +
        '  it would ship pointing at http://localhost:5000 and every API call in\n' +
        '  the deployed app would fail.\n\n' +
        "  Set it in your host's build environment, e.g.\n" +
        '    Vercel → Settings → Environment Variables → VITE_API_URL\n' +
        '    VITE_API_URL=https://api.your-domain.com/api/v1\n\n',
    )
  }

  return {
    plugins: [react(), tailwindcss()],

    // The automatic JSX runtime, stated explicitly rather than left to the
    // plugin's defaults. Test files are transformed by Vitest through this same
    // config, and without this they were compiled with the CLASSIC runtime —
    // which needs `React` in scope and fails with "React is not defined" on
    // every .test.jsx. Application code never hit it because those files are
    // handled by the react plugin's own include pattern.
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },

    build: {
      // ── Why chunking is configured by hand ────────────────────────────────
      // Everything shipped as ONE 1.08MB chunk (304KB gzipped), which the build
      // warned about on every run. That single file is downloaded and parsed
      // before anything renders — including recharts, which is only ever needed
      // on /analytics, and the entire authenticated app, which a visitor
      // landing on the marketing page never opens.
      //
      // Route-level React.lazy in App.jsx does most of the work. These manual
      // groups handle the vendor half, where the split is by change-rate: React
      // and the router almost never change, so pinning them in their own chunk
      // keeps them cached across deploys instead of being re-downloaded every
      // time application code moves.
      //
      // manualChunks is a FUNCTION, not the object map Rollup accepts: Vite 8
      // bundles with rolldown, which only supports the function form and fails
      // the build with "manualChunks is not a function" otherwise.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            // The big one, and the most skippable: charts are used on a single
            // route, so this should not be in the initial download at all.
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';

            // Changes only on a framework upgrade.
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }

            // State layer — changes rarely.
            if (id.includes('@reduxjs') || id.includes('react-redux') || id.includes('immer')) {
              return 'vendor-redux';
            }
          },
        },
      },
      // The remaining chunks are genuinely small; keep the warning meaningful
      // rather than silencing it with a large threshold.
      chunkSizeWarningLimit: 600,
    },

    // ── Tests ────────────────────────────────────────────────────────────
    // Vitest rather than plain `node --test`, for one specific reason: the
    // store tests could run under Node because slices import nothing but
    // Redux, but ANY module that reaches utils/axios.helper.js reads
    // import.meta.env at module scope and throws outside a Vite build. That
    // ruled out testing every hook, every api/ client, and every component
    // that fetches — which is to say, all the code where the interesting bugs
    // have actually been.
    //
    // Running through this config (rather than a separate vitest.config.js)
    // means tests resolve modules exactly the way the bundle does. A test that
    // passes against different resolution rules than production uses is
    // testing a different program.
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      // jsdom is heavier than Node's default; a single fork avoids paying
      // environment setup per file on a suite this size.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{js,jsx}'],
        // Excluded because coverage of them is meaningless, not because they
        // do not matter: entry points wire things together, and the long legal
        // pages are static prose.
        exclude: [
          'src/main.jsx',
          'src/test/**',
          'src/**/*.test.{js,jsx}',
          'src/assets/**',
          'src/pages/PrivacyPolicy.jsx',
          'src/pages/TermsAndConditions.jsx',
        ],
      },
    },
  }
})
