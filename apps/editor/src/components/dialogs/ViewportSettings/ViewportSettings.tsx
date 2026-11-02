import { useSettings } from "../../../hooks/useApplication";
import { HighwayScrollSpeedRange } from "../../../services/settings/schema";
import { Checkbox, Slider, Text } from "../../shared";

export const ViewportSettings = () => {
  const { settings, applySetting } = useSettings();

  return (
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
        checked={settings.display.antialiasing}
        onChange={(event) =>
          applySetting("display.antialiasing", Boolean(event.target.checked))
        }
      />
      <Text>Scroll Speed</Text>
      <Slider
        aria-label="Scroll speed"
        value={String(settings.display.scrollSpeed)}
        onInput={(event) =>
          applySetting("display.scrollSpeed", Number(event.currentTarget.value))
        }
        step={HighwayScrollSpeedRange.step}
        min={HighwayScrollSpeedRange.min}
        max={HighwayScrollSpeedRange.max}
        width="100%"
      />
    </div>
  );
};
