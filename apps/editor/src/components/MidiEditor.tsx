import { useRef, type ChangeEvent } from 'react';
import { MidiProvider, useMidi } from './MidiContext';
import { Midi } from '@midiedit/core';

function MidiLoader() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Destructure the global state setters from our context hook
    const { setMidiData, setFileName, fileName } = useMidi();

    const triggerFileDialog = (): void => {
        fileInputRef.current?.click();
    };

    const handleFileLoad = (event: ChangeEvent<HTMLInputElement>): void => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // Save the file name globally
        setFileName(file.name);

        const reader = new FileReader();
        reader.readAsDataURL(file); // Reads as Base64 string

        reader.onload = (e) => {
            const rawResult = e.target?.result;
            if (typeof rawResult === 'string') {
                const base64String = rawResult.split(',')[1];

                // Update the global context with the string data
                setMidiData(new Midi(Buffer.from(base64String, 'base64')));
            }
        };
    };

    return (
        <div>
            <button onClick={triggerFileDialog} type="button">
                Open MIDI File
            </button>
            <input
                type="file"
                ref={fileInputRef}
                accept=".mid,.midi"
                onChange={handleFileLoad}
                style={{ display: 'none' }}
            />
            {fileName && <p>Loaded: {fileName}</p>}
        </div>
    );
}

function MidiViewer() {
    // Grab the data directly from the context hook
    const { midiData, fileName } = useMidi();

    if (!midiData) {
        return <p>No MIDI file loaded yet. Use the loader above.</p>;
    }

    return (
        <div>
            <h3>Now Playing Configuration</h3>
            <p><strong>File:</strong> {fileName}</p>
            <p><strong>Memory String length:</strong> {midiData.tracks.length} characters</p>
        </div>
    );
}

function MidiEditor() {

    return (
        <MidiProvider>
            <h1>MIDI Editor</h1>
            <MidiLoader />
            <MidiViewer />
        </MidiProvider>
    );
}

export default MidiEditor;
