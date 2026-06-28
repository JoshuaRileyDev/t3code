import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { ProjectSettingsPanel } from "../components/settings/ProjectSettingsPanel";

function ProjectSettingsRoute() {
  const { environmentId, projectId } = Route.useParams();
  return (
    <ProjectSettingsPanel
      environmentId={EnvironmentId.make(environmentId)}
      projectId={ProjectId.make(projectId)}
    />
  );
}

export const Route = createFileRoute("/settings/project/$environmentId/$projectId")({
  component: ProjectSettingsRoute,
});
