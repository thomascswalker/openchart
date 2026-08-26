import {
    useRef,
    useState,
    type ChangeEvent,
} from 'react';

import { MidiProvider, useMidi } from './MidiContext';
import { Midi } from '@midiedit/core';

import './MidiEditor.css';

function MidiToolbar() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        midiData,
        setMidiData,
        setFileName,
        fileName,
    } = useMidi();

    const triggerFileDialog = (): void => {
        fileInputRef.current?.click();
    };

    const handleFileLoad = (event: ChangeEvent<HTMLInputElement>): void => {
        const files = event.target.files;

        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];

        void file.arrayBuffer().then((data) => {
            setFileName(file.name);
            setMidiData(new Midi(new Uint8Array(data)));
        });
    };

    const handleSave = (): void => {
        if (!midiData) {
            return;
        }

        // TODO:
        // Serialize midiData and save using the existing filename.
        console.log('Save', fileName);
    };

    const handleSaveAs = (): void => {
        if (!midiData) {
            return;
        }

        // TODO:
        // Serialize midiData and prompt the user for a filename/location.
        console.log('Save As');
    };

    return (
        <header className="midi-toolbar">
            <div className="midi-toolbar__actions">
                <button
                    type="button"
                    onClick={triggerFileDialog}
                >
                    Open
                </button>

                <button
                    type="button"
                    disabled={!midiData}
                    onClick={handleSave}
                >
                    Save
                </button>

                <button
                    type="button"
                    disabled={!midiData}
                    onClick={handleSaveAs}
                >
                    Save As
                </button>
            </div>

            <div className="midi-toolbar__file">
                {fileName ?? 'No MIDI file loaded'}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".mid,.midi"
                onChange={handleFileLoad}
                hidden
            />
        </header>
    );
}

interface TrackListProps {
    selectedTrackIndex: number | null;
    onSelectTrack: (index: number) => void;
}

function TrackList({
    selectedTrackIndex,
    onSelectTrack,
}: TrackListProps) {
    const { midiData } = useMidi();

    if (!midiData) {
        return (
            <div className="track-list track-list--empty">
                No MIDI file loaded.
            </div>
        );
    }

    return (
        <div className="track-list">
            {midiData.tracks.map((track, index) => {
                const isSelected = selectedTrackIndex === index;

                return (
                    <div
                        key={index}
                        className={
                            isSelected
                                ? 'track-row track-row--selected'
                                : 'track-row'
                        }
                        onClick={() => onSelectTrack(index)}
                    >
                        <div className="track-row__header">
                            <span className="track-row__number">
                                {index + 1}
                            </span>

                            <span className="track-row__name">
                                {track.name || `Track ${index + 1}`}
                            </span>
                        </div>

                        <div className="track-row__timeline">
                            <span className="track-row__placeholder">
                                Track contents
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface PianoRollProps {
    selectedTrackIndex: number | null;
}

function PianoRoll({
    selectedTrackIndex,
}: PianoRollProps) {
    const { midiData } = useMidi();

    const track =
        midiData && selectedTrackIndex !== null
            ? midiData.tracks[selectedTrackIndex]
            : null;

    return (
        <section className="piano-roll">
            <div className="piano-roll__header">
                <strong>Piano Roll</strong>

                <span>
                    {track
                        ? track.name || `Track ${selectedTrackIndex! + 1}`
                        : 'No track selected'}
                </span>
            </div>

            <div className="piano-roll__body">
                <div className="piano-roll__keyboard">
                    <div>C6</div>
                    <div>C5</div>
                    <div>C4</div>
                    <div>C3</div>
                </div>

                <div className="piano-roll__canvas">
                    Piano roll renderer will go here
                </div>
            </div>
        </section>
    );
}

function MidiWorkspace() {
    const { midiData } = useMidi();

    const [selectedTrackIndex, setSelectedTrackIndex] =
        useState<number | null>(null);

    const selectedTrackIsValid =
        midiData !== null &&
        selectedTrackIndex !== null &&
        selectedTrackIndex < midiData.tracks.length;

    const actualSelectedTrack =
        selectedTrackIsValid
            ? selectedTrackIndex
            : midiData && midiData.tracks.length > 0
                ? 0
                : null;

    return (
        <main className="midi-workspace">
            <section className="arrangement">
                <div className="arrangement__header">
                    <strong>Tracks</strong>

                    {midiData && (
                        <span className="arrangement__metadata">
                            Format {midiData.header.format}
                            {' · '}
                            PPQN {midiData.header.division}
                            {' · '}
                            {midiData.tracks.length} tracks
                        </span>
                    )}
                </div>

                <TrackList
                    selectedTrackIndex={actualSelectedTrack}
                    onSelectTrack={setSelectedTrackIndex}
                />
            </section>

            <PianoRoll
                selectedTrackIndex={actualSelectedTrack}
            />
        </main>
    );
}

function MidiEditor() {
    return (
        <MidiProvider>
            <div className="midi-editor">
                <MidiToolbar />
                <MidiWorkspace />
            </div>
        </MidiProvider>
    );
}

export default MidiEditor;