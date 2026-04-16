import os
import shutil

source_dir = r"Smart_rehab_system\model_training\data\inertial"
dest_dir = r"Smart_rehab_system\model_training\data\inertial_filtered"

selected_volunteers = {
    'A': 'A01',
    'B': 'B01',
    'C': 'C01',
    'D': 'D01',
    'E': 'E01',
}

# Valid exercises and gait variations from the paper
valid_exercises = ['KFE', 'HAA', 'SQT', 'EAH', 'EFE', 'SQZ', 'GAT', 'GIS', 'GHT']

copied = 0
skipped = 0

for root, dirs, files in os.walk(source_dir):
    for file in files:
        if not file.endswith('.csv'):
            continue

        group = file[0]
        volunteer_id = file[:3]

        # Skip calibration files by checking if exercise code is valid
        exercise_code = file[3:6]  # e.g., 'KFE', 'HAA', 'CAL' etc.
        if exercise_code not in valid_exercises:
            print(f"Skipped (calib/other): {file}")
            skipped += 1
            continue

        if group in selected_volunteers and volunteer_id == selected_volunteers[group]:
            rel_path = os.path.relpath(root, source_dir)
            dest_subdir = os.path.join(dest_dir, rel_path)
            os.makedirs(dest_subdir, exist_ok=True)

            shutil.copy2(os.path.join(root, file), os.path.join(dest_subdir, file))
            print(f"Copied: {file}")
            copied += 1

print(f"\nTotal files copied : {copied}")
print(f"Total files skipped: {skipped}")
print(f"Saved to: {dest_dir}")