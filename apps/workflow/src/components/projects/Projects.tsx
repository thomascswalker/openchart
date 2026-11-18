import { Box, H2, Text } from '@openchart/core';
import { useEffect, useState } from 'react';

import { listProjects } from '../../services/github/operations';

interface Project {
  id: string;
  title: string;
  url: string;
  closed: boolean;
}

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [restrictedOrganizations, setRestrictedOrganizations] = useState<
    string[]
  >([]);
  const [organizationScopeWarning, setOrganizationScopeWarning] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listProjects()
      .then((data) => {
        if (!cancelled) {
          setProjects(data.projects);
          setRestrictedOrganizations(data.restrictedOrganizations);
          setOrganizationScopeWarning(data.organizationScopeWarning);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load GitHub projects',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box flexDirection="column" gap={8}>
      <H2 level={2}>
        GitHub Projects
      </H2>
      {loading && <Text>Loading projects…</Text>}
      {error && <Text role="alert">{error}</Text>}
      {restrictedOrganizations.map((organization) => (
        <Text role="alert" key={organization}>
          {organization}: organization project access is restricted. An
          organization owner must approve this GitHub OAuth app before its
          Projects can be listed.
        </Text>
      ))}
      {organizationScopeWarning && (
        <Text role="alert">
          Organization memberships could not be listed. Sign out and sign in
          again to grant the read:org permission.
        </Text>
      )}
      {!loading && !error && projects.length === 0 && (
        <Text>No GitHub projects found for your account.</Text>
      )}
      {!loading &&
        !error &&
        projects.map((project) => (
          <Box
            key={project.id}
            alignItems="start"
            gap={8}
            width="100%"
            maxWidth={640}
          >
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit' }}
            >
              {project.title}
            </a>
            {project.closed && <Text disabled>Closed</Text>}
          </Box>
        ))}
    </Box>
  );
};

export default Projects;
