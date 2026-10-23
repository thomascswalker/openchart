import { MixerIcon } from "../../shared";
import { AudioMixer } from "../../dialogs/AudioMixer/AudioMixer";
import styles from "../Viewport/Viewport.module.css";
import { PopupButton } from "../../shared/Popup";

export const MixerSettings = () => (
  <PopupButton
    icon={<MixerIcon />}
    className={styles.viewportPanelMixerSettings}
    title="AUDIO MIXER"
    width={520}
  >
    <AudioMixer />
  </PopupButton>
);
