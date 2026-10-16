import { useApplicationSettings } from "../hooks/useApplicationSettings";
import { HIGHWAY_SCROLL_SPEED_RANGE } from "../services/settings/schema";
import { Checkbox } from "./shared/Button";
import { SettingsIcon } from "./shared/Icon/Icon";
import { Slider } from "./shared/Slider";
import { Text } from "./shared/Text";
import { PopupButton } from "./PopupButton";

export const ViewportSettings = () => {
  const { settings, applySetting } = useApplicationSettings();

  return (
    <PopupButton
      icon={<SettingsIcon width={20} height={20} />}
      className="viewport-panel__highway-settings"
      title="Viewport Settings"
      width={280}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          padding: "12px",
        }}
      >
        <Text>Antialiasing</Text>
        <Checkbox
          label=""
          checked={settings.graphics.antialiasing}
          onChange={(event) =>
            applySetting("graphics.antialiasing", Boolean(event.target.checked))
          }
        />
        <Text>Scroll Speed</Text>
        <Slider
          aria-label="Scroll speed"
          value={String(settings.graphics.scrollSpeed)}
          onInput={(event) =>
            applySetting(
              "graphics.scrollSpeed",
              Number(event.currentTarget.value),
            )
          }
          step={HIGHWAY_SCROLL_SPEED_RANGE.step}
          min={HIGHWAY_SCROLL_SPEED_RANGE.min}
          max={HIGHWAY_SCROLL_SPEED_RANGE.max}
          width="100%"
        />
      </div>
    </PopupButton>
  );
};
