import os
import numpy as np
import pandas as pd
import pickle
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, Dense, Dropout, Masking
from tensorflow.keras.preprocessing.sequence import pad_sequences
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split

# -----------------------------------------
# 1. CONFIGURATION
# -----------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "inertial_filtered")

VALID_EXERCISES = ['KFE', 'HAA', 'SQT', 'EAH', 'EFE', 'SQZ', 'GAT', 'GIS', 'GHT']
FEATURE_COLS = [
    'Gyroscope X (deg/s)',  'Gyroscope Y (deg/s)',  'Gyroscope Z (deg/s)',
    'Accelerometer X (g)',  'Accelerometer Y (g)',  'Accelerometer Z (g)',
    'Magnetometer X (uT)', 'Magnetometer Y (uT)', 'Magnetometer Z (uT)'
]

MAX_SEQ_LEN = 500  # We will downsample and pad to this length
DOWNSAMPLE_FACTOR = 5 # Reduce 5000 lines to ~1000, then take 500

# -----------------------------------------
# 2. DATA LOADING & PREPROCESSING
# -----------------------------------------
def parse_filename(filename):
    name = filename.replace('.csv', '')
    exercise = name[3:6]
    
    parts = name.split('_')
    prefix = parts[0]
    # Performance character (correctness)
    if len(prefix) >= 8:
        performance = prefix[7]
    else:
        performance = "0" 
    
    # Map performance to binary (0 = Correct, others = Incorrect)
    # Note: Adjust mapping based on specific dataset documentation
    is_correct = 1 if performance == '0' else 0
    return exercise, is_correct

sequences = []
labels_ex = []
labels_corr = []

print("Loading data...")
for root, dirs, files in os.walk(DATA_DIR):
    for file in files:
        if not file.endswith('.csv'): continue
        
        exercise, correctness = parse_filename(file)
        if exercise not in VALID_EXERCISES: continue
        
        filepath = os.path.join(root, file)
        try:
            df = pd.read_csv(filepath)
            if df.empty or len(df) < 50: continue
            
            # Select features and downsample
            data = df[FEATURE_COLS].values[::DOWNSAMPLE_FACTOR]
            
            sequences.append(data)
            labels_ex.append(exercise)
            labels_corr.append(correctness)
        except Exception as e:
            print(f"Error loading {file}: {e}")

print(f"Loaded {len(sequences)} sequences.")

# -----------------------------------------
# 3. ENCODING & SCALING
# -----------------------------------------
le_ex = LabelEncoder()
y_ex = le_ex.fit_transform(labels_ex)
y_corr = np.array(labels_corr)

# Flatten for scaler, then reshape back
all_data = np.vstack(sequences)
scaler = StandardScaler()
scaler.fit(all_data)

# Scale each sequence and pad
scaled_sequences = [scaler.transform(s) for s in sequences]
X = pad_sequences(scaled_sequences, maxlen=MAX_SEQ_LEN, dtype='float32', padding='post', truncating='post')

# Split data
X_train, X_test, y_ex_train, y_ex_test, y_corr_train, y_corr_test = train_test_split(
    X, y_ex, y_corr, test_size=0.2, random_state=42, stratify=y_ex
)

# -----------------------------------------
# 4. LSTM MODEL ARCHITECTURE
# -----------------------------------------
input_layer = Input(shape=(MAX_SEQ_LEN, len(FEATURE_COLS)))
masking = Masking(mask_value=0.0)(input_layer)
lstm1 = LSTM(64, return_sequences=True)(masking)
lstm2 = LSTM(64)(lstm1)
dropout = Dropout(0.2)(lstm2)

# Branch 1: Exercise classification
ex_out = Dense(64, activation='relu')(dropout)
ex_out = Dense(len(le_ex.classes_), activation='softmax', name='exercise')(ex_out)

# Branch 2: Correctness prediction
corr_out = Dense(32, activation='relu')(dropout)
corr_out = Dense(1, activation='sigmoid', name='correctness')(corr_out)

model = Model(inputs=input_layer, outputs=[ex_out, corr_out])

model.compile(
    optimizer='adam',
    loss={'exercise': 'sparse_categorical_crossentropy', 'correctness': 'binary_crossentropy'},
    metrics={'exercise': 'accuracy', 'correctness': 'accuracy'}
)

print(model.summary())

# -----------------------------------------
# 5. TRAINING
# -----------------------------------------
print("Starting training...")
history = model.fit(
    X_train, 
    {'exercise': y_ex_train, 'correctness': y_corr_train},
    validation_data=(X_test, {'exercise': y_ex_test, 'correctness': y_corr_test}),
    epochs=20, 
    batch_size=32
)

# -----------------------------------------
# 6. SAVE MODEL & METADATA
# -----------------------------------------
model.save(os.path.join(BASE_DIR, 'rehab_lstm_model.keras'))
metadata = {
    'scaler': scaler,
    'le_ex': le_ex,
    'max_seq_len': MAX_SEQ_LEN,
    'feature_cols': FEATURE_COLS
}
with open(os.path.join(BASE_DIR, 'metadata.pkl'), 'wb') as f:
    pickle.dump(metadata, f)

print("Done! Model and metadata saved.")
