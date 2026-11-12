
export function decodeBase64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
}

export async function decodePcmToAudioBuffer(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const audioBuffer = ctx.createBuffer(
        numChannels,
        frameCount,
        sampleRate
    );

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);

        for (let i = 0; i < frameCount; i++) {
            channelData[i] =
                dataInt16[i * numChannels + channel] / 32768;
        }
    }

    return audioBuffer;
}
