import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import seaborn as sns
import matplotlib.pyplot as plt

# -----------------------------------------
# 1. CONFIGURATION
# -----------------------------------------
# Use absolute path relative to script location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "inertial_filtered")

VALID_EXERCISES = ['KFE', 'HAA', 'SQT', 'EAH', 'EFE', 'SQZ', 'GAT', 'GIS', 'GHT']

# Which columns to use as features
FEATURE_COLS = [
    'Gyroscope X (deg/s)',  'Gyroscope Y (deg/s)',  'Gyroscope Z (deg/s)',
    'Accelerometer X (g)',  'Accelerometer Y (g)',  'Accelerometer Z (g)',
    'Magnetometer X (uT)', 'Magnetometer Y (uT)', 'Magnetometer Z (uT)'
]

# -----------------------------------------
# 2. FEATURE EXTRACTION FROM ONE CSV
#    (statistical features per signal)
# -----------------------------------------
def extract_features(df):
    features = []
    for col in FEATURE_COLS:
        if col not in df.columns:
            features.extend([0] * 6)
            continue
        s = df[col].dropna().values
        if len(s) == 0:
            # Handle empty signals by filling with zeros instead of allowing NaN
            features.extend([0] * 6)
        else:
            features.extend([
                np.mean(s),
                np.std(s),
                np.max(s),
                np.min(s),
                np.percentile(s, 25),
                np.percentile(s, 75),
            ])
    return features

# -----------------------------------------
# 3. PARSE FILENAME → LABELS
#    Format: GNNEEELP_S.csv
#    e.g.  : A01KFER0_1.csv
# -----------------------------------------
def parse_filename(filename):
    name = filename.replace('.csv', '')
    group        = name[0]          # A/B/C/D/E
    volunteer    = name[:3]         # A01
    exercise     = name[3:6]        # KFE, HAA ...
    
    # Robust parsing for performance and series
    # Usually GNNEEELP_S or GNNEEE_S
    parts = name.split('_')
    series = parts[-1] if len(parts) > 1 else "1"
    
    prefix = parts[0]
    # If prefix is 8 chars (A01KFER0), performance is at index 7
    # If prefix is 6 chars (A01GHT), performance might be missing (default to 0)
    if len(prefix) >= 8:
        performance = prefix[7]
    else:
        performance = "0" 
        
    return group, volunteer, exercise, performance, series

# -----------------------------------------
# 4. LOAD ALL DATA
# -----------------------------------------
records = []

for root, dirs, files in os.walk(DATA_DIR):
    # Determine limb type from folder path
    path_parts = root.replace("\\", "/").split("/")
    if 'upper' in path_parts:
        limb_type = 'upper'
    elif 'lower' in path_parts:
        limb_type = 'lower'
    else:
        continue

    for file in files:
        if not file.endswith('.csv'):
            continue

        exercise_code = file[3:6]
        if exercise_code not in VALID_EXERCISES:
            continue

        filepath = os.path.join(root, file)

        try:
            df = pd.read_csv(filepath)
            if df.empty or len(df) < 10:
                continue

            group, volunteer, exercise, performance, series = parse_filename(file)
            features = extract_features(df)

            records.append({
                'features'   : features,
                'limb_type'  : limb_type,    # TARGET 1
                'exercise'   : exercise,      # TARGET 2
                'group'      : group,
                'volunteer'  : volunteer,
                'performance': performance,
            })

        except Exception as e:
            print(f"Skipped {file}: {e}")

print(f"\nTotal samples loaded: {len(records)}")

# -----------------------------------------
# 5. BUILD DATAFRAME
# -----------------------------------------
X = np.array([r['features']    for r in records])
y_limb     = [r['limb_type']   for r in records]
y_exercise = [r['exercise']    for r in records]

# Encode string labels to integers
le_limb     = LabelEncoder()
le_exercise = LabelEncoder()

y_limb_enc     = le_limb.fit_transform(y_limb)
y_exercise_enc = le_exercise.fit_transform(y_exercise)

print(f"\nLimb classes     : {le_limb.classes_}")
print(f"Exercise classes : {le_exercise.classes_}")

# -----------------------------------------
# 6. TRAIN / TEST SPLIT
# -----------------------------------------
# Use stratify on exercise type to ensure representation of all movements
X_train, X_test, \
y_limb_train, y_limb_test, \
y_ex_train, y_ex_test = train_test_split(
    X, y_limb_enc, y_exercise_enc,
    test_size=0.2, random_state=42,
    stratify=y_exercise_enc
)

# -----------------------------------------
# 7. TRAIN RANDOM FOREST — LIMB TYPE
# -----------------------------------------
print("\n-- Training Limb Type Classifier --")
rf_limb = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
rf_limb.fit(X_train, y_limb_train)

y_limb_pred = rf_limb.predict(X_test)
print(classification_report(y_limb_test, y_limb_pred,
                             target_names=le_limb.classes_,
                             zero_division=0))

# -----------------------------------------
# 8. TRAIN RANDOM FOREST — EXERCISE TYPE
# -----------------------------------------
print("\n-- Training Exercise Type Classifier --")
rf_exercise = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
rf_exercise.fit(X_train, y_ex_train)

y_ex_pred = rf_exercise.predict(X_test)
print(classification_report(y_ex_test, y_ex_pred,
                             target_names=le_exercise.classes_,
                             zero_division=0))

# -----------------------------------------
# 9. CONFUSION MATRICES
# -----------------------------------------
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Limb confusion matrix
# Use explicit labels to ensure matrix size matches le_limb.classes_
cm_limb = confusion_matrix(y_limb_test, y_limb_pred, labels=np.arange(len(le_limb.classes_)))
sns.heatmap(cm_limb, annot=True, fmt='d', ax=axes[0],
            xticklabels=le_limb.classes_,
            yticklabels=le_limb.classes_,
            cmap='Blues')
axes[0].set_title('Limb Type Classification')
axes[0].set_xlabel('Predicted')
axes[0].set_ylabel('Actual')

# Exercise confusion matrix
cm_ex = confusion_matrix(y_ex_test, y_ex_pred, labels=np.arange(len(le_exercise.classes_)))
sns.heatmap(cm_ex, annot=True, fmt='d', ax=axes[1],
            xticklabels=le_exercise.classes_,
            yticklabels=le_exercise.classes_,
            cmap='Oranges')
axes[1].set_title('Exercise Type Classification')
axes[1].set_xlabel('Predicted')
axes[1].set_ylabel('Actual')

plt.tight_layout()
plt.savefig('confusion_matrices.png', dpi=150)
plt.show()
print("\nConfusion matrices saved to confusion_matrices.png")