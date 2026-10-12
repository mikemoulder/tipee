/** @type {import('next').NextConfig} */
const nextConfig = {
  // `@tipee/shared` ships raw TypeScript — its package `exports` point straight
  // at `./src/index.ts` with no build step, so Next has to compile it rather
  // than treat it as a prebuilt dependency. Its relative imports also spell out
  // `.ts`, which Node's type stripping requires and webpack resolves literally.
  transpilePackages: ['@tipee/shared'],
  reactStrictMode: true,
  // The old viewers page is now part of the home page.
  async redirects() {
    return [{ source: '/viewers', destination: '/', permanent: true }]
  },
}

export default nextConfig
