# Build stage: full Debian image has the toolchain better-sqlite3 needs if no prebuilt binary matches.
FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: Node + LibreOffice (previews/PDF) + Python venv for the skill's qa_check.py and render.py.
FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-impress fonts-liberation python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir python-pptx==1.0.2 pillow==12.3.0 pymupdf==1.28.2

WORKDIR /app
COPY --from=build /app /app
ENV PYTHON_BIN=/opt/venv/bin/python \
    DATA_DIR=/var/data \
    PORT=10000
EXPOSE 10000
CMD ["npm", "start"]
