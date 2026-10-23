import { MixerIcon } from "../../shared/Icon/Icon";
import TrackMixer from "../../dialogs/TrackMixer";
import { PopupButton } from "../../shared/Popup/PopupButton";
import styles from "../Viewport/Viewport.module.css";

export const MixerSettings = () => (
  <PopupButton
    icon={<MixerIcon />}
    className={styles.viewportPanelMixerSettings}
    title="AUDIO MIXER"
    width={520}
  >
    <TrackMixer />
  </PopupButton>
);
