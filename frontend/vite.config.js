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
  }
})
