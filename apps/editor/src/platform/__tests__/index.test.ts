import { describe, expect, it } from 'vitest';

import { ActionRegistry } from '../actions';
import { ContextStore } from '../context';
import Platform from '../index';
import { FileSystemService } from '../services/filesystem';
import { LoggerService } from '../services/logger';
import { ProjectService } from '../services/project/project';
import { ServiceRegistry } from '../services/registry';
import { SettingsService } from '../services/settings/settings';

describe('Platform', () => {
  it('constructs the registries and registers the service classes', () => {
    expect(Platform.services).toBeInstanceOf(ServiceRegistry);
    expect(Platform.context).toBeInstanceOf(ContextStore);
    expect(Platform.actions).toBeInstanceOf(ActionRegistry);

    expect(Platform.actions.serviceRegistry).toBe(Platform.services);
    expect(Platform.actions.contextStore).toBe(Platform.context);

    expect(Platform.services.get('logger')).toBeInstanceOf(LoggerService);
    expect(Platform.services.get('filesystem')).toBeInstanceOf(
      FileSystemService,
    );
    expect(Platform.services.get('project')).toBeInstanceOf(ProjectService);
    expect(Platform.services.get('settings')).toBeInstanceOf(SettingsService);

    const serviceIds = [
      'project',
      'editor.active-chart-view',
      'editor.clipboard',
      'editor.state',
      'editor.viewports',
      'filesystem',
      'logger',
      'mixer',
      'playback',
      'settings',
    ];
    expect(serviceIds.filter((id) => !Platform.services.has(id))).toEqual([]);
    expect(Platform.actions.hasAction('project.save')).toBe(true);
  });

  it('constructs a project service and initializes a new project', () => {
    const projectService = Platform.services.get<ProjectService>('project');
    expect(projectService).toBeInstanceOf(ProjectService);

    projectService.reset();
    expect(projectService.isDirty).toBe(false);
  });
});
