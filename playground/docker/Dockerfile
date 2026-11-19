# Playground worker image. The image must run exactly the host DSH version;
# `vp run playground:image` passes it as a build argument.
FROM node:24-slim
ARG DSH_VERSION
RUN test -n "$DSH_VERSION"
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g "@deepseek-ai/dsh@${DSH_VERSION}"
COPY entrypoint.sh /usr/local/bin/dsh-web-entrypoint
RUN chmod 755 /usr/local/bin/dsh-web-entrypoint
ENTRYPOINT ["/usr/local/bin/dsh-web-entrypoint"]
