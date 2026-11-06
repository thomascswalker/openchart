import { Action } from '../../actions';
import { ProjectService, type ServicesAccessor } from '../../services';

export class SaveProjectAsAction extends Action {
  constructor() {
    super({ condition: { 'project.has-tracks': true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const project = accessor.get<ProjectService>('project');
    await project.saveAs();
  }
}
