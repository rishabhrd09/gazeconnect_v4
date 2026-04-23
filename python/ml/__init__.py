# GazeConnect Neural Language Model
# Custom CIFG-LSTM for AAC word/sentence prediction
# Built specifically for ALS/MND patients using eye-tracking
#
# Architecture: Coupled Input-Forget Gate LSTM (CIFG-LSTM)
# - 25% fewer parameters than standard LSTM
# - Linear inference complexity O(n)
# - Quantized model size: ~3-5MB
# - Inference latency: <20ms per prediction
#
# Credits:
# - CIFG-LSTM architecture: Greff et al. (2017) "LSTM: A Search Space Odyssey"
# - Kneser-Ney smoothing concepts: Kneser & Ney (1995)
# - AAC corpus design inspired by: Vertanen & Kristensson (2011)
# - ONNX Runtime: Microsoft (https://onnxruntime.ai/)
# - PyTorch: Meta AI (https://pytorch.org/)

__version__ = "1.0.0"
__model_name__ = "GazeConnect-LM"
