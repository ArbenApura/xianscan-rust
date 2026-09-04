# XianScan - official container image
#
# Packages the Linux x86_64 release archive (binary with embedded models, web UI,
# Node.js runtime, and the ONNX Runtime CUDA provider libraries) into a minimal
# Ubuntu 24.04 runtime image.
#
# The build context must contain the release archive:
#
#   gh release download v0.5.0-beta.3 --pattern 'xianscan-linux-x86_64.tar.gz' \
#     --repo ArbenApura/xianscan-rust
#   docker build -t xianscan .
#
# Release workflow (.github/workflows/release.yml) automates this and publishes
# the image to ghcr.io.

FROM ubuntu:24.04

ARG RELEASE_ASSET=xianscan-linux-x86_64.tar.gz
ARG XIANSCAN_VERSION=dev

LABEL org.opencontainers.image.title="xianscan" \
      org.opencontainers.image.description="Local-first translation studio for manga, manhwa, and manhua" \
      org.opencontainers.image.source="https://github.com/ArbenApura/xianscan-rust" \
      org.opencontainers.image.documentation="https://github.com/ArbenApura/xianscan-rust#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${XIANSCAN_VERSION}"

# fontconfig + a fallback font family are required for typesetting / font
# enumeration at runtime; everything else (models, OCR dictionaries, fonts,
# Node.js runtime, web UI) is embedded inside the release binary.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        fontconfig \
        fonts-dejavu-core; \
    fc-cache -f; \
    rm -rf /var/lib/apt/lists/*; \
    groupadd -g 568 app; \
    useradd -u 568 -g 568 -d /config -M -s /usr/sbin/nologin app

WORKDIR /app

COPY ${RELEASE_ASSET} /tmp/
RUN set -eux; \
    tar -xzf "/tmp/${RELEASE_ASSET}" -C /app; \
    rm -f "/tmp/${RELEASE_ASSET}"; \
    chmod 0755 /app/xianscan; \
    mkdir -p /config; \
    chown app:app /config; \
    chown -R root:root /app

# Library, settings (SQLite), and caches are stored under /config.
ENV XDG_DATA_HOME=/config \
    XDG_CACHE_HOME=/config/.cache \
    HOME=/config \
    LD_LIBRARY_PATH=/app:${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}

USER app:app
VOLUME /config
EXPOSE 8124
STOPSIGNAL SIGINT

ENTRYPOINT ["/app/xianscan"]
