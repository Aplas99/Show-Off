# Launches the OCR service with the project venv's interpreter, regardless of
# which Python/conda environment the shell currently has active.
& "$PSScriptRoot\.venv\Scripts\uvicorn.exe" server:app --host 0.0.0.0 --port 8787
