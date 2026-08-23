module.exports = {
  apps: [
    {
      name: "http-backend",
      cwd: "./apps/http-backend",
      interpreter: "bun",
      script: "index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      },
    },
    {
      name: "ws-backend",
      cwd: "./apps/ws-backend",
      interpreter: "bun",
      script: "index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
      },
    },
  ],
};
