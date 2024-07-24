import asyncio
import websockets
import whisper
from pyannote.audio import Pipeline
import os
import json
import wave
import numpy as np
from datetime import datetime
import tempfile

# Replace 'YOUR_HF_ACCESS_TOKEN' with your actual Hugging Face access token
HF_ACCESS_TOKEN = 'YOUR_HF_ACCESS_TOKEN'

async def audio_handler(websocket, path):
    print("Client connected")
    audio_frames = []

    # Initialize Whisper model and diarization pipeline
    print("Loading Whisper model...")
    model = whisper.load_model("base")
    print("Model loaded.")
    print("Loading diarization pipeline...")
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization", use_auth_token=HF_ACCESS_TOKEN)
    print("Pipeline loaded.")

    while True:
        try:
            data = await websocket.recv()
            audio_frames.append(data)
            print(f"Received audio data chunk of size: {len(data)}")

            # Process audio in real-time
            if len(audio_frames) > 0:
                audio_data = b''.join(audio_frames)

                # Save audio data to a temporary WAV file
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav_file:
                    wav_filename = temp_wav_file.name
                    with wave.open(temp_wav_file, 'wb') as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(44100)
                        wf.writeframes(audio_data)

                # Transcribe audio
                result = model.transcribe(wav_filename)
                transcription = result.get("text", "").strip()
                print("Transcription: ", transcription)

                # Perform diarization
                diarization = pipeline(wav_filename)
                diarization_result = []
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    diarization_result.append(f"Start: {turn.start:.1f}s End: {turn.end:.1f}s Speaker: {speaker}")
                print("Diarization: ", diarization_result)

                # Send results back to the client
                await websocket.send(json.dumps({"text": transcription, "diarization": diarization_result}))

                # Clear audio frames for the next chunk
                audio_frames.clear()

        except websockets.ConnectionClosed:
            print("Connection closed")
            break

async def main():
    print("Starting WebSocket server...")
    async with websockets.serve(audio_handler, "localhost", 8000):
        print("WebSocket server listening on ws://localhost:8000/")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
