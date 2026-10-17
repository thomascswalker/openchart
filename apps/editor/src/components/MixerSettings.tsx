import { MixerIcon } from "./shared/Icon/Icon";
import TrackMixer from "./dialogs/TrackMixer";
import { PopupButton } from "./PopupButton";

export const MixerSettings = () => (
  <PopupButton
    icon={<MixerIcon />}
    className="viewport-panel__mixer-settings"
    title="AUDIO MIXER"
    width={520}
  >
    <TrackMixer />
  </PopupButton>
);
