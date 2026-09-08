import {
  defineRailway,
  github,
  image,
  preserve,
  volume,
  project,
  service,
} from "railway/iac";

// This named partial owns the Voi archive. It does not manage the existing
// dashboard web service in the same Railway project.
export const partial = "voi-vehicle-monitor";

export default defineRailway(() => {
  const data = volume("voi-postgis-volume", { region: "europe-west4-drams3a", sizeMB: 5000 });
  const storage = service("voi-postgis", {
    source: image("postgis/postgis:16-3.5"),
    volumeMounts: { "/var/lib/postgresql/data": data },
    deploy: {
      multiRegionConfig: { "europe-west4-drams3a": { numReplicas: 1 } },
      requiredMountPath: "/var/lib/postgresql/data",
    },
    tcp: [5432],
    env: {
      POSTGRES_DB: preserve(), POSTGRES_USER: preserve(), POSTGRES_PASSWORD: preserve(),
      PGDATABASE: preserve(), PGUSER: preserve(), PGPASSWORD: preserve(),
      PGHOST: preserve(), PGPORT: preserve(), DATABASE_URL: preserve(),
      PGDATA: "/var/lib/postgresql/data/postgis16",
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: preserve(), SSL_CERT_DAYS: preserve(),
    },
  });
  // Encrypt external GIS connections. The certificate is regenerated at startup.
  storage.deploy = { ...storage.deploy, startCommand: `sh -c 'openssl req -new -x509 -days 3650 -nodes -subj /CN=voi-postgis -out /tmp/server.crt -keyout /tmp/server.key 2>/dev/null && chmod 600 /tmp/server.key && chown postgres:postgres /tmp/server.key /tmp/server.crt && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key'` };
  const build = {
    builder: "DOCKERFILE" as const,
    dockerfilePath: "Dockerfile.voi-monitor",
    watchPatterns: ["Dockerfile.voi-monitor", "scripts/collect_voi_vehicles.py", "scripts/voi*"],
  };
  const api = service("voi-snapshot-api", {
    source: github("vdveen/dashboarddeelmobiliteit-anne", { branch: "main" }),
    build,
    deploy: {
      startCommand: "gunicorn --bind [::]:8080 --workers 2 --timeout 60 scripts.voi_api:app",
      healthcheckPath: "/health",
      multiRegionConfig: { "europe-west4-drams3a": { numReplicas: 1 } },
    },
    env: { DATABASE_URL: storage.env.DATABASE_URL, PORT: "8080" },
  });
  const monitor = service("voi-vehicle-monitor", {
    source: github("vdveen/dashboarddeelmobiliteit-anne", {
      branch: "main",
    }),
    build,
    deploy: {
      startCommand: "python3 -m scripts.voi_database",
      cronSchedule: "0 * * * *",
      restartPolicyType: "NEVER",
      multiRegionConfig: { "europe-west4-drams3a": { numReplicas: 1 } },
    },
    env: {
      DATABASE_URL: storage.env.DATABASE_URL,
      // Set in the Railway UI. Never commit the key value.
      DASHBOARDDEELMOB_KEY: preserve(),
    },
  });

  return project("dashboarddeelmobiliteit", {
    resources: [data, storage, api, monitor],
  });
});
