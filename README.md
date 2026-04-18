# Smart Rehab System Dashboard

This project implements an AI-powered rehabilitation monitoring system. It uses an LSTM model to analyze sensor sequence data, classify the exercise type, and assess its correctness.

## Structure
- `/model_training`: Scripts for LSTM model development and training.
- `/backend`: FastAPI server for inference and data management.
- `/frontend`: React-based dashboard for real-time visualization.

## Setup Instructions

### 1. Train the LSTM Model (Optional - Simulation mode available)
If you have the dataset prepared in `model_training/data/inertial_filtered`:
```bash
cd model_training
python lstm_train.py
```
This will generate `rehab_lstm_model.h5` and `metadata.pkl`.

### 2. Start the Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
The backend will run on `http://localhost:8000`. If no model is found, it will start in **Simulation Mode** with mock data.

### 3. Start the Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```
The dashboard will be available at `http://localhost:5173`.

## Features
- **Sequence Analysis**: LSTM model captures temporal patterns in sensor data.
- **Multi-Output Prediction**: Simultaneously predicts exercise type and execution quality.
- **Vibrant Dashboard**: Premium UI with glassmorphism, real-time charts, and activity history.
- **File Analysis**: Upload exercise CSVs to get immediate AI feedback.