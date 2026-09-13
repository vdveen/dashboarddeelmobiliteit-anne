# DEPLOY

Deployment instructions for the Dashboard Deelmobiliteit app.

## Host your own copy (Railway or any Docker host)

The `Dockerfile` builds the frontend and serves it with
[static-web-server](https://static-web-server.net/). The `REACT_APP_*`
variables are baked into the bundle at build time; the build args default to
the public production backend of dashboarddeelmobiliteit.nl, so a plain
`docker build` produces a working app with no configuration.

On [Railway](https://railway.com):

1. Create a new project from your GitHub repo. Railway detects the
   `Dockerfile` automatically.
2. (Optional) Override any of the build args by adding service variables with
   the same names (`REACT_APP_MAIN_API_URL`, `REACT_APP_MDS_URL`,
   `REACT_APP_FUSIONAUTH_URL`, `REACT_APP_FUSIONAUTH_APPLICATION_ID`,
   `REACT_APP_MAPBOX_TOKEN`). Railway passes service variables to declared
   Dockerfile `ARG`s at build time.
3. Under Settings → Networking, generate a public domain and point it at
   **port 80** (the port static-web-server listens on).

Anywhere else:

    docker build -t dashboarddeelmobiliteit .
    docker run -p 8080:80 dashboarddeelmobiliteit

SPA route fallback is preconfigured in the image (`SERVER_FALLBACK_PAGE`), so
deep links like `/stats` work. Other server options can be set via
[environment variables](https://static-web-server.net/configuration/environment-variables/),
e.g. `SERVER_PORT` if your platform requires a different listen port.

Legacy upstream instructions for the Kubernetes/GitLab deployment, the shared
database and its backups are kept in
[docs/audits/legacy/DEPLOY-upstream-legacy.md](docs/audits/legacy/DEPLOY-upstream-legacy.md).
They do not apply to this fork.
