import LightningFS from '@isomorphic-git/lightning-fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

import { getAccessToken, getAuthenticatedOctokit } from './githubAuth';

// Web uses IndexedDB-backed LightningFS. A native Tauri FS adapter could replace this for Desktop.
const fs = new LightningFS('openchart-git');

const onAuth = () => ({ username: getAccessToken() ?? '' });

// REST

export const listRepos = async () => {
  const { data } = await getAuthenticatedOctokit().rest.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'updated',
  });
  return data;
};

export const createRepo = async (name: string, isPrivate = true) => {
  const { data } = await getAuthenticatedOctokit().rest.repos.createForAuthenticatedUser({
    name,
    private: isPrivate,
  });
  return data;
};

export const listBranches = async (owner: string, repo: string) => {
  const { data } = await getAuthenticatedOctokit().rest.repos.listBranches({ owner, repo });
  return data;
};

export const createPullRequest = async (
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
) => {
  const { data } = await getAuthenticatedOctokit().rest.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
  });
  return data;
};

// Projects V2 (GraphQL)

export const listProjects = async () => {
  const res = await getAuthenticatedOctokit().graphql<{
    viewer: { projectsV2: { nodes: { id: string; title: string; url: string }[] } };
  }>(`query {
    viewer { projectsV2(first: 50) { nodes { id title url } } }
  }`);
  return res.viewer.projectsV2.nodes;
};

export const listProjectItems = async (projectId: string) => {
  const res = await getAuthenticatedOctokit().graphql<{
    node: { items: { nodes: unknown[] } };
  }>(
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content { ... on Issue { title url } ... on PullRequest { title url } ... on DraftIssue { title } }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
                  ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
                }
              }
            }
          }
        }
      }
    }`,
    { id: projectId },
  );
  return res.node.items.nodes;
};

export const addDraftItem = async (projectId: string, title: string) => {
  const res = await getAuthenticatedOctokit().graphql<{
    addProjectV2DraftIssue: { projectItem: { id: string } };
  }>(
    `mutation($projectId: ID!, $title: String!) {
      addProjectV2DraftIssue(input: { projectId: $projectId, title: $title }) {
        projectItem { id }
      }
    }`,
    { projectId, title },
  );
  return res.addProjectV2DraftIssue.projectItem.id;
};

export const updateItemTextField = async (
  projectId: string,
  itemId: string,
  fieldId: string,
  text: string,
) => {
  await getAuthenticatedOctokit().graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { text: $text }
      }) { projectV2Item { id } }
    }`,
    { projectId, itemId, fieldId, text },
  );
};

// Git

const repoDir = (name: string) => `/${name}`;

export const cloneRepo = (url: string, name: string) =>
  git.clone({ fs, http, dir: repoDir(name), url, singleBranch: true, depth: 1, onAuth });

export const pullRepo = (name: string, author: { name: string; email: string }) =>
  git.pull({ fs, http, dir: repoDir(name), author, singleBranch: true, onAuth });

export const pushRepo = (name: string) =>
  git.push({ fs, http, dir: repoDir(name), onAuth });
