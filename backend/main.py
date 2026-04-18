import os
import json
import random
import asyncio
import time
from collections import deque

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io

# Import local utility
from model_utils import RehabModel

app = FastAPI(title="Smart Rehab System API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------
# Model Loading
# -----------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "model_training", "rehab_lstm_model.keras")
METADATA_PATH = os.path.join(os.path.dirname(__file__), "..", "model_training", "metadata.pkl")

model = None
try:
    if os.path.exists(MODEL_PATH):
        model = RehabModel(MODEL_PATH, METADATA_PATH)
        print("Model loaded successfully - Production Mode.")
    else:
        print("Model files not found. Running in SIMULATION MODE.")
except Exception as e:
    print(f"Error loading model: {e}. Running in SIMULATION MODE.")

# -----------------------------------------
# Session State (in-memory per server run)
# -----------------------------------------
WINDOW_SIZE = 150          # Number of sensor readings to buffer before running inference
SLIDE_STEP = 50            # Re-infer every N new readings
FEATURE_COLS_ORDER = [
    'Gyroscope X (deg/s)',  'Gyroscope Y (deg/s)',  'Gyroscope Z (deg/s)',
    'Accelerometer X (g)',  'Accelerometer Y (g)',  'Accelerometer Z (g)',
    'Magnetometer X (uT)', 'Magnetometer Y (uT)', 'Magnetometer Z (uT)'
]
EXERCISE_NAMES = {
    'KFE': 'Knee Flexion Extension',
    'HAA': 'Hip Abduction & Adduction',
    'SQT': 'Squat',
    'EAH': 'Elbow Assisted Hip',
    'EFE': 'Elbow Flexion Extension',
    'SQZ': 'Squeeze Exercise',
    'GAT': 'Gait Training',
    'GIS': 'Gait - Incline/Stairs',
    'GHT': 'Gait - High Terrain',
}

session_log = []   # List of completed prediction results

def simulate_prediction(reading_count: int) -> dict:
    """Generate realistic simulated predictions for demo mode."""
    exercises = list(EXERCISE_NAMES.keys())
    ex = random.choice(exercises)
    conf = random.uniform(0.75, 0.99)
    score = random.uniform(0.4, 0.98)
    return {
        "phase": "complete",
        "exercise_code": ex,
        "exercise_name": EXERCISE_NAMES.get(ex, ex),
        "exercise_confidence": round(conf, 3),
        "is_correct": score > 0.6,
        "correctness_score": round(score, 3),
        "reading_count": reading_count,
        "simulation": True,
    }

# -----------------------------------------
# WebSocket — Real-time streaming endpoint
# -----------------------------------------
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    Real-time sensor data WebSocket.

    Client sends JSON sensor readings one by one:
      {"gx": 0.1, "gy": -0.2, "gz": 0.05,
       "ax": 0.98, "ay": 0.01, "az": 0.12,
       "mx": 23.1, "my": -4.5, "mz": 12.0}

    Server responds with phase updates:
      Phase 1 (buffering):   {"phase": "buffering", "progress": 0.45}
      Phase 2 (exercise id): {"phase": "exercise_detected", "exercise_code": "KFE", ...}
      Phase 3 (correctness): {"phase": "complete", "correctness_score": 0.87, ...}
    """
    await websocket.accept()
    buffer = deque(maxlen=WINDOW_SIZE)
    readings_since_last = 0
    last_exercise = None

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            # Handle control messages
            if data.get("type") == "reset":
                buffer.clear()
                readings_since_last = 0
                last_exercise = None
                await websocket.send_text(json.dumps({"phase": "reset", "message": "Session reset"}))
                continue

            # Append new reading to buffer
            reading = [
                data.get("gx", 0), data.get("gy", 0), data.get("gz", 0),
                data.get("ax", 0), data.get("ay", 0), data.get("az", 0),
                data.get("mx", 0), data.get("my", 0), data.get("mz", 0),
            ]
            buffer.append(reading)
            readings_since_last += 1

            progress = len(buffer) / WINDOW_SIZE

            # Phase 1: Not enough data yet → send buffering progress
            if len(buffer) < WINDOW_SIZE:
                await websocket.send_text(json.dumps({
                    "phase": "buffering",
                    "progress": round(progress, 2),
                    "readings": len(buffer),
                    "needed": WINDOW_SIZE,
                }))
                continue

            # Phase 2 & 3: We have enough data AND either first time or slide step reached
            if readings_since_last >= SLIDE_STEP:
                readings_since_last = 0
                seq = np.array(list(buffer))

                if model:
                    # Real LSTM inference
                    try:
                        result = model.predict(seq)
                        ex_code = result["exercise"]
                        ex_conf = result["exercise_confidence"]
                        is_correct = result["is_correct"]
                        corr_score = result["correctness_score"]
                    except Exception as e:
                        await websocket.send_text(json.dumps({"phase": "error", "message": str(e)}))
                        continue
                else:
                    # Simulation
                    sim = simulate_prediction(len(buffer))
                    ex_code = sim["exercise_code"]
                    ex_conf = sim["exercise_confidence"]
                    is_correct = sim["is_correct"]
                    corr_score = sim["correctness_score"]

                # Phase 2 — Exercise detection
                await websocket.send_text(json.dumps({
                    "phase": "exercise_detected",
                    "exercise_code": ex_code,
                    "exercise_name": EXERCISE_NAMES.get(ex_code, ex_code),
                    "exercise_confidence": round(float(ex_conf), 3),
                }))

                # Small delay for "thinking" effect in UI
                await asyncio.sleep(0.4)

                # Phase 3 — Correctness result
                result_entry = {
                    "phase": "complete",
                    "exercise_code": ex_code,
                    "exercise_name": EXERCISE_NAMES.get(ex_code, ex_code),
                    "exercise_confidence": round(float(ex_conf), 3),
                    "is_correct": bool(is_correct),
                    "correctness_score": round(float(corr_score), 3),
                    "timestamp": time.time(),
                }
                session_log.append(result_entry)
                last_exercise = ex_code

                await websocket.send_text(json.dumps(result_entry))

    except WebSocketDisconnect:
        print("Client disconnected from stream.")

# -----------------------------------------
# REST Endpoints
# -----------------------------------------
@app.get("/")
def read_root():
    return {"status": "online", "mode": "Production" if model else "Simulation"}

@app.get("/session/summary")
def get_summary():
    if not session_log:
        return {
            "total_exercises": 0,
            "correct_reps": 0,
            "incorrect_reps": 0,
            "average_score": 0.0,
            "recent_activity": [],
        }
    correct = [r for r in session_log if r["is_correct"]]
    avg = sum(r["correctness_score"] for r in session_log) / len(session_log)
    recent = [
        {
            "exercise": r["exercise_code"],
            "exercise_name": r["exercise_name"],
            "status": "Correct" if r["is_correct"] else "Incorrect",
            "score": r["correctness_score"],
        }
        for r in reversed(session_log[-10:])
    ]
    return {
        "total_exercises": len(session_log),
        "correct_reps": len(correct),
        "incorrect_reps": len(session_log) - len(correct),
        "average_score": round(avg, 3),
        "recent_activity": recent,
    }

@app.post("/session/reset")
def reset_session():
    session_log.clear()
    return {"status": "session reset"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
