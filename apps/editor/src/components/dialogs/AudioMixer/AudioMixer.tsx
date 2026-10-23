import { useSnapshot } from "../../../platform";
import { HorizontalSeparator, ResetIcon, Section, Text } from "../../shared";
import type { Track as MixerTrack } from "@openchart/mixer";
import type { MixerSnapshot } from "../../../services/mixer/types";
import styles from "./AudioMixer.module.css";
import { VolumeSlider } from "./VolumeSlider";
import { AudioTrackButton } from "./AudioTrackButton";
import { AudioTrack } from "./AudioTrack";

const AudioMixer = () => {
  const mixer = useSnapshot<MixerSnapshot>("mixer").mixer;
  const hasSoloedTrack = Object.values(mixer.tracks).some(
    (track) => track.soloed,
  );

  const handleMuteClick = (track: MixerTrack) => {
    mixer.toggleMute(track);
  };

  const handleSoloClick = (track: MixerTrack) => {
    mixer.toggleSolo(track);
  };

  const handleVolumeChange = (track: MixerTrack, volume: number) => {
    mixer.setTrackVolume(track, volume);
  };

  const handleMasterVolumeChange = (value: number) => {
    mixer.masterVolume = value;
  };

  return (
    <Section padding={0} gap="0" className={styles["ui-track-mixer"]}>
      <Section
        flexDirection="row"
        minHeight="64px"
        padding={0}
        backgroundColor="var(--neutral-85)"
        className={styles["ui-track-mixer-master-row"]}
      >
        <Section
          paddingLeft="16px"
          paddingRight="16px"
          alignItems="center"
          flexDirection="row"
          className={styles["ui-track-mixer-master-controls"]}
        >
          <Text textAlign="left">MASTER</Text>
          <VolumeSlider
            onChange={handleMasterVolumeChange}
            value={mixer.masterVolume}
          />
          <AudioTrackButton
            type="reset"
            icon={<ResetIcon />}
            ariaLabel="Reset master volume"
            onClick={() => handleMasterVolumeChange(0)}
          />
          <AudioTrackButton
            type="mute"
            checked={mixer.masterMuted}
            onClick={() => mixer.toggleMasterMute()}
          >
            M
          </AudioTrackButton>
        </Section>
      </Section>
      <HorizontalSeparator
        thickness={1}
        width={`calc(100%)`}
        maxWidth="100vw"
        margin={0}
        padding={0}
      />
      <Section
        paddingX="8px"
        paddingY="none"
        gap="0"
        className={styles["ui-track-mixer-track-list"]}
      >
        {Object.keys(mixer.tracks).length === 0 && (
          <Text textAlign="center">No audio tracks loaded</Text>
        )}
        {Object.entries(mixer.tracks).map(([name, track], index) => (
          <AudioTrack
            key={name}
            name={name}
            track={track}
            index={index}
            hasSoloedTrack={hasSoloedTrack}
            masterMuted={mixer.masterMuted}
            onMuteClick={handleMuteClick}
            onSoloClick={handleSoloClick}
            onVolumeChange={handleVolumeChange}
          />
        ))}
      </Section>
    </Section>
  );
};

export { AudioMixer };
