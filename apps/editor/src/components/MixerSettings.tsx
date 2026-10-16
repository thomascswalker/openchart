import { VolumeIcon } from "./shared/Icon/Icon";
import TrackMixer from "./dialogs/TrackMixer";
import { PopupButton } from "./PopupButton";

export const MixerSettings = () => (
  <PopupButton
    icon={<VolumeIcon width={20} height={20} />}
    className="viewport-panel__mixer-settings"
    title="Mixer Settings"
    width={520}
  >
    <TrackMixer />
  </PopupButton>
);
