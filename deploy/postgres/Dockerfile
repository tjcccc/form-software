# Optional OrbStack fallback when Docker Hub image downloads are unavailable.
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-16 && rm -rf /var/lib/apt/lists/*
ENV PATH="/usr/lib/postgresql/16/bin:${PATH}" PGDATA="/var/lib/postgresql/data"
RUN install -d -o postgres -g postgres /var/lib/postgresql/data
COPY --chmod=755 entrypoint.sh /usr/local/bin/formsoftware-postgres
USER postgres
ENTRYPOINT ["formsoftware-postgres"]
