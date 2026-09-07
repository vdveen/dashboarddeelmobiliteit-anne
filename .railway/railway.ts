import {
  defineRailway,
  github,
  database,
  project,
  service,
} from "railway/iac";

// This named partial owns the Voi archive. It does not manage the existing
// dashboard web service in the same Railway project.
export const partial = "voi-vehicle-monitor";

export default defineRailway(() => {
  const storage = database("voi-postgis", "postgres", {
    image: "postgis/postgis:16-3.5",
    defaultMountPath: "/var/lib/postgresql/data",
    region: "europe-west4-drams3a",
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
      restartPolicyType: "ON_FAILURE",
      region: "europe-west4-drams3a",
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
    },
    env: {
      DATABASE_URL: storage.env.DATABASE_URL,
    },
  });

  return project("dashboarddeelmobiliteit", {
    resources: [storage, api, monitor],
  });
});
