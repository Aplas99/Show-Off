FROM python:3.11-slim

# System packages required by OpenCV, PaddlePaddle (oneDNN/MKL), and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Default environment settings
ENV PORT=8787
ENV OCR_ENABLE_MKLDNN=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8787

# Use shell form so $PORT provided by Railway is expanded
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT} --access-log"]
