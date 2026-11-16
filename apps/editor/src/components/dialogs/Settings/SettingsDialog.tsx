import { useSettings } from '../../../hooks/useApplication';
import { runAction, runActionAsync } from '../../../platform/actions/execute';
import {
  type ApplicationSettings,
  ApplicationSettingsSchema,
} from '../../../platform/services/settings/schema';
import { Form } from '../../shared';

const SettingsDialog = () => {
  const { settings } = useSettings();

  const close = (): void => {
    runAction('dialog.close-settings');
  };

  const apply = (values: ApplicationSettings): Promise<boolean> => {
    return runActionAsync('settings.apply', values);
  };

  return (
    <Form
      title="Settings"
      schema={ApplicationSettingsSchema}
      values={settings}
      optionsLabel="Settings sections"
      onApply={apply}
      onClose={close}
    />
  );
};

export { SettingsDialog };
