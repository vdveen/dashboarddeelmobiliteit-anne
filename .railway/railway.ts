import {
  defineRailway,
  github,
  preserve,
  project,
  service,
} from "railway/iac";

// This named partial owns only the collector. It does not manage the existing
// dashboard web service in the same Railway project.
export const partial = "voi-vehicle-monitor";

export default defineRailway(() => {
  const monitor = service("voi-vehicle-monitor", {
    source: github("vdveen/dashboarddeelmobiliteit-anne", {
      branch: "main",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile.voi-monitor",
      watchPatterns: [
        "Dockerfile.voi-monitor",
        "scripts/collect_voi_vehicles.py",
        "scripts/publish_voi_snapshot.py",
      ],
    },
    deploy: {
      startCommand: "python3 -m scripts.publish_voi_snapshot",
      cronSchedule: "17 * * * *",
      restartPolicyType: "NEVER",
    },
    env: {
      VOI_ARCHIVE_GITHUB_TOKEN: preserve(),
      VOI_ARCHIVE_REPOSITORY: "vdveen/dashboarddeelmobiliteit-anne",
      VOI_ARCHIVE_BRANCH: "voi-vehicle-data",
    },
  });

  return project("dashboarddeelmobiliteit", {
    resources: [monitor],
  });
});
