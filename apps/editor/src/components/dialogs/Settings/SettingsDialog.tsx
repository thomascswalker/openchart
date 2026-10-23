import { runActionAsync, runAction } from "../../../actions/execute";
import { useSettings } from "../../../hooks/useApplication";
import {
  applicationSettingsSchema,
  type ApplicationSettings,
} from "../../../services/settings/schema";
import { Form } from "../../shared";

const SettingsDialog = () => {
  const { settings } = useSettings();

  const close = (): void => {
    runAction("dialog.close-settings");
  };

  const apply = (values: ApplicationSettings): Promise<boolean> => {
    return runActionAsync("settings.apply", values);
  };

  return (
    <Form
      title="Settings"
      schema={applicationSettingsSchema}
      values={settings}
      optionsLabel="Settings sections"
      onApply={apply}
      onClose={close}
    />
  );
};

export { SettingsDialog };
