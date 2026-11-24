import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  /**
   * Static files in `public/` are served by Next's own handler, which does not
   * go through `app/uploads/[...path]/route.ts`. That handler picks the
   * Content-Type from the file extension, so a non-image object that ends up in
   * the uploads directory (a bucket in production) would be served as, say,
   * `text/html` or `image/svg+xml` — i.e. stored XSS on the app's own origin.
   *
   * The app itself can only ever write JPEG/PNG/WEBP with server-generated
   * names, so reaching this requires write access to the bucket. These headers
   * make it harmless regardless: `nosniff` stops the browser from reinterpreting
   * the bytes, and the sandbox CSP stops an HTML/SVG document from running
   * script even if it is rendered.
   */
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
