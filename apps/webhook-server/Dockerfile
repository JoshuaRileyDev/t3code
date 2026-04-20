# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.9
WORKDIR /app

COPY package.json ./package.json
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8788

EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8788/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "start"]
