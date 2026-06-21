# Official Playwright image — Chromium + all system libraries are preinstalled,
# matched to our Playwright version (1.61.0). This is the most reliable way to
# run Playwright on Render / any container host.
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# Install dependencies first (better layer caching).
# --ignore-scripts skips our postinstall "playwright install" because the
# browsers already ship inside this base image.
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy source and build TypeScript -> dist/
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HEADLESS=true
# Render provides PORT at runtime; default to 4000 locally.
ENV PORT=4000
EXPOSE 4000

CMD ["npm", "start"]
