from fastapi import FastAPI, UploadFile, File, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import librosa
import numpy as np
import parselmouth
import tempfile
import pickle
import subprocess
import os

def convert_to_wav(input_path):
    tmp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp_wav.close()
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, tmp_wav.name],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return tmp_wav.name

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pragna-ai-bio.github.io",
        "https://pragnic-voice-analyser-github-io.onrender.com",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Voice PD API running"}

@app.options("/{path:path}")
async def preflight(path: str, request: Request):
    return Response(status_code=200)

# Load model once
model = pickle.load(open("pd_model.pkl", "rb"))

def safe_call(*args):
    try:
        return parselmouth.praat.call(*args)
    except:
        return 0.0

def extract_features(filepath, sr=16000):
    y, _ = librosa.load(filepath, sr=sr, mono=True)
    snd = parselmouth.Sound(filepath)

    # Pitch
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=600)
    pitch_values = pitch.selected_array['frequency']
    pitch_values = pitch_values[pitch_values > 0]

    median_pitch = np.median(pitch_values) if len(pitch_values) else 0.0
    mean_pitch   = np.mean(pitch_values)   if len(pitch_values) else 0.0
    std_pitch    = np.std(pitch_values)    if len(pitch_values) else 0.0
    min_pitch    = np.min(pitch_values)    if len(pitch_values) else 0.0
    max_pitch    = np.max(pitch_values)    if len(pitch_values) else 0.0

    point_process = safe_call(snd, "To PointProcess (periodic, cc)", 75, 600)

    jitter_local   = safe_call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_abs     = safe_call(point_process, "Get jitter (local, absolute)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_rap     = safe_call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_ppq5    = safe_call(point_process, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3)
    jitter_ddp     = safe_call(point_process, "Get jitter (ddp)", 0, 0, 0.0001, 0.02, 1.3)

    shimmer_local  = safe_call(point_process, "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_db     = safe_call(point_process, "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq3   = safe_call(point_process, "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq5   = safe_call(point_process, "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq11  = safe_call(point_process, "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_dda    = safe_call(point_process, "Get shimmer (dda)", 0, 0, 0.0001, 0.02, 1.3, 1.6)

    pulses         = safe_call(point_process, "Get number of points")
    periods        = pulses - 1 if pulses > 1 else 0
    mean_period    = safe_call(point_process, "Get mean period", 0, 0, 0.0001, 0.02, 1.3)
    sd_period      = safe_call(point_process, "Get standard deviation of period", 0, 0, 0.0001, 0.02, 1.3)

    ac   = safe_call(snd, "To Harmonicity (ac)", 0.01, 75, 0.1, 1.0)
    nth  = safe_call(snd, "To Noise levels", 75)["nth"] if ac else 0.0
    htn  = safe_call(snd, "To Noise levels", 75)["htn"] if ac else 0.0

    fraction_unvoiced = safe_call(pitch, "Fraction unvoiced frames")
    num_breaks        = safe_call(pitch, "Get number of voice breaks")
    degree_breaks     = safe_call(pitch, "Get degree of voice breaks")

    # Final 26-feature vector
    features = np.array([
        jitter_local, jitter_abs, jitter_rap, jitter_ppq5, jitter_ddp,
        shimmer_local, shimmer_db, shimmer_apq3, shimmer_apq5, shimmer_apq11, shimmer_dda,
        ac, nth, htn,
        median_pitch, mean_pitch, std_pitch, min_pitch, max_pitch,
        pulses, periods, mean_period, sd_period,
        fraction_unvoiced, num_breaks, degree_breaks
    ]).reshape(1, -1)

    return features

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp.flush()
        tmp_path = tmp.name

    try:
        wav_path = convert_to_wav(tmp_path)
        features = extract_features(wav_path)

        prob = model.predict_proba(features)[0][1]
        label = "likely Parkinson’s" if prob > 0.7 else "moderate risk" if prob > 0.4 else "unlikely Parkinson’s"

        return {"score": round(prob, 3), "label": label}

    finally:
        os.remove(tmp_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)
