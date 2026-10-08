/** @type {import('next').NextConfig} */
module.exports = {
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/health', destination: `${backend}/health` },
      { source: '/socket.io/', destination: `${backend}/socket.io/` },
      { source: '/socket.io', destination: `${backend}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${backend}/socket.io/:path*` }
    ];
  }
};
