import os
import numpy as np
import pickle
import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences

class RehabModel:
    def __init__(self, model_path, metadata_path):
        self.model = tf.keras.models.load_model(model_path)
        with open(metadata_path, 'rb') as f:
            metadata = pickle.load(f)
            self.scaler = metadata['scaler']
            self.le_ex = metadata['le_ex']
            self.max_seq_len = metadata['max_seq_len']
            self.feature_cols = metadata['feature_cols']

    def predict(self, raw_data):
        """
        raw_data: List of lists/dict representing sensor readings over time
        """
        # Convert to numpy and select features
        if isinstance(raw_data, list):
            data = np.array(raw_data)
        else:
            data = raw_data

        # Scale
        scaled_data = self.scaler.transform(data)
        
        # Pad/Truncate
        X = pad_sequences([scaled_data], maxlen=self.max_seq_len, dtype='float32', 
                          padding='post', truncating='post')
        
        # Inference
        preds = self.model.predict(X)
        ex_pred = preds[0][0]
        corr_pred = preds[1][0][0]
        
        ex_class = self.le_ex.inverse_transform([np.argmax(ex_pred)])[0]
        ex_conf = float(np.max(ex_pred))
        
        return {
            "exercise": ex_class,
            "exercise_confidence": ex_conf,
            "is_correct": bool(corr_pred > 0.5),
            "correctness_score": float(corr_pred)
        }
